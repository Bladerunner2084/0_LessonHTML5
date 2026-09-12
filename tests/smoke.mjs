/* tests/smoke.mjs — runs the real modules under Node with no browser.
 *
 * The app has no build step, so the test has no build step either: store.js
 * degrades to an in-memory map when IndexedDB is absent, which is exactly the
 * situation here. That degradation path being testable is the point — it is
 * also what protects a writer in a private-mode tab.
 *
 *   node tests/smoke.mjs
 */

import assert from 'node:assert/strict';
import * as S from '../assets/js/state.js';
import { seedPlatform } from '../assets/js/seed.js';
import { audit } from '../assets/js/lint.js';
import { toMarkdown, compileBook } from '../assets/js/compile.js';
import { wordCount } from '../assets/js/model.js';

let passed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    results.push(`  ok   ${name}`);
  } catch (err) {
    results.push(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

await S.load();
await seedPlatform();

const echo = S.list('project').find((p) => p.title === 'ECHO 2084');
const echoBook = S.books(echo.id)[0];

await test('the platform seeds the three projects in the spec', () => {
  const titles = S.list('project').map((p) => p.title).sort();
  assert.deepEqual(titles, ['ECHO 2084', 'Future Novel', 'Future Series']);
});

await test('a series gets its books; a standalone novel gets exactly one', () => {
  const series = S.list('project').find((p) => p.title === 'Future Series');
  const novel = S.list('project').find((p) => p.title === 'Future Novel');
  assert.equal(S.books(series.id).length, 3);
  assert.equal(S.books(novel.id).length, 1);
});

await test('series-scoped records belong to every book without being copied', () => {
  const series = S.list('project').find((p) => p.title === 'Future Series');
  const shared = S.list('entity').filter((e) => e.projectId === series.id && e.bookId === null);
  assert.equal(shared.length, 1, 'expected exactly one shared entity record');
  for (const book of S.books(series.id)) {
    const names = S.inBook('entity', book.id, series.id).map((e) => e.name);
    assert.ok(names.includes('Series spine'), `book ${book.title} cannot see the shared record`);
  }
});

await test('reading order is chapters in order, then scenes in order', () => {
  const scenes = S.bookScenes(echoBook.id);
  assert.equal(scenes[0].title, 'Terminus, 04:12');
  assert.equal(scenes.at(-1).title, 'Choosing the kinder version');
  assert.equal(scenes.length, 6);
});

await test('continuity catches the planted premature-knowledge fault', () => {
  const found = audit(echoBook.id).filter((f) => f.rule === 'premature-knowledge');
  assert.ok(found.length >= 1, 'expected the reader-knowledge contradiction');
  assert.match(found[0].message, /Kroft’s office/);
  assert.equal(found[0].severity, 'error');
});

await test('continuity catches the planted ghost-cast fault', () => {
  const found = audit(echoBook.id).filter((f) => f.rule === 'ghost-cast');
  assert.ok(found.length >= 1, 'expected a character appearing after they leave the story');
  assert.match(found[0].message, /Tessa Vance/);
});

await test('a flashback flag silences the cast gate, as designed', async () => {
  const scene = S.bookScenes(echoBook.id).find((s) => s.title === 'The sister who is filed');
  await S.patch(scene.id, { isFlashback: true });
  assert.equal(audit(echoBook.id).filter((f) => f.rule === 'ghost-cast').length, 0);
  await S.patch(scene.id, { isFlashback: false });
  assert.ok(audit(echoBook.id).some((f) => f.rule === 'ghost-cast'));
});

await test('moving the reveal earlier clears the premature-knowledge finding', async () => {
  const rev = S.revelations(echoBook.id).find((r) => r.label === 'Mara is an echo');
  const earlier = S.bookScenes(echoBook.id)[1];
  const original = rev.revealedIn;
  await S.patch(rev.id, { revealedIn: earlier.id });
  assert.equal(audit(echoBook.id).filter((f) => f.rule === 'premature-knowledge').length, 0,
    'fixing the graph must fix the report, with nothing else to update');
  await S.patch(rev.id, { revealedIn: original });
});

await test('an untracked reveal is reported as never revealed', () => {
  const found = audit(echoBook.id).filter((f) => f.rule === 'never-revealed');
  assert.ok(found.some((f) => /Tessa was edited/.test(f.message)));
});

await test('a holder with no source beat is flagged', () => {
  const found = audit(echoBook.id).filter((f) => f.rule === 'knowledge-without-source');
  assert.ok(found.length >= 1);
});

await test('deleting a character scrubs them from every scene, beat and revelation', async () => {
  const tessa = S.entities(echoBook.id, 'character').find((e) => e.name === 'Tessa Vance');
  await S.remove(tessa.id);
  const stillReferenced = [
    ...S.bookScenes(echoBook.id).flatMap((s) => s.presentIds ?? []),
    ...S.beats(echoBook.id).flatMap((b) => b.entityIds ?? []),
    ...S.revelations(echoBook.id).flatMap((r) => (r.knownBy ?? []).map((k) => k.entityId)),
  ];
  assert.ok(!stillReferenced.includes(tessa.id), 'a deleted entity left dangling references');
  assert.equal(audit(echoBook.id).filter((f) => f.rule === 'ghost-cast').length, 0);
});

await test('reordering scenes renumbers siblings contiguously', async () => {
  const chapter = S.chapters(echoBook.id)[0];
  const before = S.scenesOf(chapter.id).map((s) => s.title);
  await S.move(S.scenesOf(chapter.id)[1].id, -1);
  const after = S.scenesOf(chapter.id).map((s) => s.title);
  assert.deepEqual(after, [before[1], before[0]]);
  assert.deepEqual(S.scenesOf(chapter.id).map((s) => s.order), [0, 1]);
  await S.move(S.scenesOf(chapter.id)[1].id, -1);
});

await test('deleting a chapter cascades to its scenes', async () => {
  const chapter = S.chapters(echoBook.id).at(-1);
  const sceneIds = S.scenesOf(chapter.id).map((s) => s.id);
  assert.ok(sceneIds.length > 0);
  await S.remove(chapter.id);
  assert.ok(sceneIds.every((id) => S.get(id) === null), 'orphan scenes survived the cascade');
});

await test('the manuscript compiles from scenes, never from a stored copy', async () => {
  const scene = S.bookScenes(echoBook.id)[0];
  await S.patch(scene.id, { prose: 'One line of prose.' });
  const md = toMarkdown(echoBook.id);
  assert.match(md, /^# ECHO 2084/);
  assert.match(md, /## 1\. Handoff/);
  assert.ok(md.includes('One line of prose.'));
  assert.ok(md.includes('* * *'), 'expected a scene divider between scenes');
});

await test('word counts roll up from scenes to chapters to book', () => {
  const book = compileBook(echoBook.id);
  const fromScenes = S.bookScenes(echoBook.id)
    .reduce((n, s) => n + wordCount(s.prose), 0);
  assert.equal(book.words, fromScenes);
  assert.equal(book.words, book.chapters.reduce((n, c) => n + c.words, 0));
});

await test('word count handles apostrophes and hyphens as one word each', () => {
  assert.equal(wordCount("the courier's half-lit room"), 4);
  assert.equal(wordCount('   '), 0);
});

console.log(`\nNovel Development Platform — smoke tests\n`);
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
