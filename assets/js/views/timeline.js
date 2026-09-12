/* views/timeline.js — Timeline and Revelation Map.
 *
 * These two live together because they answer the same question from opposite
 * ends: the Timeline says when a thing happened, the Revelation Map says when
 * somebody found out. A novel is mostly the gap between those two.
 */

import { h, field, select, checkList, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { BEAT_KINDS } from '../model.js';
import { timelineToMarkdown, download } from '../compile.js';

const save = debounce((id, fields) => S.patch(id, fields), 350);

const entityOptions = (bookId, kind = null) =>
  S.entities(bookId, kind).map((e) => ({ value: e.id, label: e.name }));

const sceneOptions = (bookId) => S.bookScenes(bookId).map((s, i) => ({
  value: s.id,
  label: `${String(i + 1).padStart(2, '0')} · ${s.title}`,
}));

/* ---------------------------------------------------------------- Timeline */

export function renderTimeline(bookId) {
  const beats = S.beats(bookId);
  const selected = S.get(S.ui.selectionId);
  const active = selected?.type === 'beat' ? selected : beats[0] ?? null;

  return h('div', { class: 'view split' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Timeline'),
        h('p', { class: 'sub' },
          'Chronological order, which is not reading order. '
          + 'Attach a beat to a scene and the continuity engine can compare the two.')),
      h('div', { class: 'view-actions' },
        h('button', {
          class: 'btn btn-small',
          onclick: async () => {
            const b = await S.create('beat', { bookId, order: beats.length });
            S.setUi({ selectionId: b.id });
          },
        }, '+ Beat'),
        h('button', {
          class: 'btn btn-small btn-ghost',
          onclick: () => download('timeline.md', timelineToMarkdown(bookId), 'text/markdown'),
        }, 'Export .md'))),

    h('div', { class: 'split-body' },
      h('ol', { class: 'list rail' }, beats.length
        ? beats.map((b) => h('li', {},
          h('button', {
            class: `list-item ${active?.id === b.id ? 'current' : ''}`,
            onclick: () => S.setUi({ selectionId: b.id }),
          },
            h('span', { class: `dot ${b.kind}` }),
            h('span', { class: 'when' }, b.storyTime || '—'),
            h('span', { class: 'name' }, b.label),
            b.sceneId ? h('span', { class: 'badge' }, 'on page') : null)))
        : h('li', {}, h('p', { class: 'empty pad' }, 'No beats yet.'))),

      active ? beatEditor(active, bookId) : h('p', { class: 'empty pad' }, 'Select a beat.')));
}

function beatEditor(beat, bookId) {
  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('input', {
        class: 'title-input', value: beat.label,
        oninput: (e) => save(beat.id, { label: e.target.value }),
      }),
      h('span', { class: 'nudge' },
        h('button', { class: 'btn btn-small', onclick: () => S.move(beat.id, -1) }, '↑'),
        h('button', { class: 'btn btn-small', onclick: () => S.move(beat.id, 1) }, '↓')),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => { if (confirmDanger(`Delete “${beat.label}”?`)) S.remove(beat.id); },
      }, 'Delete')),

    h('div', { class: 'row' },
      field('Story time', h('input', {
        value: beat.storyTime, placeholder: 'Day 3, 04:12  /  2084-11-02',
        oninput: (e) => save(beat.id, { storyTime: e.target.value }),
      }), 'Free text. Position in the list is what the engine actually reads.'),

      field('Kind', select(
        Object.entries(BEAT_KINDS).map(([value, v]) => ({ value, label: v.label })),
        beat.kind, (v) => S.patch(beat.id, { kind: v || 'event' }), { placeholder: 'Event' },
      ), 'Death and departure gate who can appear in later scenes.')),

    field('Dramatised in scene', select(
      sceneOptions(bookId), beat.sceneId,
      (v) => S.patch(beat.id, { sceneId: v }), { placeholder: 'Off-page' },
    ), 'Off-page beats still count for continuity. They just are not written.'),

    field('Description', h('textarea', {
      rows: 4, value: beat.description,
      oninput: (e) => save(beat.id, { description: e.target.value }),
    })),

    h('h3', {}, 'Who is involved'),
    checkList(entityOptions(bookId), beat.entityIds,
      (entityIds) => S.patch(beat.id, { entityIds })));
}

/* --------------------------------------------------------- Revelation Map */

export function renderRevelations(bookId) {
  const revs = S.revelations(bookId);
  const selected = S.get(S.ui.selectionId);
  const active = selected?.type === 'revelation' ? selected : revs[0] ?? null;
  const scenes = S.bookScenes(bookId);

  return h('div', { class: 'view split' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Revelation Map'),
        h('p', { class: 'sub' },
          'Every tracked fact, who holds it, and the exact scene the reader gets it.')),
      h('div', { class: 'view-actions' },
        h('button', {
          class: 'btn btn-small',
          onclick: async () => {
            const r = await S.create('revelation', { bookId });
            S.setUi({ selectionId: r.id });
          },
        }, '+ Revelation'))),

    h('div', { class: 'split-body' },
      h('ul', { class: 'list' }, revs.length
        ? revs.map((r) => h('li', {},
          h('button', {
            class: `list-item ${active?.id === r.id ? 'current' : ''}`,
            onclick: () => S.setUi({ selectionId: r.id }),
          },
            h('span', { class: `weight ${r.weight}` }, r.weight[0].toUpperCase()),
            h('span', { class: 'name' }, r.label),
            h('span', { class: 'badge' },
              r.revealedIn ? `→ ${scenes.findIndex((s) => s.id === r.revealedIn) + 1}` : 'hidden'))))
        : h('li', {}, h('p', { class: 'empty pad' }, 'No revelations tracked yet.'))),

      active ? revelationEditor(active, bookId, scenes)
        : h('p', { class: 'empty pad' }, 'Select a revelation.')));
}

function revelationEditor(rev, bookId, scenes) {
  const knownBy = rev.knownBy ?? [];
  const beatOptions = S.beats(bookId).map((b) => ({
    value: b.id, label: `${b.storyTime || '—'} · ${b.label}`,
  }));

  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('input', {
        class: 'title-input', value: rev.label,
        oninput: (e) => save(rev.id, { label: e.target.value }),
      }),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => { if (confirmDanger(`Delete “${rev.label}”?`)) S.remove(rev.id); },
      }, 'Delete')),

    field('The fact itself', h('textarea', {
      rows: 3, value: rev.fact, placeholder: 'Stated plainly, as the reader will understand it.',
      oninput: (e) => save(rev.id, { fact: e.target.value }),
    })),

    h('div', { class: 'row' },
      field('Weight', select(
        [['minor', 'Minor'], ['major', 'Major'], ['twist', 'Twist']].map(([value, label]) =>
          ({ value, label })),
        rev.weight, (v) => S.patch(rev.id, { weight: v || 'minor' }), { placeholder: 'Minor' },
      )),
      field('Reader learns it in', select(
        scenes.map((s, i) => ({ value: s.id, label: `${i + 1} · ${s.title}` })),
        rev.revealedIn, (v) => S.patch(rev.id, { revealedIn: v }), { placeholder: 'Never' },
      ), 'This single field is what makes premature-knowledge detection possible.')),

    h('h3', {}, 'Planted in'),
    h('p', { class: 'sub' }, 'Scenes carrying setup. A major reveal with nothing planted reads as a cheat.'),
    checkList(scenes.map((s, i) => ({ value: s.id, label: `${i + 1} · ${s.title}` })),
      rev.plantedIn, (plantedIn) => S.patch(rev.id, { plantedIn })),

    h('h3', {}, 'Known by'),
    h('p', { class: 'sub' }, 'Characters who hold this fact, and the beat where they got it.'),
    h('div', { class: 'known-list' },
      knownBy.map((k, i) => h('div', { class: 'known-row' },
        select(S.entities(bookId, 'character').map((e) => ({ value: e.id, label: e.name })),
          k.entityId, (entityId) => {
            const next = [...knownBy];
            next[i] = { ...k, entityId };
            S.patch(rev.id, { knownBy: next });
          }, { placeholder: 'Who' }),
        select(beatOptions, k.sinceBeatId, (sinceBeatId) => {
          const next = [...knownBy];
          next[i] = { ...k, sinceBeatId };
          S.patch(rev.id, { knownBy: next });
        }, { placeholder: 'How did they learn it?' }),
        h('button', {
          class: 'kv-kill',
          onclick: () => S.patch(rev.id, { knownBy: knownBy.filter((_, j) => j !== i) }),
        }, '×'))),
      h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: () => S.patch(rev.id, {
          knownBy: [...knownBy, { entityId: null, sinceBeatId: null }],
        }),
      }, '+ Add holder')),

    readerStrip(rev, scenes));
}

/* A one-line picture of the reveal in reading order: where it is planted,
 * where it lands, and which scenes lean on it. Misalignment is visible before
 * the continuity engine has to say a word. */
function readerStrip(rev, scenes) {
  const planted = new Set(rev.plantedIn ?? []);
  const uses = new Set(scenes.filter((s) =>
    (s.usesRevelationIds ?? []).includes(rev.id)).map((s) => s.id));

  return h('div', { class: 'strip-wrap' },
    h('h3', {}, 'Across the book'),
    h('div', { class: 'strip' }, scenes.map((s, i) => {
      const role = s.id === rev.revealedIn ? 'reveal'
        : planted.has(s.id) ? 'plant'
          : uses.has(s.id) ? 'use' : 'none';
      return h('span', {
        class: `tick ${role}`,
        title: `${i + 1}. ${s.title}${role === 'none' ? '' : ` — ${role}`}`,
      });
    })),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'tick plant' }), ' plant'),
      h('span', {}, h('i', { class: 'tick reveal' }), ' reveal'),
      h('span', {}, h('i', { class: 'tick use' }), ' used')));
}
