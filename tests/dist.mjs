/* tests/dist.mjs — the built product, opened the way a buyer opens it.
 *
 * Not served. Loaded straight off the filesystem with a file:// URL, because
 * that is what happens when someone double-clicks a download. Every other test
 * in this repo runs against a server; this is the only one that proves the thing
 * actually being sold works on a desktop with no internet.
 *
 *   node build.mjs && node tests/dist.mjs
 */

import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILE = join(ROOT, 'dist', 'writeline.html');

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return spec.startsWith('/') ? await import(spec) : require(spec); } catch { /* next */ }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) { console.log('Playwright not installed — skipping distribution tests.'); process.exit(0); }

const results = [];
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; results.push(`  ok   ${name}`); }
  else { results.push(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); process.exitCode = 1; }
};

const browser = await pw.chromium.launch();
/* No network at all: if the page reaches for a CDN, a font or an analytics
 * beacon, this fails it. A product sold as "works offline forever" must not
 * quietly depend on someone else's server staying up. */
const context = await browser.newContext({ offline: true });
const page = await context.newPage();

const noise = [];
const requests = [];
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
page.on('pageerror', (e) => noise.push(`uncaught: ${e.message}`));
page.on('request', (r) => { if (!r.url().startsWith('file:')) requests.push(r.url()); });

try {
  const { size } = await stat(FILE);
  check('the distributable is a single file under 1 MB', size < 1024 * 1024,
    `${(size / 1024).toFixed(0)} KB`);

  await page.goto(pathToFileURL(FILE).href, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  check('it opens from file:// with no server', await page.locator('.tree-head h1').count() === 1);
  check('it requests nothing from the network', requests.length === 0, requests.join(', '));

  await page.getByRole('button', { name: 'Load demo', exact: true }).click();
  await page.waitForTimeout(900);
  check('the demo loads offline',
    (await page.locator('.node.project').count()) === 2);
  check('the dashboard computes', await page.locator('.stage-list .stage').count() === 17);

  /* The features a buyer is paying for, exercised in the built file rather than
   * assumed to have survived bundling. */
  const sections = await page.locator('.tree-sections .section').allTextContents();
  const go = async (name) => {
    await page.locator('.tree-sections .section').nth(sections.findIndex((t) => t.includes(name)))
      .click();
    await page.waitForTimeout(300);
  };

  await go('Continuity');
  check('the continuity engine runs in the built file',
    (await page.locator('.score .tally').first().textContent())?.startsWith('2 contradictions'));

  await go('Reader');
  check('the reader simulator draws its curve',
    ((await page.locator('.tension-chart .line').getAttribute('d')) ?? '').length > 20);

  await go('Screenplay');
  await page.getByRole('button', { name: 'Convert to screenplay' }).click();
  await page.waitForTimeout(700);
  check('screenplay conversion works offline',
    /INT\.|EXT\./.test(await page.locator('.script-source').inputValue()));

  await go('Scene Map');
  await page.locator('.scene-outline .list-item').first().click();
  await page.waitForTimeout(250);
  await page.locator('.prose-area').fill('Words typed into the downloaded copy.');
  await page.waitForTimeout(900);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  check('words survive closing and reopening the file',
    (await page.locator('.prose-area').inputValue()).startsWith('Words typed into'));

  check('nothing errors in the built file', noise.length === 0, noise.join('\n       '));
} finally {
  await browser.close();
}

console.log('\nWriteline — distribution tests (file://, offline)\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
