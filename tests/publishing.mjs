/* tests/publishing.mjs — the Publishing Center (PRD #2 §5–§19).
 *
 * The export formats are hand-built ZIP archives with no dependency, so they
 * are verified by being read back rather than trusted. The DOCX is parsed with
 * this application's own .docx importer — if the round trip loses a word, the
 * file Word receives is wrong too.
 *
 *   node tests/publishing.mjs
 */

import assert from 'node:assert/strict';
import * as S from '../assets/js/state.js';
import { seedDemo } from '../assets/js/seed.js';
import {
  readiness, assemble, buildEpub, buildDocx, createPublication, publications,
  PASS, WARNING, ACTION,
} from '../assets/js/publishing.js';
import { parseDocx } from '../assets/js/import.js';
import { crc32 } from '../assets/js/zip.js';

let passed = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); passed += 1; results.push(`  ok   ${name}`); }
  catch (err) { results.push(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
};

const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const text = (buf) => new TextDecoder().decode(buf);

/* Read an entry straight back out of the archive we produced. */
function entryNames(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const names = [];
  for (let i = 0; i < buf.length - 4; i += 1) {
    if (view.getUint32(i, true) === 0x02014b50) {
      const len = view.getUint16(i + 28, true);
      names.push(text(buf.subarray(i + 46, i + 46 + len)));
    }
  }
  return names;
}

await S.load();
const project = await seedDemo();
const bookId = S.books(project.id)[0].id;
const at = (f) => ({ projectId: project.id, bookId, ...f });

await test('CRC-32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

/* --- readiness ----------------------------------------------------------- */

await test('readiness reports every required check', () => {
  const r = readiness(bookId);
  assert.ok(r.rows.length >= 12, `${r.rows.length} rows`);
  for (const row of r.rows) {
    assert.ok(row.label && row.detail, JSON.stringify(row));
    assert.ok([PASS, WARNING, ACTION].includes(row.state), row.state);
  }
});

/* PRD §5: never claim a book is objectively ready. */
await test('the verdict describes Writeline’s own checks, not publishability', () => {
  const r = readiness(bookId);
  assert.ok(['WRITELINE CHECKS PASSED', 'REVIEW SUGGESTED', 'ACTION REQUIRED']
    .includes(r.overall), r.overall);
  assert.ok(!/ready for publication|will be accepted|guarantee/i.test(r.overall));
});

await test('an open contradiction forces ACTION REQUIRED, not an average', () => {
  const r = readiness(bookId);
  const continuity = r.rows.find((row) => row.label === 'Continuity');
  assert.equal(continuity.state, ACTION, 'the demo ships with planted contradictions');
  assert.equal(r.overall, 'ACTION REQUIRED',
    'one unresolved contradiction must not be averaged away by green rows');
});

await test('missing title and author is an action, not a warning', () => {
  const row = readiness(bookId).rows.find((r) => r.label === 'Book information');
  assert.equal(row.state, ACTION);
});

await test('recording book information clears that check', async () => {
  await S.create('bookinfo', at({
    title: 'The Last Signal', author: 'A. Author', copyrightYear: '2026',
    copyrightHolder: 'A. Author', description: 'A relay picks up a message with no sender.',
    keywords: ['science fiction'], isbn: '978-0-000000-0-0',
  }));
  const rows = readiness(bookId).rows;
  assert.equal(rows.find((r) => r.label === 'Book information').state, PASS);
  assert.equal(rows.find((r) => r.label === 'Metadata').state, PASS);
  assert.equal(rows.find((r) => r.label === 'ISBN').state, PASS);
});

/* --- assembly ------------------------------------------------------------ */

await test('front and back matter are records the author controls', async () => {
  await S.create('matter', at({ side: 'front', title: 'Dedication', body: 'For nobody.', order: 0 }));
  await S.create('matter', at({ side: 'front', title: 'Disabled', body: 'x', enabled: false, order: 1 }));
  await S.create('matter', at({ side: 'back', title: 'About the Author', body: 'A person.', order: 0 }));

  const doc = assemble(bookId);
  assert.equal(doc.front.length, 1, 'a disabled section must not be assembled');
  assert.equal(doc.front[0].title, 'Dedication');
  assert.equal(doc.back.length, 1);
});

/* --- EPUB ---------------------------------------------------------------- */

const epub = await bytes(buildEpub(bookId));

await test('the EPUB names mimetype first, as the specification requires', () => {
  assert.equal(text(epub.subarray(30, 38)), 'mimetype');
  assert.equal(text(epub.subarray(38, 58)), 'application/epub+zip');
});

await test('the EPUB carries the parts a reader needs to open it', () => {
  const names = entryNames(epub);
  for (const required of ['mimetype', 'META-INF/container.xml', 'OEBPS/package.opf',
    'OEBPS/nav.xhtml', 'OEBPS/style.css']) {
    assert.ok(names.includes(required), `${required} missing from ${names.join(', ')}`);
  }
  assert.ok(names.filter((n) => /^OEBPS\/ch\d+\.xhtml$/.test(n)).length === 3,
    'one document per chapter');
});

await test('the package document carries the author’s metadata', () => {
  const opf = text(epub);
  assert.match(opf, /<dc:title>The Last Signal<\/dc:title>/);
  assert.match(opf, /<dc:creator>A\. Author<\/dc:creator>/);
  assert.match(opf, /<dc:language>en<\/dc:language>/);
  assert.match(opf, /dcterms:modified/);
  assert.match(opf, /Copyright © 2026 A\. Author/);
});

await test('a copyright page is always written', () => {
  assert.match(text(epub), /OEBPS\/copyright\.xhtml/);
});

await test('prose reaches the EPUB, and XML metacharacters are escaped', async () => {
  const scene = S.bookScenes(bookId)[0];
  await S.patch(scene.id, { prose: 'She said "stop" & <meant> it.' });
  const again = text(await bytes(buildEpub(bookId)));
  assert.match(again, /She said &quot;stop&quot; &amp; &lt;meant&gt; it\./);
  assert.ok(!again.includes('<meant>'), 'raw angle brackets would break the XHTML');
});

await test('every chapter appears in the navigation document', () => {
  const nav = text(epub);
  for (const title of ['Handoff', 'Residue', 'The Vault']) {
    assert.ok(nav.includes(title), `${title} missing from the EPUB`);
  }
});

/* --- DOCX ---------------------------------------------------------------- */

const docx = await bytes(buildDocx(bookId));

await test('the DOCX carries the parts Word requires', () => {
  const names = entryNames(docx);
  for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml',
    'word/styles.xml', 'word/_rels/document.xml.rels']) {
    assert.ok(names.includes(required), `${required} missing`);
  }
});

/* The round trip that matters: our own .docx reader must be able to read what
 * our own .docx writer produced. If it cannot, Word probably cannot either. */
await test('the DOCX reads back through this application’s own importer', async () => {
  const read = await parseDocx(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.length));
  assert.match(read, /The Last Signal/);
  assert.match(read, /Copyright © 2026 A\. Author/);
  assert.match(read, /1\. Handoff/);
  /* Scene one's prose was replaced by the escaping test above, so assert on a
   * scene that still has its original text. */
  assert.match(read, /She woke with a memory of a kitchen/);
  assert.match(read, /About the Author/);
});

await test('the DOCX escapes XML metacharacters too', async () => {
  const read = await parseDocx(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.length));
  assert.match(read, /She said "stop" & <meant> it\./,
    'the importer should decode exactly what the writer encoded');
});

/* --- publication snapshots ------------------------------------------------ */

await test('a publication candidate records the state it was approved in', async () => {
  const pub = await createPublication(bookId);
  assert.match(pub.label, /^Publication Candidate 1\.0$/);
  assert.ok(pub.words > 0);
  assert.ok(pub.overall.length > 0);
  assert.ok(JSON.parse(pub.checks).length >= 12);
  assert.equal(JSON.parse(pub.info).title, 'The Last Signal');
});

/* PRD §19: once created, a snapshot must not silently change. */
await test('editing the manuscript afterwards does not change the snapshot', async () => {
  const pub = publications(bookId)[0];
  const frozenBefore = pub.frozen;
  const wordsBefore = pub.words;

  const scene = S.bookScenes(bookId)[0];
  await S.patch(scene.id, { prose: 'Completely different prose, much longer than before. '.repeat(20) });

  const after = S.get(pub.id);
  assert.equal(after.frozen, frozenBefore, 'the frozen copy changed under the author');
  assert.equal(after.words, wordsBefore);
  assert.ok(!after.frozen.includes('Completely different prose'));
});

await test('each new candidate gets its own label and leaves the last alone', async () => {
  const second = await createPublication(bookId);
  assert.equal(second.label, 'Publication Candidate 2.0');
  assert.equal(publications(bookId).length, 2);
  assert.notEqual(publications(bookId)[0].id, publications(bookId)[1].id);
});

console.log('\nWriteline — publishing centre tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
