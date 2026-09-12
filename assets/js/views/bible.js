/* views/bible.js — Story, Character and World Bibles are the same component
 * over different entity kinds, because they are the same thing: named records
 * with typed fields and backlinks.
 *
 * The backlink panel is the part a folder of documents can never give you:
 * every scene, beat and revelation this record touches, computed, always right.
 */

import { h, field, debounce, confirmDanger, canonControl } from '../dom.js';
import * as S from '../state.js';
import { ENTITY_KINDS, CHARACTER_FIELDS, CANON, CANON_ORDER } from '../model.js';
import { bibleToMarkdown, download, slug } from '../compile.js';

export const BIBLE_KINDS = {
  story:     { title: 'Story Bible',     kinds: ['concept'] },
  character: { title: 'Character Bible', kinds: ['character'] },
  world:     { title: 'World Bible',     kinds: ['location', 'faction', 'item'] },
};

/* Field presets are prompts, not schema. Every one is deletable and you can add
 * your own — a form that fights the writer gets abandoned by chapter three. */
const PRESETS = {
  /* The craft fields first, then the PRD §4 roster. "Would NEVER do" is last in
   * the spec and first in usefulness: it is the only field an automated
   * Character Lock can actually test a scene against. */
  character: ['Want', 'Need', 'Wound', 'Lie they believe', ...CHARACTER_FIELDS],
  location:  ['Sensory signature', 'Function in plot', 'Who controls it'],
  faction:   ['Goal', 'Method', 'Weakness'],
  item:      ['What it does', 'Cost of using it', 'Who wants it'],
  concept:   ['Rule', 'Cost', 'Thematic weight'],
};

const saveField = debounce((id, fields) => S.patch(id, fields), 350);

export function renderBible(bookId, viewId) {
  const config = BIBLE_KINDS[viewId];
  const rows = config.kinds.flatMap((kind) => S.entities(bookId, kind));
  /* The Story Bible is the one bible that also holds prose pages — premise,
   * theme, the argument the book is making. Those are notes, not entities. */
  const pages = viewId === 'story'
    ? S.inBook('note', bookId).filter((n) => n.slot === 'story')
    : [];
  const selected = S.get(S.ui.selectionId);
  const active = (selected?.type === 'entity' && config.kinds.includes(selected.kind))
    || (selected?.type === 'note' && pages.some((n) => n.id === selected.id))
    ? selected : rows[0] ?? pages[0] ?? null;

  const project = S.get(S.ui.projectId);
  const isSeries = project?.kind === 'series' || S.books(project?.id).length > 1;

  return h('div', { class: 'view split' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, config.title),
        h('p', { class: 'sub' }, `${rows.length} record${rows.length === 1 ? '' : 's'}`)),
      h('div', { class: 'view-actions' },
        config.kinds.map((kind) => h('button', {
          class: 'btn btn-small',
          onclick: async () => {
            const e = await S.create('entity', { bookId, kind, name: `New ${kind}` });
            S.setUi({ selectionId: e.id });
          },
        }, `+ ${ENTITY_KINDS[kind].label}`)),
        viewId === 'story' ? h('button', {
          class: 'btn btn-small',
          onclick: async () => {
            const n = await S.create('note', { bookId, slot: 'story', title: 'New page' });
            S.setUi({ selectionId: n.id });
          },
        }, '+ Page') : null,
        h('button', {
          class: 'btn btn-small btn-ghost',
          onclick: () => download(`${slug(config.title)}.md`,
            bibleToMarkdown(bookId, config.kinds, config.title), 'text/markdown'),
        }, 'Export .md'))),

    h('div', { class: 'split-body' },
      h('ul', { class: 'list' }, rows.length
        ? rows.map((e) => h('li', {},
          h('button', {
            class: `list-item ${active?.id === e.id ? 'current' : ''}`,
            onclick: () => S.setUi({ selectionId: e.id }),
          },
            h('span', { class: 'kind-icon' }, ENTITY_KINDS[e.kind].icon),
            h('span', { class: 'name' }, e.name),
            e.bookId == null ? h('span', { class: 'badge' }, 'series') : null)))
        : h('li', {}, h('p', { class: 'empty pad' }, 'Nothing here yet.')),
        pages.map((n) => h('li', {},
          h('button', {
            class: `list-item ${active?.id === n.id ? 'current' : ''}`,
            onclick: () => S.setUi({ selectionId: n.id }),
          },
            h('span', { class: 'kind-icon' }, '▤'),
            h('span', { class: 'name' }, n.title))))),

      active?.type === 'note' ? pageEditor(active)
        : active ? entityEditor(active, bookId, isSeries) : h('p', { class: 'empty pad' },
        'Select a record, or create one.')));
}

function pageEditor(note) {
  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('input', {
        class: 'title-input', value: note.title,
        oninput: (e) => saveField(note.id, { title: e.target.value || 'Untitled page' }),
      }),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => { if (confirmDanger(`Delete “${note.title}”?`)) S.remove(note.id); },
      }, 'Delete')),
    h('textarea', {
      class: 'notes-area tall', value: note.body,
      placeholder: 'Premise, themes, the argument the book is making, rules you refuse to break.',
      oninput: (e) => saveField(note.id, { body: e.target.value }),
    }));
}

function entityEditor(entity, bookId, isSeries) {
  const fields = { ...entity.fields };
  const missing = (PRESETS[entity.kind] ?? []).filter((k) => !(k in fields));

  const fieldRows = Object.entries(fields).map(([key, value]) =>
    h('div', { class: 'kv' },
      h('input', {
        class: 'kv-key', value: key,
        onchange: (e) => {
          const next = {};
          for (const [k, v] of Object.entries(fields)) next[e.target.value || k] = v;
          delete next[key === e.target.value ? '' : key];
          S.patch(entity.id, { fields: next });
        },
      }),
      h('textarea', {
        class: 'kv-value', rows: 2, value,
        oninput: (e) => saveField(entity.id, { fields: { ...fields, [key]: e.target.value } }),
      }),
      h('button', {
        class: 'kv-kill', title: 'Remove field',
        onclick: () => {
          const next = { ...fields };
          delete next[key];
          S.patch(entity.id, { fields: next });
        },
      }, '×')));

  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('input', {
        class: 'title-input', value: entity.name,
        oninput: (e) => saveField(entity.id, { name: e.target.value || 'Unnamed' }),
      }),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => {
          if (confirmDanger(`Delete “${entity.name}”?`)) S.remove(entity.id);
        },
      }, 'Delete')),

    canonControl(entity, (canon) => S.patch(entity.id, { canon }), CANON, CANON_ORDER),

    field('Also known as', h('input', {
      value: (entity.aliases ?? []).join(', '),
      placeholder: 'comma separated',
      oninput: (e) => saveField(entity.id, {
        aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    }), 'Aliases matter: search and future find-and-replace both read this.'),

    field('One-line summary', h('input', {
      value: entity.summary,
      oninput: (e) => saveField(entity.id, { summary: e.target.value }),
    })),

    isSeries ? h('label', { class: 'check standalone' },
      h('input', {
        type: 'checkbox', checked: entity.bookId == null,
        onchange: (e) => S.patch(entity.id, { bookId: e.target.checked ? null : bookId }),
      }),
      h('span', {}, 'Shared across the whole series')) : null,

    h('h3', {}, 'Fields'),
    fieldRows.length ? fieldRows : h('p', { class: 'empty' }, 'No fields yet.'),

    missing.length ? h('div', { class: 'chip-row' },
      missing.map((key) => h('button', {
        class: 'chip',
        onclick: () => S.patch(entity.id, { fields: { ...fields, [key]: '' } }),
      }, `+ ${key}`))) : null,
    h('button', {
      class: 'btn btn-small btn-ghost',
      onclick: () => {
        const key = window.prompt('Field name')?.trim();
        if (key) S.patch(entity.id, { fields: { ...fields, [key]: '' } });
      },
    }, '+ Custom field'),

    h('h3', {}, 'Notes'),
    h('textarea', {
      class: 'notes-area', rows: 8, value: entity.notes,
      oninput: (e) => saveField(entity.id, { notes: e.target.value }),
    }),

    backlinks(entity, bookId));
}

/* Backlinks: the payoff for modelling a graph. Nothing here is stored — it is
 * recomputed from the scene, beat and revelation records every paint. */
function backlinks(entity, bookId) {
  const scenes = S.bookScenes(bookId).filter((s) =>
    s.pov === entity.id || s.locationId === entity.id || (s.presentIds ?? []).includes(entity.id));
  const beats = S.beats(bookId).filter((b) => (b.entityIds ?? []).includes(entity.id));
  const revs = S.revelations(bookId).filter((r) =>
    (r.knownBy ?? []).some((k) => k.entityId === entity.id));

  const group = (label, items, view) => h('div', { class: 'backlink-group' },
    h('h4', {}, `${label} (${items.length})`),
    items.length
      ? h('ul', {}, items.map((r) => h('li', {},
        h('button', {
          class: 'link',
          onclick: () => S.setUi({ view, selectionId: r.id }),
        }, r.title ?? r.label))))
      : h('p', { class: 'empty' }, 'None.'));

  return h('div', { class: 'backlinks' },
    h('h3', {}, 'Appears in'),
    group('Scenes', scenes, 'scenes'),
    group('Beats', beats, 'timeline'),
    group('Revelations known', revs, 'revelations'));
}
