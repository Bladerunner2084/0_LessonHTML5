/* tests/landing.mjs — the marketing site.
 *
 * A landing page is the one artefact where a broken interaction costs a sale
 * rather than a bug report, and nobody ever notices because the visitor simply
 * leaves. So the demo, the pricing toggle and the mobile navigation are tested
 * like any other interface.
 *
 * It also asserts the honesty rules: unbuilt features must be visibly marked,
 * and the page must never claim the product does something it does not.
 *
 *   node tests/landing.mjs
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try { return spec.startsWith('/') ? await import(spec) : require(spec); } catch { /* next */ }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) { console.log('Playwright not installed — skipping landing tests.'); process.exit(0); }

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, 'landing', path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'text/plain' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed += 1; results.push(`  ok   ${name}`); }
  else { results.push(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); process.exitCode = 1; }
};

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const noise = [];
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
page.on('pageerror', (e) => noise.push(`uncaught: ${e.message}`));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });

  check('the hero carries the product name and the tagline',
    /Your writing/.test(await page.locator('h1').innerText())
    && /reader's line/i.test(await page.locator('h1').innerText()));

  check('the page loads no third-party resources',
    (await page.evaluate(() => performance.getEntriesByType('resource')
      .filter((r) => !r.name.startsWith(location.origin)).length)) === 0);

  /* Interactive demo */
  check('the demo offers every system as a tab',
    await page.locator('.demo-tab').count() === 7);
  const first = await page.locator('#demoPanel h3').innerText();
  await page.locator('.demo-tab', { hasText: 'Audit' }).click();
  await page.waitForTimeout(150);
  const audit = await page.locator('#demoPanel').innerText();
  check('clicking a tab changes the panel',
    (await page.locator('#demoPanel h3').innerText()) !== first);
  check('the audit tab shows real findings from the engine',
    /set after she leaves the story/.test(audit) && /23 scenes earlier/.test(audit));
  check('the selected tab is marked for assistive technology',
    await page.locator('.demo-tab[aria-selected="true"]').count() === 1);

  /* Pricing */
  check('four plans are rendered from the data structure',
    await page.locator('.plan').count() === 4);
  check('one plan is flagged most popular',
    await page.locator('.plan.popular .flag').count() === 1);
  const monthly = await page.locator('.plan').nth(2).locator('.price').innerText();
  await page.locator('#yr').click();
  await page.waitForTimeout(150);
  const annual = await page.locator('.plan').nth(2).locator('.price').innerText();
  check('the billing toggle changes the prices', monthly !== annual, `${monthly} vs ${annual}`);
  check('annual pricing is twelve months less the discount',
    annual.startsWith('$374'), annual);
  check('the free plan stays free on either toggle',
    (await page.locator('.plan').first().locator('.price').innerText()).startsWith('$0'));
  await page.locator('#mo').click();
  await page.waitForTimeout(150);

  /* Honesty rules — the reason a buyer does not ask for a refund.
   * textContent, not innerText: the FAQ answers live inside collapsed
   * <details>, and innerText only returns what is currently visible. */
  const body = await page.evaluate(() => document.body.textContent);
  check('unbuilt features are visibly marked as planned',
    await page.locator('.tag-planned').count() >= 3);
  check('planned features are listed as planned inside the plans too',
    await page.locator('.plan li.soon').count() >= 4);
  check('the FAQ states plainly what is not built',
    /What is not built yet\?/.test(body) && /AI layer/.test(body));
  check('the privacy claim is specific rather than reassuring',
    /makes no network requests at all/.test(body));
  check('the page does not claim to write prose for the author',
    /does not write prose for you/.test(body));

  /* Comparison table and FAQ */
  check('the comparison table covers every plan',
    await page.locator('#compareTable thead th').count() === 5);
  check('the FAQ is present and collapsed by default',
    await page.locator('#faq details').count() >= 10
    && await page.locator('#faq details[open]').count() === 0);
  await page.locator('#faq summary').first().click();
  await page.waitForTimeout(120);
  check('an FAQ entry opens when clicked',
    await page.locator('#faq details[open]').count() === 1);

  /* Responsive */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(200);
  check('the desktop nav collapses on a phone',
    await page.locator('.nav-links').isHidden());
  await page.locator('#navToggle').click();
  await page.waitForTimeout(150);
  check('the hamburger opens the navigation',
    await page.locator('.nav-links').isVisible());
  check('nothing overflows horizontally at phone width',
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1));

  check('no console errors', noise.length === 0, noise.join('\n       '));
} finally {
  await browser.close();
  server.close();
}

console.log('\nWriteline — landing page tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
