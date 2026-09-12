/* import.js — getting an existing manuscript in.
 *
 * PRD Phase 1: import the author's existing manuscript and destroy nothing.
 * Until now there was no way to do it, which made the application unusable for
 * the only people qualified to judge it — writers who already have a book.
 *
 * Formats: .txt, .md and .fountain are text. .docx is a ZIP of XML, and it is
 * the one writers actually have, so it is parsed here rather than pushed back
 * onto the author as "please save as plain text first". No dependencies: the ZIP
 * central directory is walked by hand and the entries are inflated with the
 * platform's own DecompressionStream.
 *
 * Detection is heuristic and says so. The import screen shows what it found and
 * refuses to commit until the author has looked at it — a wrong split silently
 * applied to a 90,000-word manuscript is a bad afternoon.
 */

const DEC = new TextDecoder();

/* --- .docx ---------------------------------------------------------------- */

const u16 = (view, at) => view.getUint16(at, true);
const u32 = (view, at) => view.getUint32(at, true);

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

function findEocd(view) {
  /* The end-of-central-directory record sits within the last 64KB, after a
   * comment of unknown length, so it has to be scanned for backwards. */
  const start = Math.max(0, view.byteLength - 66_000);
  for (let i = view.byteLength - 22; i >= start; i -= 1) {
    if (u32(view, i) === EOCD_SIG) return i;
  }
  return -1;
}

async function inflate(bytes, method) {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error(`unsupported zip compression method ${method}`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot decompress .docx — save as .txt or .md instead');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buffer, wanted) {
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('not a valid .docx file');

  let at = u32(view, eocd + 16);
  const count = u16(view, eocd + 10);

  for (let i = 0; i < count; i += 1) {
    if (u32(view, at) !== CD_SIG) break;
    const method = u16(view, at + 10);
    const compressedSize = u32(view, at + 20);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const localAt = u32(view, at + 42);
    const name = DEC.decode(new Uint8Array(buffer, at + 46, nameLen));

    if (name === wanted) {
      const localNameLen = u16(view, localAt + 26);
      const localExtraLen = u16(view, localAt + 28);
      const dataAt = localAt + 30 + localNameLen + localExtraLen;
      return inflate(new Uint8Array(buffer, dataAt, compressedSize), method);
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found inside the file`);
}

const unescapeXml = (text) => text
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&');

export async function parseDocx(buffer) {
  const xml = DEC.decode(await readZipEntry(buffer, 'word/document.xml'));
  const paragraphs = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)].map((m) => {
    const runs = [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]);
    return unescapeXml(runs.join('')).replace(/<w:br\s*\/>/g, '\n').trim();
  });
  /* Word writes one paragraph per block; a blank one is the writer's own break. */
  return paragraphs.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function readManuscriptFile(file) {
  const name = (file.name ?? '').toLowerCase();
  if (name.endsWith('.docx')) return parseDocx(await file.arrayBuffer());
  if (name.endsWith('.doc')) {
    throw new Error('Old .doc files cannot be read. Save as .docx, .txt or .md first.');
  }
  return file.text();
}

/* --- structure detection -------------------------------------------------- */

const MD_HEADING = /^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/;
const NAMED_CHAPTER = /^\s*(chapter|part|book)\b[\s.:–—-]*(.{0,60})$/i;
const NUMERIC_ONLY = /^\s*(\d{1,3}|[ivxlcdm]{1,7})\s*[.:]?\s*$/i;
const SCENE_BREAK = /^\s*(?:[*#~•·—–-]\s*){3,}\s*$|^\s*<\s*>\s*$|^\s*§\s*$/;

const isShoutedTitle = (line) =>
  line.length > 0 && line.length <= 60
  && line === line.toUpperCase() && /[A-Z]/.test(line) && !/[.!?,;]$/.test(line);

/* Returns the strategy as well as the result, because the author has to be able
 * to see WHY it split where it did before agreeing to it. */
export function detectStructure(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');

  const candidates = [
    { id: 'markdown', label: 'Markdown headings', test: (l) => MD_HEADING.exec(l)?.[1] },
    {
      id: 'named',
      label: '“Chapter One” style headings',
      test: (l) => {
        const m = NAMED_CHAPTER.exec(l.trim());
        if (!m) return null;
        return m[2]?.trim() ? `${m[1]} ${m[2]}`.trim() : m[1];
      },
    },
    { id: 'numeric', label: 'Bare chapter numbers', test: (l) => (NUMERIC_ONLY.test(l.trim()) ? l.trim() : null) },
    { id: 'caps', label: 'Capitalised title lines', test: (l) => (isShoutedTitle(l.trim()) ? l.trim() : null) },
  ];

  /* Pick the first strategy that finds enough headings to be a real structure
   * rather than a coincidence. Two is not a pattern. */
  let strategy = null;
  for (const candidate of candidates) {
    const hits = lines.filter((l) => candidate.test(l)).length;
    if (hits >= 3) { strategy = candidate; break; }
  }

  const chapters = [];
  let current = null;
  let buffer = [];

  const flush = () => {
    if (!current) return;
    current.body = buffer.join('\n').trim();
    chapters.push(current);
    buffer = [];
  };

  for (const line of lines) {
    const title = strategy?.test(line);
    if (title) {
      flush();
      current = { title: title.slice(0, 80), body: '' };
      continue;
    }
    if (!current) current = { title: 'Chapter One', body: '' };
    buffer.push(line);
  }
  flush();

  const withScenes = chapters
    .map((chapter) => ({ ...chapter, scenes: splitScenes(chapter.body) }))
    .filter((chapter) => chapter.scenes.length);

  return {
    strategy: strategy?.label ?? 'No headings found — imported as one chapter',
    strategyId: strategy?.id ?? 'none',
    chapters: withScenes,
    chapterCount: withScenes.length,
    sceneCount: withScenes.reduce((n, c) => n + c.scenes.length, 0),
    words: (String(text).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length,
  };
}

function splitScenes(body) {
  const chunks = [];
  let buffer = [];
  for (const line of body.split('\n')) {
    if (SCENE_BREAK.test(line)) {
      if (buffer.join('\n').trim()) chunks.push(buffer.join('\n').trim());
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  if (buffer.join('\n').trim()) chunks.push(buffer.join('\n').trim());

  return chunks.map((prose) => ({ title: titleFor(prose), prose: tidy(prose) }));
}

/* A scene needs a name you can find it by in a list of four hundred. The opening
 * words are the only thing available that a human would recognise. */
function titleFor(prose) {
  const first = tidy(prose).split(/\n/)[0] ?? '';
  const words = first.replace(/^["“'‘]/, '').split(/\s+/).slice(0, 8).join(' ');
  return (words.length > 58 ? `${words.slice(0, 58)}…` : words) || 'Untitled scene';
}

const tidy = (text) => text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();
