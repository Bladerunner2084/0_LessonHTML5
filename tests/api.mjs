/* tests/api.mjs — the front-end contract.
 *
 * Any change here breaks a React component that a different person maintains in
 * a different repository, so the shape is tested as an interface rather than
 * trusted as an implementation detail.
 *
 *   node tests/api.mjs
 */

import assert from 'node:assert/strict';
import { createWriteline } from '../assets/js/api.js';
import { seedPlatform } from '../assets/js/seed.js';

let passed = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); passed += 1; results.push(`  ok   ${name}`); }
  catch (err) { results.push(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
};

const w = createWriteline();
await w.load();
await seedPlatform();
const { bookId } = w.current();

await test('the facade loads and reports the open book', () => {
  const now = w.current();
  assert.ok(now.bookId && now.projectId);
  assert.match(now.project.title, /The Last Signal/);
});

await test('findings arrive in the shape a findings UI needs', () => {
  const findings = w.findings(bookId);
  assert.ok(findings.length >= 5);
  for (const f of findings) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.rule, 'string');
    assert.ok(['error', 'warn', 'info'].includes(f.severity), f.severity);
    assert.ok(['Critical', 'Moderate', 'Note'].includes(f.label), f.label);
    assert.ok(f.description.length > 10, f.description);
    assert.equal(typeof f.explain, 'string');
    assert.equal(typeof f.type, 'string');
  }
});

await test('a finding id is stable across calls, so React keys do not thrash', () => {
  const a = w.findings(bookId).map((f) => f.id);
  const b = w.findings(bookId).map((f) => f.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length, 'ids must be unique within a render');
});

await test('scene findings carry a chapter and scene to display', () => {
  const scened = w.findings(bookId).find((f) => f.view === 'scenes' && f.recordId);
  assert.ok(scened, 'expected at least one scene-level finding');
  assert.match(scened.chapter, /^Chapter \d+$/);
  assert.match(scened.scene, /^Scene \d+$/);
  assert.ok(scened.sceneTitle);
});

await test('counts are grouped by the labels the prototype already uses', () => {
  const counts = w.findingCounts(bookId);
  assert.deepEqual(Object.keys(counts).sort(), ['Critical', 'Moderate', 'Note']);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, w.findings(bookId).length);
});

/* Nothing is cached, which is the reason a component can render it freely. */
await test('findings recompute — fixing the graph clears the finding', async () => {
  const before = w.findings(bookId).filter((f) => f.rule === 'ghost-cast');
  assert.ok(before.length >= 1);
  const scene = w.get(before[0].recordId);
  await w.patch(scene.id, { isFlashback: true });
  assert.equal(w.findings(bookId).filter((f) => f.rule === 'ghost-cast').length, 0,
    'the facade must not be serving a cached list');
  await w.patch(scene.id, { isFlashback: false });
  assert.ok(w.findings(bookId).some((f) => f.rule === 'ghost-cast'));
});

await test('the dashboard gets every figure it needs in one call', () => {
  const s = w.stats(bookId);
  for (const key of ['words', 'target', 'chapters', 'scenes', 'characters',
    'revelations', 'versions', 'Critical', 'Moderate', 'Note']) {
    assert.equal(typeof s[key], 'number', `stats.${key} missing`);
  }
});

await test('the pipeline returns seventeen stages, a score and one next action', () => {
  const p = w.pipeline(bookId);
  assert.equal(p.stages.length, 17);
  assert.ok(p.progress > 0 && p.progress <= 100);
  assert.ok(p.next && p.next.name && p.next.view);
});

await test('pace always returns a verdict and a sentence', () => {
  const p = w.pace(bookId);
  assert.ok(typeof p.verdict === 'string' && p.message.length > 10);
});

await test('the reader model is reachable and scrubbable', () => {
  const end = w.reader(bookId);
  assert.ok(end.sceneCount > 0);
  assert.equal(end.curve.length, end.sceneCount);
  assert.equal(end.at, end.sceneCount - 1);

  const start = w.reader(bookId, 0);
  assert.equal(start.at, 0);
  assert.ok(start.state.met.length <= end.state.met.length,
    'the reader has met no more people at the start than at the end');
});

await test('an out-of-range scrub position is clamped, not thrown', () => {
  assert.equal(w.reader(bookId, -50).at, 0);
  assert.equal(w.reader(bookId, 9999).at, w.reader(bookId).sceneCount - 1);
});

await test('style drift comes back as rows a UI can print directly', () => {
  const target = w.style.measure('Short. Sharp. Clean. '.repeat(120));
  const rows = w.style.drift(bookId, target);
  if (rows.length) {
    for (const row of rows) {
      assert.equal(typeof row.text, 'string');
      assert.ok(!/NaN|undefined/.test(row.text), row.text);
    }
  }
  assert.deepEqual(w.style.drift(bookId, null), [], 'no target means no claims');
});

await test('search returns hits with snippets ready to render', () => {
  const hits = w.search('Vault');
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].title && hits[0].view);
  assert.ok(Array.isArray(hits[0].snippet));
});

await test('subscribing notifies the front end when a record changes', async () => {
  let fired = 0;
  const off = w.subscribe(() => { fired += 1; });
  await w.patch(bookId, { targetWords: 91234 });
  off();
  assert.ok(fired >= 1, 'a mutation must notify subscribers');
  assert.equal(w.get(bookId).targetWords, 91234);
});

console.log('\nWriteline — front-end API contract tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
