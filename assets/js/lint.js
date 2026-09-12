/* lint.js — the continuity engine.
 *
 * This is the reason the graph exists. An outliner made of nine documents can
 * only tell you what you typed. A graph can tell you what you contradicted.
 *
 * Two orders run through every book and they are not the same order:
 *   reading order      — chapter.order, then scene.order   (how the reader arrives)
 *   chronological order — beat.order                       (when it happened)
 * Almost every continuity bug in a novel is a disagreement between the two.
 * Every rule below is a specific, checkable form of that disagreement.
 */

import * as S from './state.js';
import { wordCount } from './model.js';

const DRAFTED = new Set(['drafted', 'revised', 'locked']);

export const RULES = {
  'premature-knowledge': {
    severity: 'error',
    blurb: 'A scene leans on a fact the reader has not been shown yet.',
  },
  'ghost-cast': {
    severity: 'error',
    blurb: 'A character appears in a scene set after they died or left.',
  },
  'chronology-inversion': {
    severity: 'warn',
    blurb: 'Story time runs backwards here and the scene is not flagged as a flashback.',
  },
  'unplanted-reveal': {
    severity: 'warn',
    blurb: 'A major reveal with no setup scenes. It will read as a cheat.',
  },
  'never-revealed': {
    severity: 'warn',
    blurb: 'A tracked fact the reader never learns.',
  },
  'knowledge-without-source': {
    severity: 'warn',
    blurb: 'A character knows something with no beat explaining how.',
  },
  'pov-not-present': {
    severity: 'error',
    blurb: 'The POV character is not in the scene they are narrating.',
  },
  'missing-pov': { severity: 'warn', blurb: 'A drafted scene with no POV assigned.' },
  'missing-location': { severity: 'info', blurb: 'A drafted scene with no location.' },
  'empty-drafted': { severity: 'error', blurb: 'Marked drafted but contains no prose.' },
  'unplaced-scene': {
    severity: 'info',
    blurb: 'No beat attached, so this scene has no position in story time.',
  },
  'orphan-entity': {
    severity: 'info',
    blurb: 'In the bible but never appears in a scene or beat.',
  },
  'chapter-word-drift': {
    severity: 'info',
    blurb: 'A fully drafted chapter far off its word target.',
  },
};

export const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

function finding(rule, message, where) {
  return {
    rule,
    severity: RULES[rule].severity,
    message,
    ...where, // { recordId, view, label }
  };
}

export function audit(bookId) {
  if (!bookId) return [];

  const chapters = S.chapters(bookId);
  const scenes = S.bookScenes(bookId);
  const beats = S.beats(bookId);
  const revelations = S.revelations(bookId);
  const out = [];

  /* Reading order index: position of each scene in the finished book. */
  const readingIndex = new Map(scenes.map((s, i) => [s.id, i]));

  /* Chronological placement. A scene is placed in story time by the earliest
   * beat attached to it. Scenes with no beat float free — that is itself worth
   * reporting, but only once the writer has started building a timeline. */
  const chronoOf = new Map();
  for (const beat of beats) {
    if (!beat.sceneId) continue;
    const prev = chronoOf.get(beat.sceneId);
    if (prev == null || beat.order < prev) chronoOf.set(beat.sceneId, beat.order);
  }

  const sceneLabel = (s) => {
    const ch = S.get(s.chapterId);
    const chIdx = chapters.findIndex((c) => c.id === s.chapterId);
    return `${ch ? `Ch ${chIdx + 1}` : 'Unfiled'} · ${s.title}`;
  };
  const at = (scene) => ({ recordId: scene.id, view: 'scenes', label: sceneLabel(scene) });

  /* --- 1. Reader knowledge -------------------------------------------- */
  for (const scene of scenes) {
    const here = readingIndex.get(scene.id);
    for (const revId of scene.usesRevelationIds ?? []) {
      const rev = S.get(revId);
      if (!rev) continue;
      const revealAt = rev.revealedIn ? readingIndex.get(rev.revealedIn) : null;
      if (revealAt == null) {
        out.push(finding('premature-knowledge',
          `“${scene.title}” uses “${rev.label}”, which is never revealed to the reader.`,
          at(scene)));
      } else if (revealAt > here) {
        const revealScene = S.get(rev.revealedIn);
        out.push(finding('premature-knowledge',
          `“${scene.title}” uses “${rev.label}”, but the reader only learns it later, in `
          + `“${revealScene.title}”.`,
          at(scene)));
      }
    }
  }

  for (const rev of revelations) {
    if (!rev.revealedIn) {
      out.push(finding('never-revealed',
        `“${rev.label}” has no reveal scene. The reader never finds out.`,
        { recordId: rev.id, view: 'revelations', label: rev.label }));
    } else if (rev.weight !== 'minor' && (rev.plantedIn ?? []).length === 0) {
      out.push(finding('unplanted-reveal',
        `“${rev.label}” is a ${rev.weight} with zero planted setup.`,
        { recordId: rev.id, view: 'revelations', label: rev.label }));
    }
    for (const k of rev.knownBy ?? []) {
      if (!k.sinceBeatId) {
        out.push(finding('knowledge-without-source',
          `${S.entityName(k.entityId)} knows “${rev.label}” but no beat says how.`,
          { recordId: rev.id, view: 'revelations', label: rev.label }));
      }
    }
  }

  /* --- 2. Who can legally be on the page ------------------------------ */
  const exits = new Map();   // entityId -> earliest chrono order they leave the story
  const enters = new Map();  // entityId -> latest chrono order they arrive
  for (const beat of beats) {
    const gate = { death: 'exit', exit: 'exit', birth: 'enter', arrive: 'enter' }[beat.kind];
    if (!gate) continue;
    for (const eid of beat.entityIds ?? []) {
      if (gate === 'exit') {
        if (!exits.has(eid) || beat.order < exits.get(eid)) exits.set(eid, beat.order);
      } else if (!enters.has(eid) || beat.order > enters.get(eid)) enters.set(eid, beat.order);
    }
  }

  for (const scene of scenes) {
    const chrono = chronoOf.get(scene.id);
    if (chrono == null) {
      if (beats.length) out.push(finding('unplaced-scene',
        `“${scene.title}” is not attached to any beat.`, at(scene)));
      continue;
    }
    if (scene.isFlashback) continue; // a flashback is allowed to break both gates
    for (const eid of scene.presentIds ?? []) {
      const gone = exits.get(eid);
      if (gone != null && chrono > gone) {
        out.push(finding('ghost-cast',
          `${S.entityName(eid)} appears in “${scene.title}”, which is set after they `
          + `leave the story.`, at(scene)));
      }
      const arrived = enters.get(eid);
      if (arrived != null && chrono < arrived) {
        out.push(finding('ghost-cast',
          `${S.entityName(eid)} appears in “${scene.title}”, set before they enter the story.`,
          at(scene)));
      }
    }
  }

  /* --- 3. Reading order vs story time --------------------------------- */
  let lastChrono = null;
  let lastScene = null;
  for (const scene of scenes) {
    const chrono = chronoOf.get(scene.id);
    if (chrono == null) continue;
    if (lastChrono != null && chrono < lastChrono && !scene.isFlashback) {
      out.push(finding('chronology-inversion',
        `“${scene.title}” is set before “${lastScene.title}” but is read after it.`,
        at(scene)));
    }
    if (chrono >= (lastChrono ?? -Infinity)) { lastChrono = chrono; lastScene = scene; }
  }

  /* --- 4. Scene hygiene ----------------------------------------------- */
  for (const scene of scenes) {
    const words = wordCount(scene.prose);
    if (DRAFTED.has(scene.status)) {
      if (words === 0) {
        out.push(finding('empty-drafted', `“${scene.title}” is ${scene.status} but empty.`,
          at(scene)));
      }
      if (!scene.pov) out.push(finding('missing-pov', `“${scene.title}” has no POV.`, at(scene)));
      if (!scene.locationId) {
        out.push(finding('missing-location', `“${scene.title}” has no location.`, at(scene)));
      }
    }
    if (scene.pov && !(scene.presentIds ?? []).includes(scene.pov)) {
      out.push(finding('pov-not-present',
        `${S.entityName(scene.pov)} narrates “${scene.title}” but is not in the cast list.`,
        at(scene)));
    }
  }

  /* --- 5. Dead weight in the bibles ----------------------------------- */
  const used = new Set();
  scenes.forEach((s) => {
    (s.presentIds ?? []).forEach((id) => used.add(id));
    if (s.pov) used.add(s.pov);
    if (s.locationId) used.add(s.locationId);
  });
  beats.forEach((b) => (b.entityIds ?? []).forEach((id) => used.add(id)));
  revelations.forEach((r) => (r.knownBy ?? []).forEach((k) => used.add(k.entityId)));

  for (const e of S.entities(bookId)) {
    if (!used.has(e.id)) {
      out.push(finding('orphan-entity', `${e.name} never appears anywhere.`,
        { recordId: e.id, view: 'bible', label: e.name }));
    }
  }

  /* --- 6. Pacing ------------------------------------------------------ */
  for (const [i, ch] of chapters.entries()) {
    const chScenes = S.scenesOf(ch.id);
    if (!chScenes.length || !chScenes.every((s) => DRAFTED.has(s.status))) continue;
    const actual = chScenes.reduce((n, s) => n + wordCount(s.prose), 0);
    const target = ch.targetWords || 0;
    if (!target) continue;
    const drift = (actual - target) / target;
    if (Math.abs(drift) >= 0.4) {
      out.push(finding('chapter-word-drift',
        `Ch ${i + 1} “${ch.title}”: ${actual.toLocaleString()} words against a target of `
        + `${target.toLocaleString()} (${drift > 0 ? '+' : ''}${Math.round(drift * 100)}%).`,
        { recordId: ch.id, view: 'chapters', label: ch.title }));
    }
  }

  return out.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.rule.localeCompare(b.rule));
}

export function summarise(findings) {
  return findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, { error: 0, warn: 0, info: 0 });
}
