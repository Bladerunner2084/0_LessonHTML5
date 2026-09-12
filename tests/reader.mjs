/* tests/reader.mjs — the Reader Model, exercised on a book long enough to
 * forget things in.
 *
 * The sample fixture is six scenes; reader memory does not decay meaningfully
 * across six scenes, so these tests build a synthetic 40-scene book instead of
 * inflating the sample with invented canon.
 *
 *   node tests/reader.mjs
 */

import assert from 'node:assert/strict';
import * as S from '../assets/js/state.js';
import {
  readerStateAt, tensionCurve, readerFindings, recallAt,
  RECALL_HALF_LIFE, FAINT, FADE_GAP,
} from '../assets/js/reader.js';

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

/* A 40-scene book: four chapters of ten, one character in every scene so the
 * cast rules stay quiet unless a test asks for them. */
const project = await S.create('project', { title: 'Test Book', kind: 'novel' });
const book = await S.create('book', { projectId: project.id, title: 'Test Book', order: 0 });
const bid = book.id;
const at = (f) => ({ projectId: project.id, bookId: bid, ...f });

const lead = await S.create('entity', at({ kind: 'character', name: 'Lead' }));

const scenes = [];
for (let c = 0; c < 4; c += 1) {
  const chapter = await S.create('chapter', at({ title: `Chapter ${c + 1}`, order: c }));
  for (let i = 0; i < 10; i += 1) {
    scenes.push(await S.create('scene', at({
      chapterId: chapter.id,
      order: i,
      title: `Scene ${c * 10 + i + 1}`,
      summary: 'purpose stated',
      status: 'drafted',
      pov: lead.id,
      presentIds: [lead.id],
      prose: 'x '.repeat(400),
    })));
  }
}
const sceneAt = (i) => scenes[i];

await test('recall halves over the half-life and keeps halving', () => {
  assert.equal(recallAt(0), 1);
  assert.equal(recallAt(RECALL_HALF_LIFE), 0.5);
  assert.equal(recallAt(RECALL_HALF_LIFE * 2), 0.25);
  assert.ok(recallAt(RECALL_HALF_LIFE * 3) < FAINT);
});

await test('the silence threshold is derived from the decay curve, not guessed', () => {
  assert.ok(recallAt(FADE_GAP) < FAINT, 'FADE_GAP must actually put a fact below FAINT');
  assert.ok(recallAt(FADE_GAP - 1) >= FAINT, 'and it must be the first scene that does');
});

/* One fact: planted in scene 2, revealed in scene 15, leaned on again in 38. */
const slow = await S.create('revelation', at({
  label: 'The long fact',
  weight: 'major',
  plantedIn: [sceneAt(2).id],
  revealedIn: sceneAt(15).id,
}));
await S.patch(sceneAt(38).id, { usesRevelationIds: [slow.id] });

await test('an unrevealed fact sits in “still waiting on”, not in “knows”', () => {
  const state = readerStateAt(bid, 10);
  assert.equal(state.open.length, 1, 'expected one open question');
  assert.equal(state.known.length, 0);
  assert.equal(state.open[0].label, 'The long fact');
});

await test('after the reveal it moves to “knows”', () => {
  const state = readerStateAt(bid, 16);
  assert.equal(state.open.length, 0);
  assert.equal(state.known.length, 1);
  assert.ok(state.known[0].strength > 0.9, 'just revealed, so recall should be near full');
});

await test('what the reader holds decays with silence', () => {
  const near = readerStateAt(bid, 17).known[0];
  const far = readerStateAt(bid, 37).known[0];
  assert.ok(far.strength < near.strength);
  assert.ok(far.strength < FAINT, `expected a faded fact, got ${far.strength}`);
  assert.equal(readerStateAt(bid, 37).fading.length, 1);
});

await test('tension rises when a question opens and falls when it is answered', () => {
  const curve = tensionCurve(bid);
  assert.equal(curve.length, 40);
  assert.equal(curve[1].tension, 0, 'nothing is open before the plant');
  assert.equal(curve[2].tension, 2, 'a major question is weight 2');
  assert.equal(curve[14].tension, 2, 'still unanswered the scene before the reveal');
  assert.equal(curve[15].tension, 0, 'answered');
  assert.equal(curve[2].opened, 1);
  assert.equal(curve[15].closed, 1);
});

/* The finding no other tool produces. */
await test('a scene leaning on a long-forgotten fact is flagged', () => {
  const found = readerFindings(bid).filter((f) => f.rule === 'reader-forgot');
  assert.equal(found.length, 1, 'expected exactly one forgetting finding');
  assert.match(found[0].message, /23 scenes earlier/);
  assert.match(found[0].message, /no longer has it/);
});

await test('reinforcing the fact in between removes the finding', async () => {
  await S.patch(sceneAt(30).id, { usesRevelationIds: [slow.id] });
  const found = readerFindings(bid).filter((f) => f.rule === 'reader-forgot');
  assert.equal(found.length, 0,
    'a reminder eight scenes before should restore the reader’s hold on it');
  await S.patch(sceneAt(30).id, { usesRevelationIds: [] });
});

await test('a short gap is never flagged', async () => {
  const quick = await S.create('revelation', at({
    label: 'Quick fact', weight: 'minor',
    plantedIn: [sceneAt(12).id], revealedIn: sceneAt(13).id,
  }));
  await S.patch(sceneAt(14).id, { usesRevelationIds: [quick.id] });
  const found = readerFindings(bid)
    .filter((f) => f.rule === 'reader-forgot' && /Quick fact/.test(f.message));
  assert.equal(found.length, 0);
  await S.patch(sceneAt(14).id, { usesRevelationIds: [] });
  await S.remove(quick.id);
});

await test('a stretch where nothing opens or resolves is reported', () => {
  const found = readerFindings(bid).filter((f) => f.rule === 'tension-flatline');
  assert.ok(found.length >= 1, 'a 40-scene book with two events should show flat runs');
  assert.match(found[0].message, /open nothing and resolve nothing/);
});

await test('running out of questions before running out of pages is reported', () => {
  const found = readerFindings(bid).filter((f) => f.rule === 'tension-deflation');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /By scene 16/);
  assert.match(found[0].message, /24 scenes still to go/);
});

/* A lull two scenes from the end is a landing, not a sag. */
await test('deflation is not reported when the book is nearly over anyway', async () => {
  const tiny = await S.create('project', { title: 'Tiny', kind: 'novel' });
  const tb = await S.create('book', { projectId: tiny.id, title: 'Tiny', order: 0 });
  const ch = await S.create('chapter', { projectId: tiny.id, bookId: tb.id, order: 0 });
  const made = [];
  for (let i = 0; i < 6; i += 1) {
    made.push(await S.create('scene', {
      projectId: tiny.id, bookId: tb.id, chapterId: ch.id, order: i, title: `S${i}`,
    }));
  }
  await S.create('revelation', {
    projectId: tiny.id, bookId: tb.id, label: 'Small', weight: 'minor',
    plantedIn: [made[0].id], revealedIn: made[3].id,
  });
  const found = readerFindings(tb.id).filter((f) => f.rule === 'tension-deflation');
  assert.equal(found.length, 0, 'two scenes of runway is not a structural sag');
  await S.remove(tiny.id);
});

/* Page one has no tension either. Reporting that would report the beginning. */
await test('no deflation is reported before the first question opens', async () => {
  const quiet = await S.create('project', { title: 'Quiet', kind: 'novel' });
  const qb = await S.create('book', { projectId: quiet.id, title: 'Quiet', order: 0 });
  const ch = await S.create('chapter', { projectId: quiet.id, bookId: qb.id, order: 0 });
  for (let i = 0; i < 6; i += 1) {
    await S.create('scene', {
      projectId: quiet.id, bookId: qb.id, chapterId: ch.id, order: i, title: `S${i}`,
    });
  }
  const found = readerFindings(qb.id).filter((f) => f.rule === 'tension-deflation');
  assert.equal(found.length, 0, 'a book with no revelations at all has nothing to deflate');
  await S.remove(quiet.id);
});

await test('a character returning after a long absence is reported', async () => {
  const ghost = await S.create('entity', at({ kind: 'character', name: 'Long Absent' }));
  await S.patch(sceneAt(1).id, { presentIds: [lead.id, ghost.id] });
  await S.patch(sceneAt(34).id, { presentIds: [lead.id, ghost.id] });
  const found = readerFindings(bid).filter((f) => f.rule === 'character-faded');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /Long Absent returns/);
  assert.match(found[0].message, /33 scenes away/);
  await S.remove(ghost.id);
});

await test('too many new faces at once is reported', async () => {
  const crowd = [];
  for (let i = 0; i < 6; i += 1) {
    crowd.push(await S.create('entity', at({ kind: 'character', name: `Crowd ${i}` })));
  }
  await S.patch(sceneAt(5).id, { presentIds: [lead.id, ...crowd.slice(0, 3).map((e) => e.id)] });
  await S.patch(sceneAt(6).id, { presentIds: [lead.id, ...crowd.slice(3).map((e) => e.id)] });
  const found = readerFindings(bid).filter((f) => f.rule === 'cast-overload');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /6 characters first appear/);
  for (const e of crowd) await S.remove(e.id);
});

await test('the reader has met only the people they have actually seen', () => {
  const early = readerStateAt(bid, 0);
  assert.equal(early.met.length, 1);
  assert.equal(early.met[0].entityId, lead.id);
});

await test('a fact marked misunderstood shows as a false belief', async () => {
  await S.patch(slow.id, { status: 'misunderstood' });
  assert.equal(readerStateAt(bid, 25).wrong.length, 1);
  await S.patch(slow.id, { status: 'secret' });
  assert.equal(readerStateAt(bid, 25).wrong.length, 0);
});

console.log('\nNovel Development Platform — reader model tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
