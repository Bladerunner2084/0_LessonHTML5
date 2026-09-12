/* views/tree.js — the navigator. This is the shape you asked for: projects,
 * books, and the nine sections. The difference is that six of those sections
 * are windows onto the same records rather than six separate files. */

import { h, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { audit, summarise } from '../lint.js';

export const SECTIONS = [
  { id: 'dashboard',   label: 'Dashboard',      hint: 'Where the book actually is, computed.' },
  { id: 'draft0',      label: 'Draft 0',        hint: 'Unstructured first pass. Mine it later.' },
  { id: 'vault',       label: 'Draft Vault',    hint: 'Every preserved version. Nothing is destroyed.' },
  { id: 'story',       label: 'Story Bible',    hint: 'Premise, themes, concepts, loose pages.' },
  { id: 'character',   label: 'Character Bible', hint: 'People: want, wound, lie, voice.' },
  { id: 'world',       label: 'World Bible',    hint: 'Places, factions, objects.' },
  { id: 'timeline',    label: 'Timeline',       hint: 'What happens, in story order.' },
  { id: 'revelations', label: 'Revelation Map', hint: 'Who knows what, and when the reader learns.' },
  { id: 'chapters',    label: 'Chapter Map',    hint: 'Containers and pacing targets.' },
  { id: 'scenes',      label: 'Scene Map',      hint: 'The atomic unit. Prose lives here.' },
  { id: 'manuscript',  label: 'Manuscript',     hint: 'Compiled output. Read-only by design.' },
  { id: 'screenplay',  label: 'Screenplay',     hint: 'Converted from prose. Edit freely — the novel is untouched.' },
  { id: 'style',       label: 'Style Studio',   hint: 'Measured voice profiles, mixed and compared.' },
  { id: 'reader',      label: 'Reader Simulator', hint: 'What the reader holds — and has forgotten.' },
  { id: 'audit',       label: 'Continuity',     hint: 'Where the graph catches you lying.' },
  { id: 'decisions',   label: 'Decision Log',   hint: 'Locked author decisions. Authoritative.' },
  { id: 'inbox',       label: 'Questions & Ideas', hint: 'Unanswered questions and raw ideas.' },
  { id: 'publish',     label: 'Publication',    hint: 'Traditional, self, or AI-assisted.' },
];

export function renderTree() {
  const projects = S.list('project').sort((a, b) => a.title.localeCompare(b.title));

  return h('nav', { class: 'tree', 'aria-label': 'Projects' },
    h('div', { class: 'tree-head' },
      h('h1', {}, 'Novel Development', h('br'), 'Platform'),
      h('button', { class: 'btn btn-primary btn-block', onclick: newProject },
        '+ New project')),

    projects.length
      ? h('ul', { class: 'tree-root' }, projects.map((p) => projectNode(p)))
      : h('p', { class: 'empty pad' },
        'No projects yet. Create one, or load the ECHO 2084 sample from the header.'));
}

function projectNode(project) {
  const open = S.ui.projectId === project.id;
  const bookList = S.books(project.id);
  const isSeries = project.kind === 'series' || bookList.length > 1;

  return h('li', { class: `node project ${open ? 'open' : ''}` },
    h('div', { class: 'node-row' },
      h('button', {
        class: 'node-label',
        onclick: () => S.setUi({
          projectId: project.id,
          bookId: bookList[0]?.id ?? null,
          selectionId: null,
        }),
      }, h('span', { class: 'twisty' }, open ? '▾' : '▸'),
        h('span', { class: 'name' }, project.title),
        h('span', { class: 'badge' }, isSeries ? `series · ${bookList.length}` : 'novel')),
      h('button', {
        class: 'node-kill', title: 'Delete project',
        onclick: () => deleteRecord(project, `Delete “${project.title}” and everything in it?`),
      }, '×')),

    open ? h('ul', { class: 'tree-books' },
      bookList.map((book) => bookNode(book, isSeries)),
      isSeries ? h('li', {}, h('button', {
        class: 'btn btn-ghost btn-small',
        onclick: () => S.create('book', {
          projectId: project.id,
          title: `Book ${bookList.length + 1}`,
          order: bookList.length,
        }),
      }, '+ Add book')) : null) : null);
}

function bookNode(book, isSeries) {
  const active = S.ui.bookId === book.id;
  const findings = active ? summarise(audit(book.id)) : null;

  const sections = h('ul', { class: 'tree-sections' },
    SECTIONS.map((section) => {
      const count = findings && section.id === 'audit'
        ? findings.error + findings.warn : null;
      return h('li', {},
        h('button', {
          class: `section ${S.ui.view === section.id ? 'current' : ''}`,
          title: section.hint,
          onclick: () => S.setUi({ view: section.id, selectionId: null }),
        },
          h('span', { class: 'name' }, section.label),
          count ? h('span', { class: `pill ${findings.error ? 'bad' : 'warn'}` }, count) : null));
    }));

  if (!isSeries) return h('li', { class: 'node book solo' }, sections);

  return h('li', { class: `node book ${active ? 'open' : ''}` },
    h('div', { class: 'node-row' },
      h('button', {
        class: 'node-label',
        onclick: () => S.setUi({ bookId: book.id, selectionId: null }),
      }, h('span', { class: 'twisty' }, active ? '▾' : '▸'),
        h('span', { class: 'name' }, book.title)),
      h('button', {
        class: 'node-kill', title: 'Delete book',
        onclick: () => deleteRecord(book, `Delete “${book.title}” and all its chapters?`),
      }, '×')),
    active ? sections : null);
}

async function deleteRecord(record, message) {
  if (confirmDanger(message)) await S.remove(record.id);
}

/* Deliberately a prompt and not a modal: the decision that matters here is
 * novel-vs-series, and burying it in a dialog invites people to pick wrong. */
async function newProject() {
  const title = window.prompt('Project title')?.trim();
  if (!title) return;
  const series = window.confirm(
    'Is this a series (multiple books sharing one character and world bible)?\n\n'
    + 'OK = series   ·   Cancel = standalone novel');
  const bookCount = series
    ? Math.max(1, parseInt(window.prompt('How many books?', '3') ?? '3', 10) || 1)
    : 1;
  await S.createProject({ title, kind: series ? 'series' : 'novel', bookCount });
}
