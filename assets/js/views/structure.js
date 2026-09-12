/* views/structure.js — Chapter Map and Scene Map.
 *
 * The Chapter Map is about pacing: containers, targets, drift. The Scene Map is
 * where the book is actually written. Everything else in the app exists to make
 * these two screens honest.
 */

import { h, field, select, checkList, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { SCENE_STATUS, wordCount } from '../model.js';

const save = debounce((id, fields) => S.patch(id, fields), 400);
const saveProse = debounce((id, prose) => S.patch(id, { prose }), 700);

/* ------------------------------------------------------------ Chapter Map */

export function renderChapters(bookId) {
  const chapters = S.chapters(bookId);
  const book = S.get(bookId);
  const total = S.bookWords(bookId);

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Chapter Map'),
        h('p', { class: 'sub' },
          `${total.toLocaleString()} of ${(book?.targetWords ?? 0).toLocaleString()} words `
          + `· ${chapters.length} chapters`)),
      h('div', { class: 'view-actions' },
        field('Book target', h('input', {
          type: 'number', class: 'num', value: book?.targetWords ?? 0,
          oninput: (e) => save(bookId, { targetWords: Number(e.target.value) || 0 }),
        })),
        h('button', {
          class: 'btn btn-small',
          onclick: () => S.create('chapter', {
            bookId, title: `Chapter ${chapters.length + 1}`, order: chapters.length,
          }),
        }, '+ Chapter'))),

    h('div', { class: 'chapter-grid' }, chapters.length
      ? chapters.map((ch, i) => chapterCard(ch, i, bookId))
      : h('p', { class: 'empty pad' }, 'No chapters yet.')));
}

function chapterCard(chapter, index, bookId) {
  const scenes = S.scenesOf(chapter.id);
  const words = scenes.reduce((n, s) => n + wordCount(s.prose), 0);
  const target = chapter.targetWords || 0;
  const pct = target ? Math.min(200, Math.round((words / target) * 100)) : 0;
  const state = !target ? '' : pct > 140 ? 'over' : pct < 60 ? 'under' : 'onTarget';

  return h('article', { class: 'card' },
    h('div', { class: 'card-head' },
      h('span', { class: 'chapter-no' }, String(index + 1).padStart(2, '0')),
      h('input', {
        class: 'title-input', value: chapter.title,
        oninput: (e) => save(chapter.id, { title: e.target.value }),
      }),
      h('span', { class: 'nudge' },
        h('button', { class: 'btn btn-small', onclick: () => S.move(chapter.id, -1) }, '↑'),
        h('button', { class: 'btn btn-small', onclick: () => S.move(chapter.id, 1) }, '↓')),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => {
          if (confirmDanger(`Delete “${chapter.title}” and its ${scenes.length} scene(s)?`)) {
            S.remove(chapter.id);
          }
        },
      }, '×')),

    h('textarea', {
      class: 'card-summary', rows: 2, placeholder: 'What this chapter does for the book.',
      value: chapter.summary,
      oninput: (e) => save(chapter.id, { summary: e.target.value }),
    }),

    h('div', { class: 'card-meta' },
      h('span', {}, `${scenes.length} scene${scenes.length === 1 ? '' : 's'}`),
      h('span', {}, `${words.toLocaleString()} words`),
      h('label', { class: 'inline-num' }, 'target ',
        h('input', {
          type: 'number', class: 'num', value: target,
          oninput: (e) => save(chapter.id, { targetWords: Number(e.target.value) || 0 }),
        }))),

    target ? h('div', { class: `meter ${state}` },
      h('span', { style: { width: `${Math.min(100, pct)}%` } })) : null,

    h('ul', { class: 'card-scenes' },
      scenes.map((s) => h('li', {},
        h('button', {
          class: 'link',
          onclick: () => S.setUi({ view: 'scenes', selectionId: s.id }),
        }, h('span', { class: `status-dot ${s.status}` }), s.title))),
      h('li', {}, h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: async () => {
          const scene = await S.create('scene', {
            bookId, chapterId: chapter.id, order: scenes.length, title: 'New scene',
          });
          S.setUi({ view: 'scenes', selectionId: scene.id });
        },
      }, '+ Scene'))));
}

/* -------------------------------------------------------------- Scene Map */

export function renderScenes(bookId) {
  const chapters = S.chapters(bookId);
  const all = S.bookScenes(bookId);
  const selected = S.get(S.ui.selectionId);
  const active = selected?.type === 'scene' ? selected : all[0] ?? null;

  const outline = h('div', { class: 'list scene-outline' },
    chapters.length ? chapters.map((ch, i) => h('div', { class: 'outline-chapter' },
      h('button', {
        class: 'outline-chapter-head',
        onclick: () => S.setUi({ view: 'chapters', selectionId: ch.id }),
      }, `${String(i + 1).padStart(2, '0')}  ${ch.title}`),
      h('ul', {}, S.scenesOf(ch.id).map((s) => h('li', {},
        h('button', {
          class: `list-item ${active?.id === s.id ? 'current' : ''}`,
          onclick: () => S.setUi({ selectionId: s.id }),
        },
          h('span', { class: `status-dot ${s.status}` }),
          h('span', { class: 'name' }, s.title),
          h('span', { class: 'muted small' }, wordCount(s.prose).toLocaleString())))))))
      : h('p', { class: 'empty pad' }, 'Create a chapter first.'));

  return h('div', { class: 'view split' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Scene Map'),
        h('p', { class: 'sub' },
          'The atomic unit. Prose lives here and nowhere else — the Manuscript is compiled from it.')),
      h('div', { class: 'view-actions' },
        h('span', { class: 'muted' }, `${all.length} scenes`))),

    h('div', { class: 'split-body' },
      outline,
      active ? sceneEditor(active, bookId) : h('p', { class: 'empty pad' }, 'Select a scene.')));
}

function sceneEditor(scene, bookId) {
  const characters = S.entities(bookId, 'character').map((e) => ({ value: e.id, label: e.name }));
  const places = [...S.entities(bookId, 'location'), ...S.entities(bookId, 'faction')]
    .map((e) => ({ value: e.id, label: e.name }));
  const revs = S.revelations(bookId).map((r) => ({ value: r.id, label: r.label }));
  const chapterOptions = S.chapters(bookId).map((c, i) => ({
    value: c.id, label: `${i + 1}. ${c.title}`,
  }));

  const counter = h('span', { class: 'muted' },
    `${wordCount(scene.prose).toLocaleString()} words`);

  return h('div', { class: 'detail scene-detail' },
    h('div', { class: 'detail-head' },
      h('input', {
        class: 'title-input', value: scene.title,
        oninput: (e) => save(scene.id, { title: e.target.value }),
      }),
      h('span', { class: 'nudge' },
        h('button', { class: 'btn btn-small', onclick: () => S.move(scene.id, -1) }, '↑'),
        h('button', { class: 'btn btn-small', onclick: () => S.move(scene.id, 1) }, '↓')),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => { if (confirmDanger(`Delete “${scene.title}”?`)) S.remove(scene.id); },
      }, 'Delete')),

    h('div', { class: 'row' },
      field('Chapter', select(chapterOptions, scene.chapterId,
        (v) => v && S.moveSceneToChapter(scene.id, v), { placeholder: '—' })),
      field('Status', select(
        SCENE_STATUS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
        scene.status, (v) => S.patch(scene.id, { status: v || 'blank' }), { placeholder: 'Blank' },
      )),
      field('POV', select(characters, scene.pov,
        (v) => S.patch(scene.id, { pov: v }), { placeholder: 'Unassigned' })),
      field('Location', select(places, scene.locationId,
        (v) => S.patch(scene.id, { locationId: v }), { placeholder: 'Unassigned' }))),

    h('label', { class: 'check standalone' },
      h('input', {
        type: 'checkbox', checked: scene.isFlashback,
        onchange: (e) => S.patch(scene.id, { isFlashback: e.target.checked }),
      }),
      h('span', {}, 'Flashback — exempt from chronology and cast-gate checks')),

    field('Summary', h('textarea', {
      rows: 2, value: scene.summary, placeholder: 'What changes in this scene?',
      oninput: (e) => save(scene.id, { summary: e.target.value }),
    })),

    h('details', { class: 'fold' },
      h('summary', {}, 'Cast, and what this scene assumes'),
      h('h4', {}, 'Present'),
      checkList(characters, scene.presentIds, (presentIds) => S.patch(scene.id, { presentIds })),
      h('h4', {}, 'Leans on these revelations'),
      h('p', { class: 'sub' },
        'Tick a fact this scene treats as already known. If the reader has not met it yet, '
        + 'Continuity will say so.'),
      checkList(revs, scene.usesRevelationIds,
        (usesRevelationIds) => S.patch(scene.id, { usesRevelationIds }))),

    h('div', { class: 'prose-head' }, h('h3', {}, 'Prose'), counter),
    h('textarea', {
      class: 'prose-area',
      value: scene.prose,
      placeholder: 'Write the scene.',
      oninput: (e) => {
        saveProse(scene.id, e.target.value);
        counter.textContent = `${wordCount(e.target.value).toLocaleString()} words`;
      },
    }));
}
