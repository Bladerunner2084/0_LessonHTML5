/* tests/io.mjs — getting a manuscript in, and finding things in it.
 *
 * The .docx parser is hand-rolled ZIP and XML with no dependencies, so it is
 * tested against a real ZIP built here rather than trusted.
 *
 *   node tests/io.mjs
 */

import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import * as S from '../assets/js/state.js';
import { detectStructure, parseDocx } from '../assets/js/import.js';
import { search } from '../assets/js/search.js';

let passed = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); passed += 1; results.push(`  ok   ${name}`); }
  catch (err) { results.push(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
};

/* --- structure detection -------------------------------------------------- */

await test('markdown headings become chapters', () => {
  const r = detectStructure('# One\n\nAlpha text.\n\n# Two\n\nBeta text.\n\n# Three\n\nGamma.');
  assert.equal(r.strategyId, 'markdown');
  assert.equal(r.chapterCount, 3);
  assert.deepEqual(r.chapters.map((c) => c.title), ['One', 'Two', 'Three']);
});

await test('“Chapter One” headings become chapters', () => {
  const r = detectStructure(
    'Chapter One\n\nAlpha.\n\nChapter Two\n\nBeta.\n\nChapter Three\n\nGamma.');
  assert.equal(r.strategyId, 'named');
  assert.equal(r.chapterCount, 3);
  assert.match(r.chapters[0].title, /Chapter One/i);
});

/* Two headings is a coincidence; three is a structure. */
await test('fewer than three headings is not treated as a structure', () => {
  const r = detectStructure('Chapter One\n\nAlpha.\n\nChapter Two\n\nBeta.');
  assert.equal(r.strategyId, 'none');
  assert.equal(r.chapterCount, 1);
});

await test('a manuscript with no headings imports as one chapter, not zero', () => {
  const r = detectStructure('Just prose.\n\nMore prose.\n\nAnd more.');
  assert.equal(r.chapterCount, 1);
  assert.equal(r.sceneCount, 1);
  assert.equal(r.strategyId, 'none');
});

await test('scene breaks split a chapter into scenes', () => {
  const r = detectStructure(
    '# One\n\nFirst scene text.\n\n* * *\n\nSecond scene text.\n\n---\n\nThird scene text.'
    + '\n\n# Two\n\nOnly one here.\n\n# Three\n\nAnd here.');
  assert.equal(r.chapters[0].scenes.length, 3);
  assert.equal(r.chapters[1].scenes.length, 1);
  assert.equal(r.sceneCount, 5);
});

await test('scenes are named from their opening words so a list is navigable', () => {
  const r = detectStructure('# One\n\nThe rain at Terminus does not fall so much as accumulate.'
    + '\n\n# Two\n\nShe woke.\n\n# Three\n\nHe left.');
  assert.match(r.chapters[0].scenes[0].title, /^The rain at Terminus/);
  assert.ok(r.chapters[0].scenes[0].title.length <= 60);
});

await test('the word count reported is the whole file, not the split', () => {
  const r = detectStructure('# One\n\nalpha beta gamma\n\n# Two\n\ndelta\n\n# Three\n\nepsilon');
  assert.equal(r.words, 8);   // three headings plus five body words
});

/* --- .docx ---------------------------------------------------------------- */

/* Build a real (minimal) ZIP so the parser is tested against the format rather
 * than against a fixture somebody hand-waved. */
function makeZip(name, contents) {
  const nameBytes = Buffer.from(name, 'utf8');
  const raw = Buffer.from(contents, 'utf8');
  const deflated = deflateRawSync(raw);
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);           // deflate
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const localChunk = Buffer.concat([local, nameBytes, deflated]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);        // offset of the local header

  const centralChunk = Buffer.concat([central, nameBytes]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralChunk.length, 12);
  eocd.writeUInt32LE(localChunk.length, 16);

  return Buffer.concat([localChunk, centralChunk, eocd]);
}

const DOCX_XML = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>'
  + '<w:p><w:r><w:t>Chapter One</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t xml:space="preserve">The rain </w:t></w:r>'
  + '<w:r><w:t>&amp; the cold.</w:t></w:r></w:p>'
  + '<w:p/>'
  + '<w:p><w:r><w:t>She waited.</w:t></w:r></w:p>'
  + '</w:body></w:document>';

await test('a .docx is unzipped and read without any dependency', async () => {
  const zip = makeZip('word/document.xml', DOCX_XML);
  const text = await parseDocx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
  assert.match(text, /^Chapter One/);
  assert.match(text, /The rain & the cold\./, 'runs must be joined and entities decoded');
  assert.match(text, /She waited\./);
});

await test('runs split mid-sentence by Word are rejoined', async () => {
  const zip = makeZip('word/document.xml', DOCX_XML);
  const text = await parseDocx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
  assert.ok(!text.includes('The rain\n'), 'a run boundary must not become a line break');
});

await test('a file that is not a zip fails with a readable message', async () => {
  await assert.rejects(
    () => parseDocx(new Uint8Array([1, 2, 3, 4, 5]).buffer),
    /not a valid \.docx file/);
});

/* --- search --------------------------------------------------------------- */

await S.load();
const project = await S.create('project', { title: 'Search Test', kind: 'novel' });
const book = await S.create('book', { projectId: project.id, title: 'Search Test', order: 0 });
S.setUi({ projectId: project.id, bookId: book.id });
const at = (f) => ({ projectId: project.id, bookId: book.id, ...f });

const cradle = await S.create('entity', at({
  kind: 'location', name: 'The Cradle', summary: 'The archive itself.',
}));
const chapter = await S.create('chapter', at({ title: 'Handoff', order: 0 }));
const sceneA = await S.create('scene', at({
  chapterId: chapter.id, order: 0, title: 'Terminus',
  prose: 'She carried the buffer past the Cradle and did not look up. The rain kept on.',
}));
await S.create('scene', at({
  chapterId: chapter.id, order: 1, title: 'Return leg',
  prose: 'Nothing here mentions the archive at all.',
}));

await test('an empty query returns nothing rather than everything', () => {
  assert.deepEqual(search(''), []);
  assert.deepEqual(search('   '), []);
});

await test('a word in the prose finds the scene that contains it', () => {
  const hits = search('buffer');
  assert.ok(hits.some((r) => r.id === sceneA.id), 'expected the scene carrying the word');
  assert.equal(hits.find((r) => r.id === sceneA.id).view, 'scenes');
});

await test('a name in the bible outranks a passing mention in prose', () => {
  const hits = search('cradle');
  assert.equal(hits[0].id, cradle.id,
    'the record named for the term should rank above a scene mentioning it');
  assert.equal(hits[0].view, 'world', 'a location belongs to the World Bible');
});

await test('every term must appear — this is an AND search', () => {
  assert.ok(search('cradle buffer').some((r) => r.id === sceneA.id));
  assert.equal(search('cradle unicorn').length, 0,
    'a term that appears nowhere must eliminate the record');
});

await test('results carry a snippet with the term marked', () => {
  const hit = search('buffer').find((r) => r.id === sceneA.id);
  assert.ok(hit.snippet.length, 'expected a snippet');
  const marked = hit.snippet.filter((run) => run.hit).map((run) => run.text.toLowerCase());
  assert.ok(marked.includes('buffer'));
  assert.ok(hit.snippet.map((r) => r.text).join('').includes('carried the buffer'));
});

await test('search is scoped to the open project', async () => {
  const other = await S.create('project', { title: 'Elsewhere', kind: 'novel' });
  const otherBook = await S.create('book', { projectId: other.id, title: 'Elsewhere', order: 0 });
  const otherChapter = await S.create('chapter', {
    projectId: other.id, bookId: otherBook.id, order: 0, title: 'Hidden',
  });
  await S.create('scene', {
    projectId: other.id, bookId: otherBook.id, chapterId: otherChapter.id, order: 0,
    title: 'Hidden scene', prose: 'The buffer appears here too.',
  });
  const hits = search('buffer', { projectId: project.id, bookId: book.id });
  assert.ok(!hits.some((r) => r.title === 'Hidden scene'),
    'another project’s records must not surface');
});

await test('search is case-insensitive and ignores punctuation around terms', () => {
  assert.ok(search('CRADLE').length > 0);
  assert.ok(search('  cradle,  ').length > 0);
});

console.log('\nWriteline — import and search tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
