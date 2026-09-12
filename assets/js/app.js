/* app.js — bootstrap and router. Repaint is deliberately dumb: any mutation
 * rebuilds the workspace. With a few thousand records that is well under a
 * frame, and it removes an entire class of stale-view bug that a novel spanning
 * six months of work cannot afford. Text inputs debounce so typing never
 * triggers it. */

import { h, clear, confirmDanger } from './dom.js';
import * as S from './state.js';
import { storage, exportAll, importAll } from './store.js';
import { renderTree, SECTIONS } from './views/tree.js';
import { renderDraft0 } from './views/draft0.js';
import { renderBible } from './views/bible.js';
import { renderTimeline, renderRevelations } from './views/timeline.js';
import { renderChapters, renderScenes } from './views/structure.js';
import { renderManuscript } from './views/manuscript.js';
import { renderAudit } from './views/audit.js';
import { renderDashboard } from './views/dashboard.js';
import { renderVault } from './views/vault.js';
import { renderDecisions, renderInbox } from './views/authority.js';
import { renderPublish } from './views/publish.js';
import { renderReader } from './views/reader.js';
import { renderScreenplay } from './views/screenplay.js';
import { renderStyle } from './views/style.js';
import { logWords } from './pace.js';
import { seedPlatform } from './seed.js';
import { download, slug } from './compile.js';

const VIEWS = {
  dashboard: renderDashboard,
  draft0: renderDraft0,
  vault: renderVault,
  story: (bookId) => renderBible(bookId, 'story'),
  character: (bookId) => renderBible(bookId, 'character'),
  world: (bookId) => renderBible(bookId, 'world'),
  timeline: renderTimeline,
  revelations: renderRevelations,
  chapters: renderChapters,
  scenes: renderScenes,
  manuscript: renderManuscript,
  screenplay: renderScreenplay,
  style: renderStyle,
  reader: renderReader,
  audit: renderAudit,
  decisions: renderDecisions,
  inbox: renderInbox,
  publish: renderPublish,
};

const el = {};

function render() {
  clear(el.sidebar).append(renderTree());
  clear(el.header).append(renderHeader());

  const bookId = S.ui.bookId;
  const renderView = VIEWS[S.ui.view] ?? VIEWS.dashboard;

  clear(el.workspace).append(
    bookId
      ? renderView(bookId)
      : h('div', { class: 'welcome' },
        h('h2', {}, 'Nothing open'),
        h('p', {},
          'Create a project on the left, or load the ECHO 2084 sample to see what the '
          + 'continuity engine does with a book that already contradicts itself.'),
        h('button', { class: 'btn btn-primary', onclick: loadSample }, 'Load ECHO 2084')));

  document.title = S.get(S.ui.projectId)
    ? `${S.get(S.ui.projectId).title} — Novel Development Platform`
    : 'Novel Development Platform';
}

function renderHeader() {
  const project = S.get(S.ui.projectId);
  const books = project ? S.books(project.id) : [];
  const section = SECTIONS.find((s) => s.id === S.ui.view);

  return h('div', { class: 'header-inner' },
    h('div', { class: 'crumbs' },
      project ? h('strong', {}, project.title) : h('span', { class: 'muted' }, 'No project'),
      books.length > 1 ? h('select', {
        class: 'book-switch',
        onchange: (e) => S.setUi({ bookId: e.target.value, selectionId: null }),
      }, books.map((b) => h('option', {
        value: b.id, selected: b.id === S.ui.bookId,
      }, b.title))) : null,
      section ? h('span', { class: 'crumb-sep' }, '›') : null,
      section ? h('span', {}, section.label) : null),

    storage.warning ? h('span', { class: 'warn-banner' }, storage.warning) : null,

    h('div', { class: 'header-actions' },
      h('button', { class: 'btn btn-small btn-ghost', onclick: loadSample }, 'Sample'),
      h('button', { class: 'btn btn-small btn-ghost', onclick: backup }, 'Back up all'),
      h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: () => document.getElementById('importer').click(),
      }, 'Restore'),
      h('input', {
        id: 'importer', type: 'file', accept: 'application/json', hidden: true,
        onchange: restore,
      })));
}

/* One JSON file holds every project. It is the archive of record — the browser
 * database is a convenience, and browsers throw those away without asking. */
async function backup() {
  const payload = await exportAll();
  const name = S.get(S.ui.projectId)?.title ?? 'novel-platform';
  download(`${slug(name)}-backup.json`, JSON.stringify(payload, null, 2), 'application/json');
}

async function restore(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  event.target.value = '';
  try {
    const payload = JSON.parse(await file.text());
    const merge = S.list('project').length > 0 && !confirmDanger(
      'Replace everything currently in this browser with the backup?\n\n'
      + 'OK = replace   ·   Cancel = merge alongside what is here');
    const count = await importAll(payload, merge ? 'merge' : 'replace');
    await S.load();
    window.alert(`Restored ${count} records.`);
  } catch (err) {
    window.alert(`Could not read that file.\n\n${err.message}`);
  }
}

async function loadSample() {
  const existing = S.list('project').find((p) => p.title.startsWith('ECHO 2084'));
  if (existing) {
    S.setUi({ projectId: existing.id, bookId: S.books(existing.id)[0]?.id, view: 'dashboard' });
    return;
  }
  await seedPlatform();
}

/* Keyboard: the writer's hands are already on the keys. */
function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const index = '1234567890'.indexOf(e.key);
    if (index >= 0 && SECTIONS[index]) {
      e.preventDefault();
      S.setUi({ view: SECTIONS[index].id, selectionId: null });
    }
  });
}

async function main() {
  el.sidebar = document.getElementById('sidebar');
  el.header = document.getElementById('header');
  el.workspace = document.getElementById('workspace');

  S.subscribe(render);
  await S.load();
  render();
  bindKeys();

  /* Record where each open book stands today, so pace is measured from real
   * history rather than estimated from optimism. Debounced because a repaint
   * fires on every keystroke's flush, and one row per book per day is enough. */
  let logging = null;
  const recordToday = () => {
    clearTimeout(logging);
    logging = setTimeout(() => { if (S.ui.bookId) logWords(S.ui.bookId); }, 2500);
  };
  S.subscribe(recordToday);
  recordToday();
}

main();
