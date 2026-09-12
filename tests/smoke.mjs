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
import { runPipeline, progress, nextAction } from '../assets/js/pipeline.js';
import { paceReport, velocity, logWords, today, daysBetween } from '../assets/js/pace.js';
import { toMarkdown, compileBook } from '../assets/js/compile.js';
import { wordCount, make } from '../assets/js/model.js';

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

const echo = S.list('project').find((p) => p.title === 'ECHO 2084 — Demo Fixture');
const echoBook = S.books(echo.id)[0];

/* Every factory must let callers override its defaults. Four of them once did
 * not, and the only symptom was records quietly filed under bookId: null. */
await test('every record factory honours the fields passed to it', () => {
  for (const [type, factory] of Object.entries(make)) {
    const record = factory({ projectId: 'P', bookId: 'B', canon: 'suggested' });
    assert.equal(record.projectId, 'P', `make.${type} ignored projectId`);
    assert.equal(record.bookId, 'B', `make.${type} ignored bookId`);
    assert.equal(record.canon, 'suggested', `make.${type} ignored canon`);
    assert.equal(record.type, type, `make.${type} set the wrong type`);
  }
});

await test('the platform seeds the projects in the spec', () => {
  const titles = S.list('project').map((p) => p.title).sort();
  assert.deepEqual(titles,
    ['ECHO 2084', 'ECHO 2084 — Demo Fixture', 'Future Novel', 'Future Series']);
});

/* PRD §47: do not populate ECHO 2084 with invented canon. */
await test('the author’s ECHO 2084 project contains no invented canon', () => {
  const real = S.list('project').find((p) => p.title === 'ECHO 2084');
  const bookId = S.books(real.id)[0].id;
  assert.equal(S.entities(bookId, 'character').length, 0, 'invented characters found');
  assert.ok(S.questions(bookId).length >= 4, 'expected placeholder open questions');
  const pages = S.inBook('note', bookId).filter((n) => n.slot === 'story');
  assert.ok(pages.every((n) => n.body.includes('Placeholder')),
    'story pages must be placeholders, not invented answers');
});

/* PRD §34: an AI suggestion must never be mistaken for author-established fact. */
await test('every record the demo fixture invents is marked non-canon', () => {
  const invented = ['entity', 'beat', 'revelation', 'scene', 'chapter']
    .flatMap((t) => S.inBook(t, echoBook.id));
  const leaked = invented.filter((r) => (r.canon ?? 'canon') === 'canon');
  assert.equal(leaked.length, 0,
    `${leaked.length} fixture records claim canon status: ${leaked.slice(0, 3).map((r) => r.name ?? r.label ?? r.title)}`);
});

await test('drafted prose resting on unsettled facts is reported', () => {
  const found = audit(echoBook.id).filter((f) => f.rule === 'unsettled-dependency');
  assert.ok(found.length >= 1, 'expected the canon-discipline finding');
  assert.equal(found[0].severity, 'warn');
});

await test('a record ruled non-canon under drafted prose is an error, not a warning', async () => {
  const mara = S.entities(echoBook.id, 'character').find((e) => e.name === 'Mara Vance');
  const before = mara.canon;
  await S.patch(mara.id, { canon: 'rejected' });
  const found = audit(echoBook.id).filter((f) => f.rule === 'rejected-canon-in-prose');
  assert.ok(found.length >= 1);
  assert.equal(found[0].severity, 'error');
  await S.patch(mara.id, { canon: before });
});

/* PRD §26: never overwrite creative work. */
await test('a snapshot preserves the book and restoring one is itself reversible', async () => {
  const scene = S.bookScenes(echoBook.id)[0];
  const original = scene.prose;
  const before = S.versions(echoBook.id).length;

  await S.snapshotBook(echoBook.id, { label: 'Test point', reason: 'unit test' });
  assert.equal(S.versions(echoBook.id).length, before + 1);

  await S.patch(scene.id, { prose: 'Destroyed by the test.' });
  assert.equal(S.get(scene.id).prose, 'Destroyed by the test.');

  const point = S.versions(echoBook.id).find((v) => v.label === 'Test point');
  await S.restoreVersion(point.id);
  assert.equal(S.get(scene.id).prose, original, 'restore did not bring the prose back');

  const safety = S.versions(echoBook.id).find((v) => v.label.startsWith('Before restoring'));
  assert.ok(safety, 'restoring must snapshot the present first');
});

await test('snapshots never nest inside snapshots', async () => {
  const point = S.versions(echoBook.id)[0];
  const records = JSON.parse(point.snapshot);
  assert.equal(records.filter((r) => r.type === 'version').length, 0);
});

/* PRD §25 and §41. */
await test('the 17-stage pipeline computes itself from the graph', () => {
  const stages = runPipeline(echoBook.id);
  assert.equal(stages.length, 17);
  assert.ok(stages.every((s) => ['done', 'partial', 'todo', 'pending'].includes(s.state)));
  assert.equal(stages[14].state, 'pending', 'Realism Audit has no AI layer and must say so');
});

await test('progress ignores stages blocked on modules that do not exist', () => {
  const stages = runPipeline(echoBook.id);
  const pct = progress(stages);
  assert.ok(pct > 0 && pct < 100, `expected a partial score, got ${pct}`);
  const pendingCounted = stages.filter((s) => s.state === 'pending').length;
  assert.ok(pendingCounted >= 1, 'the fixture should have at least one pending stage');
});

await test('the dashboard can always name one next action', () => {
  const next = nextAction(runPipeline(echoBook.id));
  assert.ok(next && next.name && next.view, 'expected a single actionable next stage');
});

/* A controlled rewrite is a sequence. Pointing the author at a late stage while
 * an early one is unfinished is the uncontrolled rewrite the method prevents. */
await test('the next action is the earliest unfinished stage, not the furthest', () => {
  const stages = runPipeline(echoBook.id);
  const next = nextAction(stages);
  const earlier = stages.filter((s) =>
    s.n < next.n && (s.state === 'todo' || s.state === 'partial'));
  assert.equal(earlier.length, 0,
    `stage ${next.n} was proposed while ${earlier.map((s) => s.n)} remain unfinished`);
});

/* --- deadlines and pace ------------------------------------------------- */

const dayOffset = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

await test('with no deadline set, nothing counts down', () => {
  const r = paceReport(echoBook.id);
  assert.equal(r.verdict, 'none');
  assert.ok(r.words >= 0 && r.target > 0);
});

await test('a reachable deadline reports the daily rate it needs', async () => {
  await S.patch(echoBook.id, {
    deadlineOn: true, deadline: dayOffset(200), writingDays: 7, targetWords: 95000,
  });
  const r = paceReport(echoBook.id);
  assert.ok(['unknown', 'behind', 'on-track', 'ahead'].includes(r.verdict), r.verdict);
  assert.ok(r.requiredPerDay > 0 && r.requiredPerDay < 3000);
  assert.equal(r.daysLeft, 200);
});

/* The feature only earns its place if it will say no. */
await test('an unreachable deadline is called impossible, not encouraged', async () => {
  await S.patch(echoBook.id, { deadlineOn: true, deadline: dayOffset(5) });
  const r = paceReport(echoBook.id);
  assert.equal(r.verdict, 'impossible');
  assert.match(r.message, /new date or a smaller book/);
});

await test('a deadline already passed says so plainly', async () => {
  await S.patch(echoBook.id, { deadlineOn: true, deadline: dayOffset(-9) });
  const r = paceReport(echoBook.id);
  assert.equal(r.verdict, 'passed');
  assert.match(r.message, /passed 9 day/);
});

await test('writing days per week shrink the days actually available', async () => {
  await S.patch(echoBook.id, { deadlineOn: true, deadline: dayOffset(70), writingDays: 7 });
  const seven = paceReport(echoBook.id);
  await S.patch(echoBook.id, { writingDays: 2 });
  const two = paceReport(echoBook.id);
  assert.ok(two.writingDaysLeft < seven.writingDaysLeft);
  assert.ok(two.requiredPerDay > seven.requiredPerDay,
    'fewer writing days must demand more words on each of them');
});

await test('velocity is measured from recorded history, never guessed', async () => {
  assert.equal(velocity(echoBook.id), null, 'no history yet should measure nothing');
  const book = S.get(echoBook.id);
  await S.create('wordlog', {
    projectId: book.projectId, bookId: echoBook.id, date: dayOffset(-10), words: 1000,
  });
  await S.create('wordlog', {
    projectId: book.projectId, bookId: echoBook.id, date: dayOffset(-0), words: 6000,
  });
  const v = velocity(echoBook.id);
  assert.equal(v.days, 10);
  assert.equal(v.perDay, 500);
});

await test('logging words is idempotent within a day', async () => {
  const bookId = S.books(S.list('project').find((p) => p.title === 'Future Novel').id)[0].id;
  await logWords(bookId);
  await logWords(bookId);
  const rows = S.list('wordlog').filter((w) => w.bookId === bookId && w.date === today());
  assert.equal(rows.length, 1, 'a second call the same day must update, not duplicate');
});

await test('day arithmetic is inclusive of direction', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-08'), 7);
  assert.equal(daysBetween('2026-03-10', '2026-03-01'), -9);
});

await test('a locked decision is recorded with its reason', () => {
  const locked = S.decisions(echoBook.id).filter((d) => d.status === 'locked');
  assert.ok(locked.length >= 1);
  assert.ok(locked[0].rationale.length > 20, 'a decision without a reason is not a decision');
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
