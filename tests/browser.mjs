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

const SECTIONS = ['dashboard', 'draft0', 'vault', 'story', 'character', 'world', 'timeline',
  'revelations', 'chapters', 'scenes', 'manuscript', 'screenplay', 'reader', 'audit',
  'decisions', 'inbox', 'publish'];
const HEADINGS = ['ECHO 2084', 'Draft 0', 'Draft Vault', 'Story Bible', 'Character Bible',
  'World Bible', 'Timeline', 'Revelation Map', 'Chapter Map', 'Scene Map', 'Manuscript',
  'Screenplay', 'Reader Simulator', 'Continuity', 'Decision Log', 'Questions & Ideas',
  'Publication'];

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
  check('the sample seeds the author project, the demo fixture and the two futures',
    JSON.stringify(projects) === JSON.stringify(
      ['ECHO 2084', 'ECHO 2084 — Demo Fixture', 'Future Novel', 'Future Series']),
    `got ${JSON.stringify(projects)}`);

  /* The sample opens on the demo fixture's dashboard (PRD §30/§41). */
  check('the dashboard names exactly one next action',
    await page.locator('.next-action').count() === 1);
  check('the Controlled Rewrite shows all seventeen stages',
    await page.locator('.stage-list .stage').count() === 17);
  const pct = await page.locator('.overall-pct').textContent();
  check('overall progress is computed, not zero and not complete',
    /^[1-9]\d?%$/.test(pct?.trim() ?? ''), `got ${JSON.stringify(pct)}`);

  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('audit')).click();
  await page.waitForTimeout(250);
  const tallies = (await page.locator('.score .tally').allTextContents()).join(' ');
  check('the continuity engine reports the two planted contradictions',
    tallies.startsWith('2 contradictions'), `got "${tallies}"`);
  check('canon discipline is enforced against drafted prose',
    await page.locator('.audit-group.warn', { hasText: 'unsettled dependency' }).count() > 0);

  for (const [i, id] of SECTIONS.entries()) {
    await page.locator('.tree-sections .section').nth(i).click();
    await page.waitForTimeout(180);
    const heading = await page.locator('.view-head h2').first().textContent().catch(() => '');
    check(`section "${id}" paints`, heading?.trim().startsWith(HEADINGS[i]),
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
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('draft0')).click();
  await page.waitForTimeout(250);
  await page.locator('.draft0-area').fill('Wintermark is the city that eats its own archives.');
  await page.locator('.draft0-area').evaluate((el) => { el.focus(); el.setSelectionRange(0, 10); });
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('character')).click();
  await page.waitForTimeout(250);
  check('selecting text in Draft 0 promotes it into the Character Bible',
    (await page.locator('.list .list-item .name').allTextContents()).includes('Wintermark'));

  /* PRD §26 — the Draft Vault must preserve, and a restore must be reversible. */
  await page.locator('.node.project .node-label', { hasText: 'Demo Fixture' }).click();
  await page.waitForTimeout(300);
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('vault')).click();
  await page.waitForTimeout(250);
  check('the demo fixture ships with Draft 0 preserved',
    await page.locator('.version-card').count() >= 1);

  /* Two prompts fire in sequence (label, then reason). Playwright dispatches
   * every registered listener to the FIRST dialog, so one handler drains a
   * queue rather than two handlers racing for the same dialog. */
  const answers = ['Browser test point', 'taken by the browser test'];
  const onDialog = async (d) => {
    const next = answers.shift();
    if (next === undefined) { await d.dismiss(); return; }
    await d.accept(next);
  };
  page.on('dialog', onDialog);
  await page.getByRole('button', { name: '+ Preserve this state' }).click();
  await page.waitForTimeout(600);
  check('preserving the current state adds a version',
    await page.locator('.version-card').count() >= 2);

  page.off('dialog', onDialog);

  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('decisions')).click();
  await page.waitForTimeout(250);
  check('the decision log carries a locked decision with its reason',
    await page.locator('.card.decision.locked').count() >= 1);

  /* Deadlines: opt-in, and the panel must be willing to say no. */
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('dashboard')).click();
  await page.waitForTimeout(250);
  check('the word count is on the dashboard without being asked for',
    await page.locator('.pace-count').count() === 1);
  check('the deadline is off until switched on',
    await page.locator('.pace-controls').count() === 0);

  await page.locator('.pace-toggle input').check();
  await page.waitForTimeout(300);
  check('switching the deadline on reveals the date and pace controls',
    await page.locator('.pace-controls input[type="date"]').count() === 1);

  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await page.locator('.pace-controls input[type="date"]').fill(soon);
  await page.waitForTimeout(400);
  check('an unreachable deadline is reported as impossible, not encouraged',
    (await page.locator('.pace-message').textContent())?.includes('new date or a smaller book'));
  check('an impossible pace is styled as a problem', await page.locator('.pace.bad').count() === 1);

  /* Publication: three routes, and a readiness gate that cannot be ticked. */
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('publish')).click();
  await page.waitForTimeout(250);
  check('publication offers all four routes, direct-to-reader included',
    await page.locator('.pathway').count() === 4);
  check('the direct route promises the app stays out of the money',
    /never touches the money/i.test(
      await page.locator('.pathway', { hasText: 'Direct to reader' }).innerText()));
  check('no checklist appears until a route is chosen',
    await page.locator('.pub-list').count() === 0);

  await page.locator('.pathway', { hasText: 'Self-publishing' }).click();
  await page.waitForTimeout(300);
  check('choosing a route reveals what it actually requires',
    await page.locator('.pub-list li').count() >= 12);
  check('the computed readiness items cannot be ticked by hand',
    await page.locator('.pub-list input[disabled]').count() === 2);

  /* The direct route carries the obligations authors discover after the first
   * sale, which is the worst time to discover them. */
  await page.locator('.pathway', { hasText: 'Direct to reader' }).click();
  await page.waitForTimeout(300);
  const directText = await page.locator('.pub-list').innerText();
  check('the direct route names the tax and merchant-of-record obligations',
    /merchant of record/i.test(directText) && /VAT/i.test(directText), directText.slice(0, 120));
  /* The platform must never put itself in the payment path — that is an
   * architectural commitment, so it is asserted rather than remembered. */
  check('the direct route states the app is never in the payment path',
    /never in the payment path/i.test(directText));
  check('the direct route names the unit economics',
    /unit economics/i.test(directText));

  await page.locator('.pathway', { hasText: 'Traditional' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '+ Add entry' }).click();
  await page.waitForTimeout(400);
  check('the submission tracker records a query',
    await page.locator('.sub-row').count() === 1);

  /* The Reader Simulator: the curve renders, and scrubbing changes the mind. */
  await page.locator('.node.project .node-label', { hasText: 'Demo Fixture' }).click();
  await page.waitForTimeout(300);
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('reader')).click();
  await page.waitForTimeout(350);
  check('the tension curve renders as a real path, not a placeholder',
    ((await page.locator('.tension-chart .line').getAttribute('d')) ?? '').length > 20);
  check('every scene gets a hover target on the curve',
    await page.locator('.tension-chart .hit').count() === 6);

  const scrubTo = async (i) => {
    await page.locator('.scrub').fill(String(i));
    await page.dispatchEvent('.scrub', 'input');
    await page.waitForTimeout(250);
    return page.locator('.reader-columns').innerText();
  };

  const early = await scrubTo(0);
  const late = await scrubTo(5);
  check('scrubbing the book changes what the reader is holding', early !== late,
    'the panel did not respond to the scrubber');

  /* The specific transition the whole feature exists to show: a question the
   * reader is carrying at scene 3 has become a thing they know by scene 6.
   * Headings are uppercased in CSS and innerText returns rendered text, so
   * these match case-insensitively. */
  const mid = await scrubTo(2);
  check('a planted-but-unrevealed fact sits in “still waiting on”',
    /still waiting on · 1[\s\S]*Mara is an echo/i.test(mid), mid.slice(0, 120));
  check('after its reveal the same fact has moved to “knows”',
    /knows · 1[\s\S]*Mara is an echo/i.test(late) && /still waiting on · 0/i.test(late),
    late.slice(0, 120));

  check('the caption names the scene the reader has just finished',
    (await page.locator('.chart-caption').textContent())?.includes('Scene 3 of 6'));
  await page.locator('.tension-chart .hit').nth(2).hover();
  await page.waitForTimeout(200);
  check('hovering the curve explains the point',
    await page.locator('.chart-tip:not([hidden])').count() === 1);

  /* Screenplay mode: convert, edit, and leave the novel untouched. */
  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('scenes')).click();
  await page.waitForTimeout(250);
  await page.locator('.scene-outline .list-item').first().click();
  await page.waitForTimeout(250);
  const novelBefore = await page.locator('.prose-area').inputValue();

  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('screenplay')).click();
  await page.waitForTimeout(250);
  check('screenplay mode explains itself before converting anything',
    await page.locator('.script-source').count() === 0);

  await page.getByRole('button', { name: 'Convert to screenplay' }).click();
  await page.waitForTimeout(600);
  const fountain = await page.locator('.script-source').inputValue();
  check('conversion produces Fountain with scene headings',
    /INT\.|EXT\./.test(fountain), fountain.slice(0, 80));
  check('the rendered page shows screenplay elements, not raw text',
    await page.locator('.script-page .sp-heading').count() >= 1);
  check('decisions the converter refused to make are shown as notes',
    await page.locator('.script-page .sp-note').count() >= 1);

  await page.locator('.script-source').fill(`${fountain}\n\nFADE OUT.`);
  await page.waitForTimeout(800);
  check('the screenplay is editable and the page follows',
    /FADE OUT/.test(await page.locator('.script-page').innerText()));

  await page.locator('.tree-sections .section').nth(SECTIONS.indexOf('scenes')).click();
  await page.waitForTimeout(300);
  await page.locator('.scene-outline .list-item').first().click();
  await page.waitForTimeout(250);
  check('converting and editing the screenplay left the novel untouched',
    (await page.locator('.prose-area').inputValue()) === novelBefore);

  check('no view writes errors to the console', noise.length === 0, noise.join('\n       '));
} finally {
  await browser.close();
  server.close();
}

console.log('\nNovel Development Platform — browser tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
