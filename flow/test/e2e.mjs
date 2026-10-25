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
  await page.waitForFunction(() => document.querySelectorAll('.chip').length === 1);
  await page.click('#share');
  const url = page.url();
  assert.match(url, /#src=/);
  const { page: shared } = await openPage(browser, url);
  assert.equal(await shared.inputValue('#src'), 'flowchart LR\n  A -->|1. Hello ✓| B');
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
