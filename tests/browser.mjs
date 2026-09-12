/* tests/browser.mjs — drives the real app in a real browser.
 *
 * smoke.mjs proves the graph is correct. This proves the graph reaches the
 * screen: that every section paints, that typing persists through a reload, and
 * that no view throws into the console where nobody is looking.
 *
 *   node tests/browser.mjs
 *
 * Needs Playwright and a Chromium build. It serves the repo itself, so there is
 * nothing to start first and no port to remember.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8123;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0]));
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

/* Playwright may be installed globally rather than as a dependency — this
 * project deliberately has none. Try both before giving up. */
async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return spec.startsWith('/') ? await import(spec) : require(spec);
    } catch { /* try the next one */ }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) {
  console.log('Playwright is not installed — skipping browser tests.');
  console.log('  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const SECTIONS = ['draft0', 'story', 'character', 'world', 'timeline',
  'revelations', 'chapters', 'scenes', 'manuscript', 'audit'];
const HEADINGS = ['Draft 0', 'Story Bible', 'Character Bible', 'World Bible', 'Timeline',
  'Revelation Map', 'Chapter Map', 'Scene Map', 'Manuscript', 'Continuity'];

const results = [];
let passed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed += 1; results.push(`  ok   ${name}`); }
  else { results.push(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); process.exitCode = 1; }
}

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/* Console noise is a test failure. A view that throws silently is worse than a
 * view that does not render — the writer keeps typing into a broken tab. */
const noise = [];
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
page.on('pageerror', (e) => noise.push(`uncaught: ${e.message}`));

try {
  await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle' });
  check('the app boots and paints the navigator',
    await page.locator('.tree-head h1').count() > 0);

  await page.getByRole('button', { name: 'Sample' }).click();
  await page.waitForTimeout(600);

  const projects = await page.locator('.node.project .node-label .name').allTextContents();
  check('the sample seeds all three projects',
    JSON.stringify(projects) === JSON.stringify(['ECHO 2084', 'Future Novel', 'Future Series']),
    `got ${JSON.stringify(projects)}`);

  const tallies = (await page.locator('.score .tally').allTextContents()).join(' ');
  check('the continuity engine reports the two planted contradictions',
    tallies.startsWith('2 contradictions'), `got "${tallies}"`);

  for (const [i, id] of SECTIONS.entries()) {
    await page.locator('.tree-sections .section').nth(i).click();
    await page.waitForTimeout(180);
    const heading = await page.locator('.view-head h2').first().textContent().catch(() => '');
    check(`section "${id}" paints`, heading?.trim() === HEADINGS[i],
      `expected ${HEADINGS[i]}, got ${JSON.stringify(heading)}`);
  }

  /* The single most important behaviour in the whole application: words typed
   * are words still there tomorrow. */
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('scenes')).click();
  await page.waitForTimeout(200);
  await page.locator('.scene-outline .list-item').first().click();
  await page.waitForTimeout(200);
  await page.locator('.prose-area').fill('Probe text written by the browser test.');
  await page.waitForTimeout(900);
  check('the word counter updates while typing',
    (await page.locator('.prose-head .muted').textContent())?.includes('7 words'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('prose survives a reload',
    (await page.locator('.prose-area').inputValue()).startsWith('Probe text'));
  check('the view position survives a reload',
    (await page.locator('.view-head h2').first().textContent())?.trim() === 'Scene Map');

  await page.locator('.node.project .node-label', { hasText: 'Future Series' }).click();
  await page.waitForTimeout(300);
  check('a series exposes its books',
    (await page.locator('.node.book .node-label .name').allTextContents()).length === 3);

  /* Draft 0 extraction: the bridge from unstructured text into the graph. */
  await page.locator('.node.book .node-label', { hasText: 'Book 1' }).click();
  await page.waitForTimeout(250);
  await page.locator('.tree-sections .section').nth(0).click();
  await page.waitForTimeout(250);
  await page.locator('.draft0-area').fill('Wintermark is the city that eats its own archives.');
  await page.locator('.draft0-area').evaluate((el) => { el.focus(); el.setSelectionRange(0, 10); });
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.tree-sections .section').nth(2).click();
  await page.waitForTimeout(250);
  check('selecting text in Draft 0 promotes it into the Character Bible',
    (await page.locator('.list .list-item .name').allTextContents()).includes('Wintermark'));

  check('no view writes errors to the console', noise.length === 0, noise.join('\n       '));
} finally {
  await browser.close();
  server.close();
}

console.log('\nNovel Development Platform — browser tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
