/* state.js — one in-memory index over every record, plus the selectors the
 * views read. Views never touch the store directly; they call these mutators
 * so that a single change can repaint every projection that depends on it. */

import * as store from './store.js';
import { make, reindex, sortByOrder, wordCount } from './model.js';

const listeners = new Set();
const byId = new Map();

export const ui = {
  projectId: null,
  bookId: null,
  view: 'draft0',
  selectionId: null,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export async function load() {
  byId.clear();
  for (const r of await store.all()) byId.set(r.id, r);
  restoreUi();
  notify();
}

/* --- UI position survives a reload; the records are the payload, but losing
 * your place in a 40-chapter book every refresh is its own kind of data loss. */
const UI_KEY = 'novel-platform-ui';

function restoreUi() {
  try {
    Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}'));
  } catch { /* ignore */ }
  if (!byId.has(ui.projectId)) ui.projectId = list('project')[0]?.id ?? null;
  if (!byId.has(ui.bookId)) ui.bookId = books(ui.projectId)[0]?.id ?? null;
}

export function setUi(patch) {
  Object.assign(ui, patch);
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* ignore */ }
  notify();
}

/* --- reads ------------------------------------------------------------- */

export const get = (id) => byId.get(id) ?? null;
export const list = (type) => [...byId.values()].filter((r) => r.type === type);

export const books = (projectId) =>
  sortByOrder(list('book').filter((b) => b.projectId === projectId));

/* Series-wide records carry bookId === null and belong to every book, so any
 * "what is in this book" question has to include them. */
export const inBook = (type, bookId, projectId = ui.projectId) =>
  list(type).filter((r) => {
    if (r.bookId === bookId) return true;
    return r.bookId == null && r.projectId === projectId;
  });

export const chapters = (bookId) =>
  sortByOrder(list('chapter').filter((c) => c.bookId === bookId));

export const scenesOf = (chapterId) =>
  sortByOrder(list('scene').filter((s) => s.chapterId === chapterId));

/* Reading order for a whole book: chapters in order, scenes in order inside. */
export function bookScenes(bookId) {
  return chapters(bookId).flatMap((c) => scenesOf(c.id));
}

export const entities = (bookId, kind = null) => {
  const rows = inBook('entity', bookId).filter((e) => !kind || e.kind === kind);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
};

export const beats = (bookId) => sortByOrder(inBook('beat', bookId));
export const revelations = (bookId) => inBook('revelation', bookId);

export const entityName = (id) => get(id)?.name ?? '—';

export function bookWords(bookId) {
  return bookScenes(bookId).reduce((n, s) => n + wordCount(s.prose), 0);
}

/* --- writes ------------------------------------------------------------ */

async function commit(records) {
  const saved = await store.putMany(records);
  saved.forEach((r) => byId.set(r.id, r));
  notify();
  return saved;
}

export async function create(type, fields = {}) {
  const record = make[type]({ projectId: ui.projectId, ...fields });
  const [saved] = await commit([record]);
  return saved;
}

export async function patch(id, fields) {
  const current = byId.get(id);
  if (!current) throw new Error(`patch: no record ${id}`);
  const [saved] = await commit([{ ...current, ...fields }]);
  return saved;
}

export async function patchMany(updates) {
  const records = updates.map(({ id, ...fields }) => ({ ...byId.get(id), ...fields }));
  return commit(records);
}

/* Deleting a container must not leave orphan scenes squatting in the database
 * and inflating word counts nobody can find. Cascade, explicitly. */
export async function remove(id) {
  const ids = new Set([id]);
  const record = byId.get(id);
  if (!record) return;

  if (record.type === 'project') {
    books(id).forEach((b) => collectBook(b.id, ids));
    [...byId.values()].filter((r) => r.projectId === id).forEach((r) => ids.add(r.id));
  }
  if (record.type === 'book') collectBook(id, ids);
  if (record.type === 'chapter') scenesOf(id).forEach((s) => ids.add(s.id));

  await store.removeMany([...ids]);
  ids.forEach((x) => byId.delete(x));
  await unlinkDangling(ids);
  if (ids.has(ui.projectId)) setUi({ projectId: list('project')[0]?.id ?? null, bookId: null });
  else if (ids.has(ui.bookId)) setUi({ bookId: books(ui.projectId)[0]?.id ?? null });
  else notify();
}

function collectBook(bookId, ids) {
  ids.add(bookId);
  [...byId.values()].filter((r) => r.bookId === bookId).forEach((r) => {
    ids.add(r.id);
    if (r.type === 'chapter') scenesOf(r.id).forEach((s) => ids.add(s.id));
  });
}

/* A deleted character must vanish from every scene's cast list, every beat and
 * every revelation, or the continuity engine starts reporting ghosts. */
async function unlinkDangling(deleted) {
  const fixes = [];
  for (const r of byId.values()) {
    let next = r;
    const scrubArray = (key) => {
      if (!Array.isArray(next[key])) return;
      const kept = next[key].filter((v) =>
        (typeof v === 'string' ? !deleted.has(v) : !deleted.has(v.entityId)));
      if (kept.length !== next[key].length) next = { ...next, [key]: kept };
    };
    ['entityIds', 'presentIds', 'usesRevelationIds', 'plantedIn', 'knownBy'].forEach(scrubArray);
    ['pov', 'locationId', 'sceneId', 'revealedIn', 'chapterId'].forEach((key) => {
      if (next[key] && deleted.has(next[key])) next = { ...next, [key]: null };
    });
    if (next !== r) fixes.push(next);
  }
  if (fixes.length) await commit(fixes);
  else notify();
}

/* --- ordering ---------------------------------------------------------- */

export async function move(id, delta) {
  const record = byId.get(id);
  if (!record) return;
  const siblings = record.type === 'scene'
    ? scenesOf(record.chapterId)
    : record.type === 'chapter'
      ? chapters(record.bookId)
      : sortByOrder(list(record.type).filter((r) => r.bookId === record.bookId));

  const index = siblings.findIndex((s) => s.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= siblings.length) return;
  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await patchMany(reindex(reordered).map(({ id: rid, order }) => ({ id: rid, order })));
}

export async function moveSceneToChapter(sceneId, chapterId) {
  const scene = byId.get(sceneId);
  if (!scene || scene.chapterId === chapterId) return;
  await patch(sceneId, { chapterId, order: scenesOf(chapterId).length });
  await patchMany(reindex(scenesOf(scene.chapterId)).map(({ id, order }) => ({ id, order })));
}

/* --- project scaffolding ----------------------------------------------- */

/* Creating a project pre-builds the nine sections' backing records so the
 * writer never faces a blank app with no affordance. A series gets its books;
 * a novel gets exactly one, hidden from the tree as a separate level. */
export async function createProject({ title, kind, bookCount = 1 }) {
  const project = await create('project', { title, kind });
  const titles = kind === 'series'
    ? Array.from({ length: Math.max(1, bookCount) }, (_, i) => `Book ${i + 1}`)
    : [title];

  let firstBookId = null;
  for (const [i, bookTitle] of titles.entries()) {
    const book = await create('book', { projectId: project.id, title: bookTitle, order: i });
    if (i === 0) firstBookId = book.id;
    await create('note', {
      projectId: project.id, bookId: book.id, slot: 'draft0',
      title: 'Draft 0', body: '',
    });
    const chapter = await create('chapter', {
      projectId: project.id, bookId: book.id, title: 'Chapter One', order: 0,
    });
    await create('scene', {
      projectId: project.id, bookId: book.id, chapterId: chapter.id,
      title: 'Opening scene', order: 0,
    });
  }
  setUi({ projectId: project.id, bookId: firstBookId, view: 'draft0', selectionId: null });
  return project;
}

export { store };
