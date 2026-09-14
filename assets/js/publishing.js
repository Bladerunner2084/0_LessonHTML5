/* publishing.js — the Publishing Center engine (PRD #2 §5–§19).
 *
 * Two principles run through this file.
 *
 * The first is from §5: Writeline reports whether ITS OWN checks passed. It
 * never claims a manuscript is objectively ready, because no software knows
 * that and a product that implies it is setting an author up for a rejection
 * it helped cause. Every status below says what was checked, not what will
 * happen.
 *
 * The second is §19: a publication snapshot is immutable. It records the state
 * of the book at the moment it was declared a candidate, and a later edit must
 * not silently change what the author believed they had approved.
 */

import * as S from './state.js';
import { audit } from './lint.js';
import { runPipeline } from './pipeline.js';
import { compileBook } from './compile.js';
import { zip, xml } from './zip.js';
import { wordCount } from './model.js';

export const PASS = 'PASS';
export const WARNING = 'WARNING';
export const ACTION = 'ACTION REQUIRED';

/* --- readiness ----------------------------------------------------------- */

const check = (label, state, detail, view = null) => ({ label, state, detail, view });

/**
 * PRD §7. Every row is computed; none is a box the author ticks. The overall
 * verdict is the worst row, so a single unresolved contradiction cannot be
 * averaged away by nine green ones.
 */
export function readiness(bookId) {
  const book = S.get(bookId);
  if (!book) return { rows: [], overall: 'NOT READY' };

  const info = S.list('bookinfo').find((r) => r.bookId === bookId) ?? {};
  const findings = audit(bookId);
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warn');
  const scenes = S.bookScenes(bookId);
  const drafted = scenes.filter((s) => ['drafted', 'revised', 'locked'].includes(s.status));
  const manuscriptStage = runPipeline(bookId).find((s) => s.n === 17);
  const matter = S.list('matter').filter((m) => m.bookId === bookId && m.enabled);

  const rows = [
    check('Manuscript completeness',
      manuscriptStage.state === 'done' ? PASS : scenes.length ? WARNING : ACTION,
      manuscriptStage.detail, 'manuscript'),

    check('Continuity',
      errors.length ? ACTION : warnings.length ? WARNING : PASS,
      errors.length ? `${errors.length} contradiction(s) open`
        : warnings.length ? `${warnings.length} risk(s) noted` : 'No contradictions',
      'audit'),

    check('Reader knowledge',
      findings.some((f) => f.rule === 'premature-knowledge') ? ACTION
        : findings.some((f) => f.rule === 'reader-forgot') ? WARNING : PASS,
      findings.filter((f) => ['premature-knowledge', 'reader-forgot', 'never-revealed']
        .includes(f.rule)).length
        ? 'Information findings outstanding' : 'Information flow checks passed',
      'reader'),

    check('Scene purpose',
      findings.some((f) => f.rule === 'scene-purpose-unclear') ? WARNING : PASS,
      `${drafted.length} of ${scenes.length} scene(s) drafted`, 'scenes'),

    check('Canon settled',
      findings.some((f) => f.rule === 'rejected-canon-in-prose') ? ACTION
        : findings.some((f) => f.rule === 'unsettled-dependency') ? WARNING : PASS,
      'Drafted prose resting on unapproved facts', 'audit'),

    check('Book information',
      info.title && info.author ? PASS : ACTION,
      info.title && info.author ? 'Title and author set' : 'Title and author are required',
      'publish'),

    check('Metadata',
      info.description && (info.keywords ?? []).length ? PASS : WARNING,
      info.description ? 'Description present' : 'No description written', 'publish'),

    check('Front matter',
      matter.some((m) => m.side === 'front') ? PASS : WARNING,
      matter.filter((m) => m.side === 'front').length
        ? `${matter.filter((m) => m.side === 'front').length} section(s) enabled`
        : 'No front matter — a copyright page is usually expected', 'publish'),

    check('Back matter',
      matter.some((m) => m.side === 'back') ? PASS : WARNING,
      `${matter.filter((m) => m.side === 'back').length} section(s) enabled`, 'publish'),

    check('Cover',
      info.coverName ? PASS : WARNING,
      info.coverName ? `Cover attached: ${info.coverName}`
        : 'No cover attached. Required by most distributors.', 'publish'),

    check('ISBN',
      info.isbn ? PASS : WARNING,
      info.isbn ? 'ISBN recorded' : 'No ISBN. Not required for every route.', 'publish'),

    check('Export readiness',
      scenes.some((s) => wordCount(s.prose)) ? PASS : ACTION,
      scenes.some((s) => wordCount(s.prose)) ? 'There is prose to export' : 'Nothing written yet',
      'publish'),
  ];

  const overall = rows.some((r) => r.state === ACTION) ? 'ACTION REQUIRED'
    : rows.some((r) => r.state === WARNING) ? 'REVIEW SUGGESTED'
      : 'WRITELINE CHECKS PASSED';

  return { rows, overall, counts: rows.reduce((acc, r) => {
    acc[r.state] = (acc[r.state] ?? 0) + 1;
    return acc;
  }, { [PASS]: 0, [WARNING]: 0, [ACTION]: 0 }) };
}

/* --- shared assembly ------------------------------------------------------ */

const paragraphs = (prose) => String(prose ?? '').trim().split(/\n{2,}/)
  .map((p) => p.trim()).filter(Boolean);

/* Front and back matter are records, so an author can reorder, disable, or
 * write their own. Nothing here is a fixed list of sections. */
function matterFor(bookId, side) {
  return S.list('matter')
    .filter((m) => m.bookId === bookId && m.side === side && m.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function assemble(bookId) {
  const book = compileBook(bookId);
  const info = S.list('bookinfo').find((r) => r.bookId === bookId) ?? {};
  return {
    info: {
      title: info.title || book.title || 'Untitled',
      subtitle: info.subtitle ?? '',
      author: info.author || '',
      language: info.language || 'en',
      isbn: info.isbn ?? '',
      publisher: info.publisher ?? '',
      copyrightYear: info.copyrightYear || String(new Date().getFullYear()),
      copyrightHolder: info.copyrightHolder || info.author || '',
      description: info.description ?? '',
    },
    front: matterFor(bookId, 'front'),
    back: matterFor(bookId, 'back'),
    chapters: book.chapters,
    words: book.words,
  };
}

/* --- EPUB (PRD §14) ------------------------------------------------------- */

const CSS = `body{font-family:Georgia,serif;line-height:1.6;margin:1em}
h1,h2{font-weight:normal;text-align:center;margin:2em 0 1em}
p{margin:0;text-indent:1.5em}
h1+p,h2+p,hr+p,p.first{text-indent:0}
hr.scene{border:0;text-align:center;margin:1.5em 0}
hr.scene:after{content:"* * *";letter-spacing:.5em;color:#666}`;

const xhtml = (title, body, lang) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(lang)}">
<head><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body></html>`;

export function buildEpub(bookId) {
  const doc = assemble(bookId);
  const { info } = doc;
  const uid = `urn:uuid:${bookId}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const files = [];
  const manifest = [];
  const spine = [];
  const navItems = [];

  const addDoc = (id, name, title, body) => {
    files.push({ name: `OEBPS/${name}`, data: xhtml(title, body, info.language) });
    manifest.push(`<item id="${id}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    navItems.push(`<li><a href="${name}">${xml(title)}</a></li>`);
  };

  /* Title page and copyright page are always written — an EPUB without a
   * copyright page is the single most common thing a distributor bounces. */
  addDoc('titlepage', 'title.xhtml', info.title,
    `<h1>${xml(info.title)}</h1>${info.subtitle ? `<h2>${xml(info.subtitle)}</h2>` : ''}`
    + (info.author ? `<p style="text-align:center">${xml(info.author)}</p>` : ''));

  addDoc('copyright', 'copyright.xhtml', 'Copyright',
    `<p class="first">Copyright © ${xml(info.copyrightYear)} ${xml(info.copyrightHolder)}</p>`
    + (info.publisher ? `<p class="first">${xml(info.publisher)}</p>` : '')
    + (info.isbn ? `<p class="first">ISBN ${xml(info.isbn)}</p>` : '')
    + '<p class="first">All rights reserved.</p>');

  doc.front.forEach((m, i) => addDoc(`front${i}`, `front${i}.xhtml`, m.title,
    paragraphs(m.body).map((p) => `<p>${xml(p)}</p>`).join('\n')));

  doc.chapters.forEach((ch, i) => {
    const body = [`<h2>${xml(`${ch.number}. ${ch.title}`)}</h2>`];
    ch.scenes.forEach((scene, si) => {
      if (si > 0) body.push('<hr class="scene"/>');
      const paras = paragraphs(scene.prose);
      body.push(paras.length
        ? paras.map((p, pi) => `<p${pi === 0 ? ' class="first"' : ''}>${xml(p)}</p>`).join('\n')
        : '<p class="first"><em>[unwritten]</em></p>');
    });
    addDoc(`ch${i}`, `ch${String(i).padStart(3, '0')}.xhtml`, `${ch.number}. ${ch.title}`,
      body.join('\n'));
  });

  doc.back.forEach((m, i) => addDoc(`back${i}`, `back${i}.xhtml`, m.title,
    paragraphs(m.body).map((p) => `<p>${xml(p)}</p>`).join('\n')));

  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(info.language)}">
<head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${navItems.join('\n')}
</ol></nav></body></html>`;

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xml(info.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${xml(uid)}</dc:identifier>
    <dc:title>${xml(info.title)}</dc:title>
    <dc:language>${xml(info.language)}</dc:language>
${info.author ? `    <dc:creator>${xml(info.author)}</dc:creator>\n` : ''}${info.description ? `    <dc:description>${xml(info.description)}</dc:description>\n` : ''}${info.publisher ? `    <dc:publisher>${xml(info.publisher)}</dc:publisher>\n` : ''}    <dc:rights>Copyright © ${xml(info.copyrightYear)} ${xml(info.copyrightHolder)}</dc:rights>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifest.map((m) => `    ${m}`).join('\n')}
  </manifest>
  <spine>
${spine.map((s) => `    ${s}`).join('\n')}
  </spine>
</package>`;

  /* Order matters: mimetype must be the first entry in the archive. */
  return zip([
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>` },
    { name: 'OEBPS/package.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: CSS },
    ...files,
  ], 'application/epub+zip');
}

/* --- DOCX (PRD §18) ------------------------------------------------------- */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const para = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}`
  + `<w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;

export function buildDocx(bookId) {
  const doc = assemble(bookId);
  const body = [];

  body.push(para(doc.info.title, 'Title'));
  if (doc.info.subtitle) body.push(para(doc.info.subtitle, 'Subtitle'));
  if (doc.info.author) body.push(para(doc.info.author));
  body.push(para(`Copyright © ${doc.info.copyrightYear} ${doc.info.copyrightHolder}`));

  for (const m of doc.front) {
    body.push(para(m.title, 'Heading1'));
    paragraphs(m.body).forEach((p) => body.push(para(p)));
  }

  for (const ch of doc.chapters) {
    body.push(para(`${ch.number}. ${ch.title}`, 'Heading1'));
    ch.scenes.forEach((scene, i) => {
      if (i > 0) body.push(para('* * *'));
      const paras = paragraphs(scene.prose);
      if (paras.length) paras.forEach((p) => body.push(para(p)));
      else body.push(para('[unwritten]'));
    });
  }

  for (const m of doc.back) {
    body.push(para(m.title, 'Heading1'));
    paragraphs(m.body).forEach((p) => body.push(para(p)));
  }

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:sz w:val="56"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/>
    <w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
    <w:pPr><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="480" w:after="360"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
</w:styles>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>
${body.join('\n')}
</w:body></w:document>`;

  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name: 'word/styles.xml', data: styles },
    { name: 'word/document.xml', data: document },
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

/* --- publication snapshots (PRD §19) -------------------------------------- */

/**
 * Immutable by construction: the record stores a serialised copy of everything
 * the candidate was made from, so a later edit to the manuscript cannot reach
 * backwards and change what the author approved.
 */
export async function createPublication(bookId, label) {
  const doc = assemble(bookId);
  const state = readiness(bookId);
  const book = S.get(bookId);

  return S.create('publication', {
    projectId: book.projectId,
    bookId,
    label: label || nextLabel(bookId),
    words: doc.words,
    overall: state.overall,
    checks: JSON.stringify(state.rows),
    info: JSON.stringify(doc.info),
    frozen: JSON.stringify({
      chapters: doc.chapters,
      front: doc.front.map(({ title, body }) => ({ title, body })),
      back: doc.back.map(({ title, body }) => ({ title, body })),
    }),
  });
}

function nextLabel(bookId) {
  const existing = S.list('publication').filter((p) => p.bookId === bookId);
  return `Publication Candidate ${existing.length + 1}.0`;
}

export const publications = (bookId) =>
  S.list('publication').filter((p) => p.bookId === bookId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
