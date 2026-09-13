/* api.js — the contract between the engine and any front end.
 *
 * The Figma Make prototype is React + TypeScript. This application is vanilla
 * JS. That difference does not matter, because every module that does real work
 * here is pure functions over records with no DOM in it — lint, reader, voice,
 * pipeline, pace, script, import, search. They port unchanged.
 *
 * What has been missing is one import surface, so a front end does not have to
 * know which of eight modules answers a question. That is this file.
 *
 * The rule it exists to enforce: a front end RENDERS findings. It never
 * computes them. The moment a component hand-writes a findings array, the logic
 * exists twice, the two drift, and the product is back to the exact failure
 * this whole architecture was built to prevent.
 */

import * as S from './state.js';
import { audit, RULES } from './lint.js';
import { readerStateAt, tensionCurve, readerModel } from './reader.js';
import { runPipeline, progress, nextAction } from './pipeline.js';
import { paceReport, logWords } from './pace.js';
import { measure, compare, blend, describe, METRICS } from './voice.js';
import { search } from './search.js';
import { detectStructure, readManuscriptFile } from './import.js';
import { proseToFountain, parseFountain, toFinalDraft, estimatePages } from './script.js';
import { compileBook, toMarkdown, toHtml } from './compile.js';
import { wordCount, CANON, SCENE_STATUS, PATHWAYS } from './model.js';

/* The prototype's editorial vocabulary, mapped onto the engine's severities so
 * a React component can use either without a lookup table of its own. */
const SEVERITY_LABEL = { error: 'Critical', warn: 'Moderate', info: 'Note' };

/* Findings carry a record id. A UI needs a place — "Chapter 7 · Scene 2" — so
 * resolve it here rather than making every view work it out again. */
function locate(bookId, recordId) {
  const record = S.get(recordId);
  if (!record) return { chapter: null, scene: null };

  if (record.type === 'scene') {
    const chapters = S.chapters(bookId);
    const index = chapters.findIndex((c) => c.id === record.chapterId);
    const scenes = index >= 0 ? S.scenesOf(chapters[index].id) : [];
    return {
      chapter: index >= 0 ? `Chapter ${index + 1}` : null,
      chapterTitle: index >= 0 ? chapters[index].title : null,
      scene: `Scene ${scenes.findIndex((s) => s.id === record.id) + 1}`,
      sceneTitle: record.title,
    };
  }
  if (record.type === 'chapter') {
    const index = S.chapters(bookId).findIndex((c) => c.id === record.id);
    return { chapter: `Chapter ${index + 1}`, chapterTitle: record.title, scene: null };
  }
  return { chapter: null, scene: null, sceneTitle: record.name ?? record.label ?? null };
}

export function createWriteline() {
  const api = {
    /* --- lifecycle ----------------------------------------------------- */

    async load() {
      await S.load();
      if (S.ui.bookId) await logWords(S.ui.bookId);
      return api;
    },

    /* Any mutation notifies. In React: useSyncExternalStore(subscribe, snapshot). */
    subscribe: S.subscribe,

    /* --- navigation ----------------------------------------------------- */

    projects: () => S.list('project'),
    books: (projectId) => S.books(projectId),
    open: (projectId, bookId) => S.setUi({ projectId, bookId, selectionId: null }),
    current: () => ({
      projectId: S.ui.projectId,
      bookId: S.ui.bookId,
      project: S.get(S.ui.projectId),
      book: S.get(S.ui.bookId),
    }),

    /* --- records -------------------------------------------------------- */

    get: S.get,
    list: S.list,
    create: S.create,
    patch: S.patch,
    remove: S.remove,
    chapters: S.chapters,
    scenes: S.scenesOf,
    bookScenes: S.bookScenes,
    entities: S.entities,
    beats: S.beats,
    revelations: S.revelations,
    versions: S.versions,
    decisions: S.decisions,
    questions: S.questions,
    styleProfiles: S.styleProfiles,
    snapshot: S.snapshotBook,
    restore: S.restoreVersion,

    /* --- the audit centre ----------------------------------------------- */

    /* Shaped for a findings UI: severity for logic, label for display, a place
     * to show, and the rule's own explanation of why it fires. */
    findings(bookId = S.ui.bookId) {
      return audit(bookId).map((f, i) => ({
        id: `${f.rule}:${f.recordId ?? i}`,
        rule: f.rule,
        type: f.rule.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
        severity: f.severity,
        label: SEVERITY_LABEL[f.severity],
        description: f.message,
        explain: RULES[f.rule]?.blurb ?? '',
        recordId: f.recordId,
        view: f.view,
        ...locate(bookId, f.recordId),
      }));
    },

    findingCounts(bookId = S.ui.bookId) {
      return api.findings(bookId).reduce((acc, f) => {
        acc[f.label] = (acc[f.label] ?? 0) + 1;
        return acc;
      }, { Critical: 0, Moderate: 0, Note: 0 });
    },

    /* --- dashboard ------------------------------------------------------ */

    pipeline(bookId = S.ui.bookId) {
      const stages = runPipeline(bookId);
      return { stages, progress: progress(stages), next: nextAction(stages) };
    },

    pace: (bookId = S.ui.bookId) => paceReport(bookId),

    stats(bookId = S.ui.bookId) {
      const counts = api.findingCounts(bookId);
      return {
        words: S.bookWords(bookId),
        target: S.get(bookId)?.targetWords ?? 0,
        chapters: S.chapters(bookId).length,
        scenes: S.bookScenes(bookId).length,
        characters: S.entities(bookId, 'character').length,
        beats: S.beats(bookId).length,
        revelations: S.revelations(bookId).length,
        versions: S.versions(bookId).length,
        openQuestions: S.questions(bookId).filter((q) => q.status === 'open').length,
        ...counts,
      };
    },

    /* --- the reader model — the differentiator -------------------------- */

    reader(bookId = S.ui.bookId, at = null) {
      const model = readerModel(bookId);
      const last = model.scenes.length - 1;
      const position = at == null ? last : Math.max(0, Math.min(last, at));
      return {
        sceneCount: model.scenes.length,
        at: position,
        curve: tensionCurve(bookId, model),
        state: model.scenes.length ? readerStateAt(bookId, position, model) : null,
      };
    },

    /* --- style ---------------------------------------------------------- */

    style: {
      measure,
      blend,
      compare,
      describe,
      metrics: METRICS,
      /* Measure the written book so a UI can show drift without knowing how. */
      drift(bookId = S.ui.bookId, target) {
        const prose = S.bookScenes(bookId).map((s) => s.prose ?? '').join('\n\n');
        const current = measure(prose);
        return current && target
          ? compare(current, target).map((row) => ({ ...row, text: describe(row) }))
          : [];
      },
    },

    /* --- everything else ------------------------------------------------ */

    search: (query) => search(query),
    importFile: readManuscriptFile,
    detectStructure,

    screenplay: {
      generate: proseToFountain,
      parse: parseFountain,
      toFinalDraft,
      estimatePages,
    },

    manuscript: {
      compile: compileBook,
      toMarkdown,
      toHtml,
    },

    constants: { CANON, SCENE_STATUS, PATHWAYS, SEVERITY_LABEL },
    wordCount,
  };

  return api;
}

/* A module-level instance, for front ends that want one without plumbing. */
export const writeline = createWriteline();
