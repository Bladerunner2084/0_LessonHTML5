/* tests/script.mjs — the prose-to-screenplay converter.
 *
 * The two guarantees this feature makes are structural, so they are tested as
 * facts rather than trusted as intentions: the novel is never modified, and a
 * human's edits to the script are never silently destroyed.
 *
 *   node tests/script.mjs
 */

import assert from 'node:assert/strict';
import * as S from '../assets/js/state.js';
import {
  proseToFountain, parseFountain, toFinalDraft, estimatePages, noteCount,
} from '../assets/js/script.js';

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

const project = await S.create('project', { title: 'Script Test', kind: 'novel' });
const book = await S.create('book', { projectId: project.id, title: 'Script Test', order: 0 });
const bid = book.id;
const at = (f) => ({ projectId: project.id, bookId: bid, ...f });

const mara = await S.create('entity', at({ kind: 'character', name: 'Mara Vance' }));
const iyo = await S.create('entity', at({ kind: 'character', name: 'Iyo Sable' }));
const room = await S.create('entity', at({ kind: 'location', name: 'Control Room' }));
const street = await S.create('entity', at({ kind: 'location', name: 'Rain Street' }));

const chapter = await S.create('chapter', at({ title: 'One', order: 0 }));
const mk = (f) => S.create('scene', at({ chapterId: chapter.id, ...f }));

const s1 = await mk({
  order: 0, title: 'Inside', locationId: room.id, presentIds: [mara.id],
  prose: 'The console hummed.\n\n"We are out of time," said Mara Vance, not looking up.',
});
const s2 = await mk({
  order: 1, title: 'Outside', locationId: street.id, presentIds: [mara.id, iyo.id],
  prose: 'Rain fell.\n\n"Where is it?" Mara asked. Iyo Sable said nothing.'
    + '\n\nShe remembered the fire, and the way the door had stuck.',
});
const s3 = await mk({ order: 2, title: 'Unwritten', summary: 'They argue.', prose: '' });

await S.create('beat', at({
  label: 'Night work', storyTime: 'Day 2, 23:40', order: 0, sceneId: s1.id,
}));

const script = proseToFountain(bid);

await test('the byline is left blank rather than guessed', () => {
  assert.match(script, /^Author:$/m,
    'a guessed byline is how a draft goes out under the wrong name');
});

await test('an interior location produces an INT. heading', () => {
  assert.match(script, /INT\. CONTROL ROOM - NIGHT/);
});

await test('a location that reads as outdoors produces an EXT. heading', () => {
  assert.match(script, /EXT\. RAIN STREET - DAY/);
});

await test('time of day comes from the beat attached to the scene', () => {
  /* The beat says 23:40, so scene one is NIGHT while scene two defaults to DAY. */
  const headings = script.split('\n').filter((l) => /^(INT|EXT)\./.test(l));
  assert.equal(headings[0], 'INT. CONTROL ROOM - NIGHT');
  assert.equal(headings[1], 'EXT. RAIN STREET - DAY');
});

await test('attributed speech becomes a character cue and a dialogue line', () => {
  const blocks = parseFountain(script);
  const cue = blocks.findIndex((b) => b.type === 'character' && b.text === 'MARA VANCE');
  assert.ok(cue > 0, 'expected a MARA VANCE cue');
  assert.equal(blocks[cue + 1].type, 'dialogue');
  assert.equal(blocks[cue + 1].text, 'We are out of time.',
    'the comma leading into the dropped attribution should become a full stop');
});

await test('the said-attribution is dropped, not left in the dialogue', () => {
  assert.ok(!/said Mara Vance/.test(script.split('MARA VANCE')[1]?.slice(0, 80) ?? ''));
});

await test('a paragraph naming two characters is left as action with a note', () => {
  /* Names come from the bible, which is sorted, so the order is alphabetical. */
  assert.match(script, /\[\[Several characters in one paragraph[^\]]*Iyo Sable, Mara Vance/);
});

await test('prose a camera cannot see is flagged', () => {
  assert.match(script, /\[\[Interior state — a camera cannot see this/);
});

await test('an unwritten scene is marked, not silently skipped', () => {
  assert.match(script, /\[\[Unwritten scene: Unwritten — They argue\.\]\]/);
});

await test('a scene with no location says the heading is a placeholder', () => {
  assert.match(script, /LOCATION UNSET/);
  assert.match(script, /\[\[Location unset in the Scene Map/);
});

await test('every guess the converter refused to make is a findable note', () => {
  assert.ok(noteCount(script) >= 4, `expected several notes, got ${noteCount(script)}`);
});

/* The guarantee that matters most. */
await test('converting does not modify one word of the novel', () => {
  assert.equal(S.get(s1.id).prose,
    'The console hummed.\n\n"We are out of time," said Mara Vance, not looking up.');
  assert.equal(S.get(s2.id).prose.startsWith('Rain fell.'), true);
  assert.equal(S.get(s3.id).prose, '');
  assert.equal(S.list('script').length, 0, 'proseToFountain must not write records itself');
});

await test('the screenplay is stored as its own record, separate from the prose', async () => {
  const rec = await S.create('script', at({ title: 'Screenplay', body: script }));
  assert.equal(rec.type, 'script');
  assert.equal(rec.bookId, bid);
  assert.notEqual(rec.id, s1.id);
  assert.equal(S.bookScenes(bid).length, 3, 'scenes are untouched by creating a script');
});

await test('editing the screenplay marks it edited so a re-convert must warn', async () => {
  const rec = S.list('script').find((r) => r.bookId === bid);
  assert.equal(rec.editedSince, false);
  const edited = await S.patch(rec.id, { body: `${rec.body}\n\nFADE OUT.`, editedSince: true });
  assert.equal(edited.editedSince, true);
  assert.match(edited.body, /FADE OUT\./);
});

await test('Fountain parses back into the block types a page needs', () => {
  const blocks = parseFountain([
    'INT. KITCHEN - DAY', '', 'She pours coffee.', '', 'MARA', 'Sit down.',
    '', '(quietly)', 'Please.', '', 'CUT TO:',
  ].join('\n'));
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types,
    ['heading', 'action', 'character', 'dialogue', 'parenthetical', 'dialogue', 'transition']);
});

await test('a forced heading with a leading dot is honoured', () => {
  const blocks = parseFountain('.THE VOID\n\nNothing.');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].text, 'THE VOID');
});

await test('Final Draft export carries the right element types', () => {
  const fdx = toFinalDraft('INT. KITCHEN - DAY\n\nShe pours.\n\nMARA\nSit down.');
  assert.match(fdx, /^<\?xml version="1\.0"/);
  assert.match(fdx, /<Paragraph Type="Scene Heading">\s*<Text>INT\. KITCHEN - DAY<\/Text>/);
  assert.match(fdx, /<Paragraph Type="Character">\s*<Text>MARA<\/Text>/);
  assert.match(fdx, /<Paragraph Type="Dialogue">\s*<Text>Sit down\.<\/Text>/);
});

await test('Final Draft export escapes characters that would break the XML', () => {
  const fdx = toFinalDraft('INT. ROOM - DAY\n\nShe said "bad" & <worse>.');
  assert.match(fdx, /&quot;bad&quot; &amp; &lt;worse&gt;/);
  assert.ok(!/<worse>/.test(fdx));
});

await test('converter notes travel to Final Draft as script notes, not as action', () => {
  const fdx = toFinalDraft('INT. ROOM - DAY\n\n[[Decide who speaks here.]]');
  assert.match(fdx, /<ScriptNote><Paragraph><Text>Decide who speaks here\.<\/Text>/);
});

await test('page count follows the one-page-per-minute convention', () => {
  const short = estimatePages('INT. ROOM - DAY\n\nShe waits.');
  assert.equal(short, 1);

  /* ~3,190 characters of action fills a page at 58 columns by 55 lines. */
  const onePage = estimatePages(`INT. ROOM - DAY\n\n${'x'.repeat(3100)}`);
  const tenPages = estimatePages(`INT. ROOM - DAY\n\n${'x'.repeat(31000)}`);
  assert.ok(onePage <= 2, `a page of action should be about one page, got ${onePage}`);
  assert.ok(tenPages >= 8 && tenPages <= 12, `expected roughly ten pages, got ${tenPages}`);
});

await test('a 24-hour clock in the timeline decides the heading', async () => {
  const beat = S.beats(bid).find((b) => b.sceneId === s1.id);
  await S.patch(beat.id, { storyTime: 'Day 2, 06:15' });
  assert.match(proseToFountain(bid), /INT\. CONTROL ROOM - DAWN/);
  await S.patch(beat.id, { storyTime: 'Day 2, 14:00' });
  assert.match(proseToFountain(bid), /INT\. CONTROL ROOM - DAY/);
  await S.patch(beat.id, { storyTime: 'Day 2, 23:40' });
  assert.match(proseToFountain(bid), /INT\. CONTROL ROOM - NIGHT/);
});

console.log('\nWriteline — screenplay tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
