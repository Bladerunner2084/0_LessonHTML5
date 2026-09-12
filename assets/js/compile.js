/* compile.js — the Manuscript is not a document you write in. It is the
 * deterministic output of the scene graph. You never edit it directly, which
 * is precisely why it can never drift out of sync with the Scene Map.
 */

import * as S from './state.js';
import { wordCount } from './model.js';

export function compileBook(bookId, { includeNotes = false } = {}) {
  const book = S.get(bookId);
  if (!book) return { title: '', chapters: [], words: 0 };

  const chapters = S.chapters(bookId).map((ch, i) => {
    const scenes = S.scenesOf(ch.id).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      pov: s.pov ? S.entityName(s.pov) : null,
      location: s.locationId ? S.entityName(s.locationId) : null,
      prose: s.prose ?? '',
      words: wordCount(s.prose),
    }));
    return {
      id: ch.id,
      number: i + 1,
      title: ch.title,
      summary: includeNotes ? ch.summary : '',
      scenes,
      words: scenes.reduce((n, s) => n + s.words, 0),
      targetWords: ch.targetWords,
    };
  });

  return {
    title: book.title,
    chapters,
    words: chapters.reduce((n, c) => n + c.words, 0),
  };
}

/* Scene-break convention: a blank line, a centred divider, a blank line.
 * Chapter breaks are headings. Nothing else is invented — the writer's prose
 * passes through untouched so a compile is always reversible by eye. */
export function toMarkdown(bookId, opts = {}) {
  const book = compileBook(bookId, opts);
  const lines = [`# ${book.title}`, ''];
  for (const ch of book.chapters) {
    lines.push(`## ${ch.number}. ${ch.title}`, '');
    if (ch.summary) lines.push(`> ${ch.summary}`, '');
    ch.scenes.forEach((scene, i) => {
      if (i > 0) lines.push('', '* * *', '');
      if (opts.sceneHeadings) {
        const meta = [scene.pov && `POV ${scene.pov}`, scene.location].filter(Boolean).join(' · ');
        lines.push(`### ${scene.title}${meta ? ` — ${meta}` : ''}`, '');
      }
      lines.push(scene.prose.trim() || '_[unwritten]_');
    });
    lines.push('');
  }
  return lines.join('\n');
}

export function toHtml(bookId, opts = {}) {
  const book = compileBook(bookId, opts);
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const paras = (prose) => prose.trim().split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');

  const body = book.chapters.map((ch) => {
    const scenes = ch.scenes.map((s, i) => {
      const divider = i > 0 ? '<hr class="scene-break">' : '';
      return `${divider}\n${s.prose.trim() ? paras(s.prose) : '<p><em>[unwritten]</em></p>'}`;
    }).join('\n');
    return `<section class="chapter">\n<h2>${ch.number}. ${esc(ch.title)}</h2>\n${scenes}\n</section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(book.title)}</title>
<style>
  body{max-width:34em;margin:4rem auto;padding:0 1.25rem;font:1.05rem/1.7 Georgia,serif;color:#1b1b1b}
  h1{font-size:1.9rem;text-align:center;margin-bottom:3rem}
  h2{font-size:1.25rem;margin:3.5rem 0 1.5rem;text-align:center;font-weight:normal;letter-spacing:.08em;text-transform:uppercase}
  p{margin:0;text-indent:1.5em}
  h2+p,hr+p{text-indent:0}
  hr.scene-break{border:0;margin:1.6rem 0;text-align:center}
  hr.scene-break::before{content:"* * *";letter-spacing:.5em;color:#888}
  @media print{body{margin:0;max-width:none}h2{page-break-before:always}}
</style></head>
<body><h1>${esc(book.title)}</h1>
${body}
</body></html>`;
}

/* The Story/Character/World Bibles compile too — an editor or a collaborator
 * needs them as one readable document, not as a UI you have to click through. */
export function bibleToMarkdown(bookId, kinds, heading) {
  const lines = [`# ${heading}`, ''];
  for (const kind of kinds) {
    const rows = S.entities(bookId, kind);
    if (!rows.length) continue;
    lines.push(`## ${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`, '');
    for (const e of rows) {
      lines.push(`### ${e.name}`);
      if (e.aliases?.length) lines.push(`*Also known as: ${e.aliases.join(', ')}*`);
      if (e.summary) lines.push('', e.summary);
      for (const [k, v] of Object.entries(e.fields ?? {})) {
        if (v) lines.push('', `**${k}:** ${v}`);
      }
      if (e.notes) lines.push('', e.notes);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function timelineToMarkdown(bookId) {
  const lines = ['# Timeline', ''];
  for (const b of S.beats(bookId)) {
    const who = (b.entityIds ?? []).map(S.entityName).join(', ');
    const scene = b.sceneId ? S.get(b.sceneId)?.title : null;
    lines.push(`- **${b.storyTime || '—'}** · ${b.label}`
      + `${who ? ` — ${who}` : ''}${scene ? ` *(dramatised in “${scene}”)*` : ''}`);
    if (b.description) lines.push(`  ${b.description}`);
  }
  return lines.join('\n');
}

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (text) =>
  String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
