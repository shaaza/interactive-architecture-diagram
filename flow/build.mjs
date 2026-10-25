// Builds the Mermaid Flow Animator.
//   node flow/build.mjs             -> flow/dist/app.js (for flow/index.html)
//   node flow/build.mjs --watch     -> same, rebuilding on change
//   node flow/build.mjs --artifact  -> flow/dist/artifact.html, one self-contained page
//   node flow/build.mjs --site      -> _site/, the static site Netlify publishes

import { build, context } from 'esbuild';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flowDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(flowDir);
const distDir = join(flowDir, 'dist');
const args = new Set(process.argv.slice(2));

const options = (shareLinks) => ({
  entryPoints: [join(flowDir, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  define: { __SHARE_LINKS__: String(shareLinks) },
  logLevel: 'info',
});

async function buildApp() {
  await build({ ...options(true), outfile: join(distDir, 'app.js'), sourcemap: true, minify: true });
}

// The artifact host wraps the page in its own document and strips URL hashes,
// so drop the document wrapper, inline the script and turn share links off.
async function buildArtifact() {
  const result = await build({ ...options(false), write: false, minify: true });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  let html = await readFile(join(flowDir, 'index.html'), 'utf8');
  const wrapper = [
    /<!doctype html>\n/i, /<html[^>]*>\n/, /<head>\n/, /<\/head>\n/, /<body>\n/, /<\/body>\n/, /<\/html>\n?/,
    /<meta charset="utf-8">\n/, /<meta name="viewport"[^>]*>\n/,
  ];
  for (const re of wrapper) {
    if (!re.test(html)) throw new Error(`index.html no longer matches ${re}`);
    html = html.replace(re, '');
  }
  const tag = '<script src="dist/app.js"></script>';
  if (!html.includes(tag)) throw new Error(`index.html is missing ${tag}`);
  html = html.replace(tag, () => `<script>\n${js}</script>`);
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'artifact.html'), html);
  console.log(`wrote ${join(distDir, 'artifact.html')} (${(html.length / 1024).toFixed(0)} KB)`);
}

// The p5 app at the repo root is served as-is next to /flow.
async function buildSite() {
  await buildApp();
  const siteDir = join(rootDir, '_site');
  await rm(siteDir, { recursive: true, force: true });
  await mkdir(join(siteDir, 'flow/dist'), { recursive: true });
  for (const name of await readdir(rootDir)) {
    if (/\.(html|js|css)$/.test(name)) await copyFile(join(rootDir, name), join(siteDir, name));
  }
  await copyFile(join(flowDir, 'index.html'), join(siteDir, 'flow/index.html'));
  for (const name of await readdir(distDir)) {
    if (/^app\.js(\.map)?$/.test(name)) await copyFile(join(distDir, name), join(siteDir, 'flow/dist', name));
  }
  console.log(`wrote ${siteDir}`);
}

if (args.has('--watch')) {
  const ctx = await context({ ...options(true), outfile: join(distDir, 'app.js'), sourcemap: true });
  await ctx.watch();
} else if (args.has('--artifact')) {
  await buildArtifact();
} else if (args.has('--site')) {
  await buildSite();
} else {
  await buildApp();
}
