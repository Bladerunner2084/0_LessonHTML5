/* reader.js — the Reader Model.
 *
 * Every writing tool models the BOOK. This models the READER.
 *
 * The premise other continuity systems get wrong: they treat reader knowledge as
 * permanent. Once revealed, known forever. But a fact stated once, forty scenes
 * ago, with nothing since, is functionally unknown — the reader has forgotten
 * it. Every author has had an editor say "I didn't follow that" and thought "but
 * I explained it in chapter four". Both are true. Nothing has ever been able to
 * show the author why.
 *
 * So recall decays. Each time a fact is touched — planted, revealed, or leaned
 * on by a later scene — the reader's memory of it resets; between touches it
 * fades. That single change turns the graph into a simulation of a mind reading
 * the book, and everything else here falls out of it:
 *
 *   tension   — how many questions the reader is carrying, unanswered
 *   fading    — what they were told but no longer hold
 *   cast load — how many people they have been asked to keep straight
 *
 * None of this is AI. It is arithmetic over records the author already keeps,
 * which means it works offline, costs nothing per user, and cannot hallucinate.
 */

import * as S from './state.js';

/* Scenes, not words: a scene is the unit of attention a reader actually holds.
 * Twelve is deliberately conservative — roughly a chapter and a half in most
 * books, and reader-recall research puts unreinforced detail retention lower
 * than any novelist wants to believe. */
export const RECALL_HALF_LIFE = 12;

/* Below this a fact is functionally gone: the reader would not produce it if
 * asked, and certainly will not supply it to make sense of your sentence. */
export const FAINT = 0.35;

/* Scenes of silence that put a fact below FAINT. DERIVED, not chosen — an
 * independent second constant left one of the two conditions permanently
 * dominated by the other, so the gap check never actually decided anything. */
export const FADE_GAP = Math.ceil(RECALL_HALF_LIFE * Math.log2(1 / FAINT));

const WEIGHT = { minor: 1, major: 2, twist: 3 };

export const recallAt = (scenesSince) => 2 ** (-scenesSince / RECALL_HALF_LIFE);

/* Every point in reading order at which the reader's memory of a fact is
 * refreshed. Planting counts, the reveal counts, and so does a later scene
 * leaning on it — being reminded of a thing is how you keep hold of it. */
function touchpoints(rev, indexOf, scenes) {
  const points = new Set();
  for (const id of rev.plantedIn ?? []) {
    const i = indexOf.get(id);
    if (i != null) points.add(i);
  }
  const revealed = rev.revealedIn ? indexOf.get(rev.revealedIn) : null;
  if (revealed != null) points.add(revealed);
  scenes.forEach((s, i) => {
    if ((s.usesRevelationIds ?? []).includes(rev.id)) points.add(i);
  });
  return [...points].sort((a, b) => a - b);
}

export function readerModel(bookId) {
  const scenes = S.bookScenes(bookId);
  const indexOf = new Map(scenes.map((s, i) => [s.id, i]));
  const revelations = S.revelations(bookId);

  const facts = revelations.map((rev) => {
    const touches = touchpoints(rev, indexOf, scenes);
    const revealedAt = rev.revealedIn ? indexOf.get(rev.revealedIn) ?? null : null;
    return {
      rev,
      touches,
      revealedAt,
      firstTouch: touches.length ? touches[0] : null,
      weight: WEIGHT[rev.weight] ?? 1,
    };
  });

  /* First and last appearance of every character, in reading order. */
  const appearances = new Map();
  scenes.forEach((s, i) => {
    const cast = new Set([...(s.presentIds ?? []), s.pov].filter(Boolean));
    for (const id of cast) {
      if (!appearances.has(id)) appearances.set(id, []);
      appearances.get(id).push(i);
    }
  });

  return { scenes, indexOf, facts, appearances };
}

/* What is in the reader's head immediately AFTER finishing scene `at`. */
export function readerStateAt(bookId, at, model = readerModel(bookId)) {
  const { scenes, facts, appearances } = model;
  const known = [];
  const open = [];
  const fading = [];
  const wrong = [];

  for (const f of facts) {
    const seen = f.touches.filter((t) => t <= at);
    if (!seen.length) continue;
    const last = seen[seen.length - 1];
    const scenesSince = at - last;
    const strength = recallAt(scenesSince);
    const entry = {
      id: f.rev.id, label: f.rev.label, status: f.rev.status,
      weight: f.weight, strength, scenesSince, lastSeen: last, touches: seen.length,
    };

    /* Planted but not yet revealed: an open loop the reader is carrying. */
    if (f.revealedAt == null || f.revealedAt > at) open.push(entry);
    else {
      known.push(entry);
      if (strength < FAINT) fading.push(entry);
    }
    if (f.rev.status === 'misunderstood' || f.rev.status === 'false') wrong.push(entry);
  }

  const met = [];
  for (const [entityId, indices] of appearances) {
    const seen = indices.filter((i) => i <= at);
    if (!seen.length) continue;
    const since = at - seen[seen.length - 1];
    met.push({ entityId, since, appearances: seen.length, strength: recallAt(since) });
  }

  return {
    at,
    scene: scenes[at] ?? null,
    known,
    open,
    fading,
    wrong,
    met: met.sort((a, b) => a.since - b.since),
    /* Tension is the weight of what the reader is waiting to find out. It is not
     * a mood, it is a count — and that is exactly why it can be computed. */
    tension: open.reduce((n, e) => n + e.weight, 0),
  };
}

export function tensionCurve(bookId, model = readerModel(bookId)) {
  const { scenes, facts } = model;
  return scenes.map((scene, i) => {
    let tension = 0;
    let opened = 0;
    let closed = 0;
    for (const f of facts) {
      if (f.firstTouch == null) continue;
      const isOpen = f.firstTouch <= i && (f.revealedAt == null || f.revealedAt > i);
      if (isOpen) tension += f.weight;
      if (f.firstTouch === i) opened += 1;
      if (f.revealedAt === i) closed += 1;
    }
    return { i, scene, tension, opened, closed };
  });
}

/* --- findings the curve makes visible ---------------------------------- */

const FLAT_RUN = 5;      // scenes in a row where nothing opens and nothing closes
const NEW_FACE_WINDOW = 3;
const NEW_FACE_LIMIT = 5;

export function readerFindings(bookId) {
  const model = readerModel(bookId);
  const { scenes, facts, appearances } = model;
  const out = [];
  if (scenes.length < 2) return out;

  const label = (scene, i) => ({ recordId: scene.id, view: 'reader', label: `${i + 1}. ${scene.title}` });

  /* 1. The reader has forgotten something the scene needs them to hold. */
  scenes.forEach((scene, i) => {
    for (const revId of scene.usesRevelationIds ?? []) {
      const f = facts.find((x) => x.rev.id === revId);
      if (!f) continue;
      const prior = f.touches.filter((t) => t < i);
      if (!prior.length) continue;             // premature-knowledge already covers this
      const gap = i - prior[prior.length - 1];
      if (gap >= FADE_GAP) {
        out.push({
          rule: 'reader-forgot',
          severity: 'warn',
          message: `“${scene.title}” relies on “${f.rev.label}”, last mentioned ${gap} scenes `
            + `earlier. At that distance the reader no longer has it.`,
          ...label(scene, i),
        });
      }
    }
  });

  /* 2. A stretch where nothing opens and nothing closes. Not "boring" — the
   * engine cannot judge prose — but structurally inert, which is where readers
   * put a book down. */
  const curve = tensionCurve(bookId, model);
  let runStart = null;
  for (let i = 0; i <= curve.length; i += 1) {
    const inert = i < curve.length && curve[i].opened === 0 && curve[i].closed === 0;
    if (inert && runStart == null) runStart = i;
    if (!inert && runStart != null) {
      const length = i - runStart;
      if (length >= FLAT_RUN) {
        out.push({
          rule: 'tension-flatline',
          severity: 'warn',
          message: `Scenes ${runStart + 1}–${i} open nothing and resolve nothing. `
            + `${length} scenes where the reader learns of no new question and gets no answer.`,
          ...label(curve[runStart].scene, runStart),
        });
      }
      runStart = null;
    }
  }

  /* 3. The reader is carrying nothing, and the book is not over. Measured only
   * after the first question opens — a book has no tension on page one either,
   * and reporting that would be reporting the beginning — and only where enough
   * book remains for the gap to cost anything. A lull with two scenes to go is
   * a landing, not a sag. */
  const MIN_RUNWAY = 4;
  const tailStart = Math.floor(curve.length * 0.85);
  const firstOpen = curve.findIndex((p) => p.opened > 0);
  const emptyEarly = firstOpen < 0
    ? -1
    : curve.findIndex((p, i) => i > firstOpen && i < tailStart && p.tension === 0
      && curve.length - i - 1 >= MIN_RUNWAY);
  if (emptyEarly > 0) {
    const left = curve.length - emptyEarly - 1;
    out.push({
      rule: 'tension-deflation',
      severity: 'warn',
      message: `By scene ${emptyEarly + 1} the reader has no open question left, with `
        + `${left} scene${left === 1 ? '' : 's'} still to go.`,
      ...label(curve[emptyEarly].scene, emptyEarly),
    });
  }

  /* 4. A character walks back on after the reader has lost them. */
  for (const [entityId, indices] of appearances) {
    for (let k = 1; k < indices.length; k += 1) {
      const gap = indices[k] - indices[k - 1];
      if (gap >= FADE_GAP * 1.5) {
        const scene = scenes[indices[k]];
        out.push({
          rule: 'character-faded',
          severity: 'warn',
          message: `${S.entityName(entityId)} returns in “${scene.title}” after ${gap} scenes `
            + 'away. Reintroduce them, or the reader meets a stranger.',
          ...label(scene, indices[k]),
        });
        break;                                  // one report per character is enough
      }
    }
  }

  /* 5. Too many new faces too fast. */
  const firstSeen = new Map();
  for (const [entityId, indices] of appearances) firstSeen.set(entityId, indices[0]);
  for (let i = 0; i + NEW_FACE_WINDOW <= scenes.length; i += 1) {
    const fresh = [...firstSeen.values()].filter((f) => f >= i && f < i + NEW_FACE_WINDOW);
    if (fresh.length > NEW_FACE_LIMIT) {
      out.push({
        rule: 'cast-overload',
        severity: 'info',
        message: `${fresh.length} characters first appear across scenes ${i + 1}–${i + NEW_FACE_WINDOW}. `
          + 'That is a lot of names to hold at once.',
        ...label(scenes[i], i),
      });
      break;
    }
  }

  return out;
}
