// Browser smoke test for the built app. Run `npm run build && npm run build:artifact` first.
// Needs Playwright with Chromium available (not a project dependency).
// Set SCREENSHOTS=<dir> to save screenshots.

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Install it, or set NODE_PATH to a global install.');
  process.exit(1);
}

const flowDir = dirname(dirname(fileURLToPath(import.meta.url)));
const shots = process.env.SCREENSHOTS;
const text = (page, id) => page.$eval(`#${id}`, (el) => el.textContent.trim());

async function openPage(browser, url, options = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 }, ...options });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector('#canvas svg');
  return { page, errors };
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

const browser = await chromium.launch();
const appUrl = 'file://' + join(flowDir, 'index.html');

await check('default example renders and plays', async () => {
  const { page, errors } = await openPage(browser, appUrl);
  assert.equal(await text(page, 'status'), '7 steps');
  assert.equal(await page.$$eval('.chip', (c) => c.length), 7);
  await page.waitForTimeout(1200);
  if (shots) await page.screenshot({ path: join(shots, 'light.png') });
  assert.match(await text(page, 'stepMeta'), /^Step [12] of 7$/);
  assert.equal(await page.$$eval('#canvas .fa-static', (p) => p.length), 1, 'one unnumbered edge');
  assert.deepEqual(errors, []);
  await page.close();
});

await check('same-numbered edges play in parallel', async () => {
  const { page } = await openPage(browser, appUrl);
  await page.selectOption('#example', 'Event pipeline fan-out');
  await page.waitForFunction(() => document.querySelector('#stepMeta')?.textContent?.includes('Step 2'), null, { timeout: 8000 });
  assert.equal(await text(page, 'stepMeta'), 'Step 2 of 5 · 3 in parallel');
  assert.equal(await text(page, 'stepTitle'), 'Consume  ·  Consume  ·  Consume');
  await page.close();
});

await check('syntax errors keep the last good diagram', async () => {
  const { page } = await openPage(browser, appUrl);
  await page.fill('#src', 'flowchart LR\n A -->|1. x B');
  await page.waitForFunction(() => !document.querySelector('#error')?.hidden, null, { timeout: 5000 });
  assert.equal(await text(page, 'status'), 'Syntax error, showing last good diagram');
  assert.match(await text(page, 'error'), /Parse error/);
  assert.equal(await page.$$eval('.chip', (c) => c.length), 7);
  await page.close();
});

await check('keyboard steps through and pauses', async () => {
  const { page } = await openPage(browser, appUrl);
  await page.selectOption('#example', 'OAuth login (PKCE)');
  await page.waitForFunction(() => document.querySelectorAll('.chip').length === 9);
  await page.click('#stepNo');
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(2500);
  if (shots) await page.screenshot({ path: join(shots, 'oauth.png') });
  assert.equal(await text(page, 'stepMeta'), 'Step 4 of 9');
  assert.equal(await page.getAttribute('#play', 'aria-label'), 'Play');
  assert.equal(await page.$$eval('#canvas path.fa-done', (p) => p.length), 3);
  assert.equal(await page.$$eval('#canvas path.fa-active', (p) => p.length), 1);
  await page.close();
});

// Screen point at the middle of an arrow, so the click lands on its stroke.
const arrowMidpoint = (page, name) =>
  page.evaluate((label) => {
    const hit = [...document.querySelectorAll('#canvas .fa-hit')].find((h) => h.getAttribute('aria-label') === label);
    const len = hit.getTotalLength();
    const p = hit.getPointAtLength(len / 2);
    const m = hit.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  }, name);

await check('clicking a box shows its type, configuration and deployment', async () => {
  const { page, errors } = await openPage(browser, appUrl);
  await page.click('#canvas g.node[id*="flowchart-GW-"]');
  await page.waitForSelector('#inspector[open]');
  assert.equal(await text(page, 'inspectorTitle'), 'API gateway');
  assert.equal(await text(page, 'inspectorKicker'), 'API gateway');
  const body = await text(page, 'inspectorBody');
  assert.match(body, /API gateway configuration/);
  assert.match(body, /Rate limit\s*100 requests\/min per user/);
  assert.match(body, /Deployment/);
  assert.match(body, /PlatformAWS ECS Fargate/);
  assert.equal(await page.getAttribute('#inspectorBody a[href="https://api.shop.example.com"]', 'target'), '_blank');
  assert.equal(await page.getAttribute('#play', 'aria-label'), 'Play', 'playback pauses while open');
  if (shots) await page.screenshot({ path: join(shots, 'node-popup.png') });
  await page.keyboard.press('Escape');
  assert.equal(await page.$('#inspector[open]'), null);
  await page.waitForFunction(() => document.querySelector('#play')?.getAttribute('aria-label') === 'Pause', null, { timeout: 2000 });
  assert.deepEqual(errors, []);
  await page.close();
});

await check('clicking an arrow shows its endpoint, headers and body', async () => {
  const { page, errors } = await openPage(browser, appUrl);
  await page.waitForFunction(() => document.querySelector('#canvas path.fa-active'));
  await page.click('#play');
  const pt = await arrowMidpoint(page, 'Step 1: POST /checkout');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('#inspector[open]');
  assert.equal(await text(page, 'inspectorTitle'), 'POST /checkout');
  assert.equal(await text(page, 'inspectorKicker'), 'Step 1');
  assert.equal(await text(page, 'inspectorSubtitle'), 'Shopper → API gateway');
  assert.equal(await page.$eval('.dv-endpoint', (e) => e.textContent), 'POST/v1/checkoutHTTPS');
  const body = await text(page, 'inspectorBody');
  assert.match(body, /HeadersAuthorizationBearer <session token>/);
  assert.match(body, /RequestbodycartIdstring/);
  if (shots) await page.screenshot({ path: join(shots, 'edge-popup.png') });

  // Links inside the popup move between boxes and arrows.
  await page.click('.dv-route .dv-node >> nth=1');
  assert.equal(await text(page, 'inspectorTitle'), 'API gateway');
  await page.click('.dv-link:has-text("Verify session")');
  assert.equal(await text(page, 'inspectorTitle'), 'Verify session');
  assert.match(await text(page, 'inspectorBody'), /\/internal\/sessions\/verify/);
  await page.click('#inspectorClose');
  await page.waitForFunction(() => !document.querySelector('#inspector[open]'));
  await page.waitForTimeout(100);
  assert.equal(await page.getAttribute('#play', 'aria-label'), 'Play', 'stays paused if it was paused');
  assert.deepEqual(errors, []);
  await page.close();
});

await check('arrows for later steps cannot be clicked yet', async () => {
  const { page } = await openPage(browser, appUrl);
  await page.waitForFunction(() => document.querySelector('#canvas path.fa-active'));
  await page.click('#play');
  const events = await page.$$eval('#canvas .fa-hit', (hits) => hits.map((h) => getComputedStyle(h).pointerEvents));
  assert.equal(events.length, 9, 'eight numbered arrows (step 6 has two) and one unnumbered');
  assert.equal(events.filter((v) => v === 'none').length, 7, 'only step 1 and the unnumbered arrow are clickable');
  const pt = await arrowMidpoint(page, 'Step 7: Consume');
  await page.mouse.click(pt.x, pt.y);
  assert.equal(await page.$('#inspector[open]'), null);
  await page.close();
});

await check('every box and arrow in every example has details', async () => {
  const { page } = await openPage(browser, appUrl);
  const names = await page.$$eval('#example option', (opts) => opts.map((o) => o.value).filter(Boolean));
  const missing = [];
  for (const name of names) {
    await page.selectOption('#example', name);
    await page.waitForFunction((n) => document.querySelector('#status')?.textContent?.endsWith('steps') && document.querySelectorAll('#canvas g.node').length > 0, name);
    await page.waitForTimeout(300);
    await page.click('#play');
    const nodeCount = await page.$$eval('#canvas g.node', (n) => n.length);
    const seenLinks = new Set();
    for (let i = 0; i < nodeCount; i++) {
      await page.locator('#canvas g.node').nth(i).click({ force: true });
      await page.waitForSelector('#inspector[open]');
      const title = await text(page, 'inspectorTitle');
      if (await page.$('#inspectorBody .dv-hint')) missing.push(`${name}: box ${title}`);
      const linkCount = await page.$$eval('#inspectorBody .dv-link', (l) => l.length);
      for (let j = 0; j < linkCount; j++) {
        if (j > 0) {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('#inspector[open]'));
          await page.locator('#canvas g.node').nth(i).click({ force: true });
          await page.waitForSelector('#inspector[open]');
        }
        await page.locator('#inspectorBody .dv-link').nth(j).click();
        const route = await text(page, 'inspectorSubtitle');
        const label = `${await text(page, 'inspectorKicker')} ${await text(page, 'inspectorTitle')} (${route})`;
        if (!seenLinks.has(label) && (await page.$('#inspectorBody .dv-hint'))) missing.push(`${name}: arrow ${label}`);
        seenLinks.add(label);
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#inspector[open]'));
    }
    const arrows = await page.$$eval('#canvas .fa-hit', (h) => h.length);
    assert.equal(seenLinks.size, arrows, `${name}: reached ${seenLinks.size} of ${arrows} arrows`);
  }
  assert.deepEqual(missing, []);
  await page.close();
});

await check('details errors keep the last good details', async () => {
  const { page } = await openPage(browser, appUrl);
  await page.click('#tabDetails');
  await page.fill('#details', 'nodes:\n  GW: [unclosed');
  await page.waitForFunction(() => !document.querySelector('#detailsError')?.hidden, null, { timeout: 5000 });
  assert.equal(await page.$eval('#tabDetails', (t) => t.classList.contains('has-error')), true);
  await page.fill('#details', 'nodes:\n  GW: { type: cache, engine: Varnish }');
  await page.waitForFunction(() => document.querySelector('#detailsError')?.hidden, null, { timeout: 5000 });
  await page.click('#canvas g.node[id*="flowchart-GW-"]');
  assert.equal(await text(page, 'inspectorKicker'), 'Cache');
  assert.match(await text(page, 'inspectorBody'), /EngineVarnish/);
  await page.close();
});

await check('dark theme renders', async () => {
  const { page, errors } = await openPage(browser, appUrl, { colorScheme: 'dark' });
  await page.waitForTimeout(1200);
  if (shots) await page.screenshot({ path: join(shots, 'dark.png') });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(14, 19, 26)');
  assert.deepEqual(errors, []);
  await page.close();
});

await check('share link round-trips the source', async () => {
  const { page } = await openPage(browser, appUrl);
  await page.fill('#src', 'flowchart LR\n  A -->|1. Hello ✓| B');
  await page.click('#tabDetails');
  await page.fill('#details', 'edges:\n  "1": { endpoint: /héllo }');
  await page.waitForFunction(() => document.querySelectorAll('.chip').length === 1);
  await page.click('#share');
  const url = page.url();
  assert.match(url, /#src=.+&details=/);
  const { page: shared } = await openPage(browser, url);
  assert.equal(await shared.inputValue('#src'), 'flowchart LR\n  A -->|1. Hello ✓| B');
  assert.equal(await shared.inputValue('#details'), 'edges:\n  "1": { endpoint: /héllo }');
  await shared.close();
  await page.close();
});

await check('phone width does not scroll sideways', async () => {
  const { page } = await openPage(browser, appUrl, { viewport: { width: 400, height: 860 } });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 400);
  if (shots) await page.screenshot({ path: join(shots, 'mobile.png'), fullPage: true });
  await page.close();
});

await check('artifact build is self-contained', async () => {
  const body = await readFile(join(flowDir, 'dist/artifact.html'), 'utf8');
  assert.ok(!body.includes('dist/app.js'));
  const dir = await mkdtemp(join(tmpdir(), 'flow-artifact-'));
  const file = join(dir, 'index.html');
  await writeFile(file, `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`);
  const { page, errors } = await openPage(browser, 'file://' + file);
  assert.equal(await text(page, 'status'), '7 steps');
  assert.equal(await page.isHidden('#share'), true);
  assert.deepEqual(errors, []);
  await page.close();
});

await browser.close();
