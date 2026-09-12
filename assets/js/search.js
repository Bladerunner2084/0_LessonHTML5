/* search.js — find anything, across everything.
 *
 * Its absence was the single most obvious sign the application had never met a
 * real manuscript. At 90,000 words "which scene mentions the Cradle?" is not a
 * convenience, it is the difference between a usable tool and a filing cabinet
 * you cannot open.
 *
 * No index is maintained. The corpus is a few hundred records, the whole search
 * runs in single-digit milliseconds, and a stale index is a whole class of bug
 * this application has spent its entire design avoiding.
 */

import * as S from './state.js';

/* What counts as text on each record, and where a hit sends you. The `weight`
 * on a field is how much a match there is worth: a name is a stronger signal
 * than one mention in eight pages of prose. */
const FIELDS = {
  scene:        { view: 'scenes',      icon: '◆', label: 'Scene',
    text: (r) => [[r.title, 6], [r.summary, 3], [r.prose, 1]] },
  chapter:      { view: 'chapters',    icon: '▤', label: 'Chapter',
    text: (r) => [[r.title, 6], [r.summary, 3]] },
  entity:       { view: 'character',   icon: '◈', label: 'Bible',
    text: (r) => [[r.name, 8], [(r.aliases ?? []).join(' '), 6], [r.summary, 3],
      [Object.values(r.fields ?? {}).join('\n'), 2], [r.notes, 1]] },
  beat:         { view: 'timeline',    icon: '◉', label: 'Beat',
    text: (r) => [[r.label, 6], [r.storyTime, 4], [r.description, 2]] },
  revelation:   { view: 'revelations', icon: '⬢', label: 'Revelation',
    text: (r) => [[r.label, 6], [r.fact, 3], [r.purpose, 2], [r.consequences, 2]] },
  note:         { view: 'draft0',      icon: '▤', label: 'Note',
    text: (r) => [[r.title, 5], [r.body, 1]] },
  decision:     { view: 'decisions',   icon: '🔒', label: 'Decision',
    text: (r) => [[r.label, 6], [r.rationale, 2]] },
  question:     { view: 'inbox',       icon: '?', label: 'Question',
    text: (r) => [[r.text, 5], [r.answer, 2]] },
  idea:         { view: 'inbox',       icon: '✳', label: 'Idea',
    text: (r) => [[r.text, 4]] },
  script:       { view: 'screenplay',  icon: '▦', label: 'Screenplay',
    text: (r) => [[r.title, 5], [r.body, 1]] },
  styleprofile: { view: 'style',       icon: '◈', label: 'Style profile',
    text: (r) => [[r.name, 8], [r.note, 2]] },
};

/* The Story Bible and World Bible share the entity type, so the destination
 * depends on what kind of entity it is. */
const ENTITY_VIEW = { concept: 'story', character: 'character' };

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function search(query, { projectId = S.ui.projectId, bookId = S.ui.bookId } = {}) {
  const terms = String(query ?? '').toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  if (!terms.length) return [];

  const results = [];

  for (const [type, config] of Object.entries(FIELDS)) {
    for (const record of S.list(type)) {
      /* Style profiles are library-wide; everything else belongs to a project. */
      if (type !== 'styleprofile' && record.projectId && record.projectId !== projectId) continue;

      const parts = config.text(record).filter(([text]) => text);
      const haystack = parts.map(([text]) => String(text).toLowerCase());

      /* Every term must appear somewhere on the record — an AND search, because
       * on a corpus this size an OR search returns the whole book. */
      if (!terms.every((term) => haystack.some((field) => field.includes(term)))) continue;

      let score = 0;
      for (const [i, field] of haystack.entries()) {
        const weight = parts[i][1];
        for (const term of terms) {
          const hits = field.split(term).length - 1;
          if (hits) score += weight * (1 + Math.log(hits));
        }
      }
      /* Records in the open book outrank the rest of the project. */
      if (record.bookId && record.bookId === bookId) score *= 1.35;

      results.push({
        id: record.id,
        type,
        icon: config.icon,
        kind: config.label,
        view: type === 'entity' ? (ENTITY_VIEW[record.kind] ?? 'world') : config.view,
        bookId: record.bookId ?? null,
        title: titleOf(record, type),
        score,
        snippet: snippet(parts, terms),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 60);
}

function titleOf(record, type) {
  if (type === 'entity') return record.name;
  if (type === 'styleprofile') return record.name;
  if (type === 'question' || type === 'idea') {
    return (record.text || '(empty)').slice(0, 70);
  }
  return record.title || record.label || '(untitled)';
}

/* A snippet earns its place by showing the term in its sentence. Returns the
 * text split into plain and matched runs so the caller can mark them without
 * building HTML from user content. */
function snippet(parts, terms) {
  const pattern = new RegExp(terms.map(escapeRe).join('|'), 'i');

  for (const [text] of parts) {
    const source = String(text).replace(/\s+/g, ' ');
    const found = pattern.exec(source);
    if (!found) continue;

    const start = Math.max(0, found.index - 60);
    const end = Math.min(source.length, found.index + found[0].length + 90);
    const slice = (start ? '…' : '') + source.slice(start, end) + (end < source.length ? '…' : '');

    const global = new RegExp(terms.map(escapeRe).join('|'), 'gi');
    const runs = [];
    let at = 0;
    for (const m of slice.matchAll(global)) {
      if (m.index > at) runs.push({ text: slice.slice(at, m.index), hit: false });
      runs.push({ text: m[0], hit: true });
      at = m.index + m[0].length;
    }
    if (at < slice.length) runs.push({ text: slice.slice(at), hit: false });
    return runs;
  }
  return [];
}
