/* pipeline.js — PRD §25, the Controlled Rewrite, as seventeen computed stages.
 *
 * The important decision here: these are NOT checkboxes the author ticks. A
 * checklist you mark yourself is a to-do list that lies to you by chapter ten.
 * Every stage below reads the graph and works out its own state, so the
 * dashboard reports where the book actually is rather than where you last
 * remembered to say it was.
 *
 * Stages needing an AI layer that does not exist yet report `pending` — the
 * PRD's own instruction (§ build prompt): mark future modules as architecture,
 * never replace them with fake functionality.
 */

import * as S from './state.js';
import { audit } from './lint.js';
import { wordCount } from './model.js';

const done = (detail) => ({ state: 'done', detail });
const partial = (detail) => ({ state: 'partial', detail });
const todo = (detail) => ({ state: 'todo', detail });
const pending = (detail) => ({ state: 'pending', detail });

const ratio = (n, d) => (d ? n / d : 0);

export const STAGES = [
  {
    n: 1,
    name: 'Preserve Draft 0',
    view: 'vault',
    check: (b) => {
      const versions = S.versions(b);
      const draft = S.inBook('note', b).find((x) => x.slot === 'draft0' && x.bookId === b);
      if (versions.length) return done(`${versions.length} version(s) preserved`);
      if (wordCount(draft?.body) > 50) return partial('Draft 0 has text but no snapshot taken');
      return todo('Nothing preserved yet');
    },
  },
  {
    n: 2,
    name: 'Extract Story DNA',
    view: 'story',
    check: (b) => {
      const pages = S.inBook('note', b).filter((x) => x.slot === 'story' && wordCount(x.body) > 20);
      const concepts = S.entities(b, 'concept');
      if (pages.length && concepts.length) return done(`${pages.length} page(s), ${concepts.length} concept(s)`);
      if (pages.length || concepts.length) return partial('Started');
      return todo('No premise or themes recorded');
    },
  },
  {
    n: 3,
    name: 'Build Story Bible',
    view: 'story',
    check: (b) => {
      const concepts = S.entities(b, 'concept');
      if (concepts.length >= 3) return done(`${concepts.length} concepts`);
      if (concepts.length) return partial(`${concepts.length} of 3 concepts`);
      return todo('Empty');
    },
  },
  {
    n: 4,
    name: 'Build Character Bible',
    view: 'character',
    check: (b) => {
      const cast = S.entities(b, 'character');
      if (!cast.length) return todo('No characters');
      const thin = cast.filter((c) => Object.values(c.fields ?? {}).filter(Boolean).length < 3);
      if (!thin.length) return done(`${cast.length} characters, all profiled`);
      return partial(`${thin.length} of ${cast.length} characters have fewer than 3 fields`);
    },
  },
  {
    n: 5,
    name: 'Build World Bible',
    view: 'world',
    check: (b) => {
      const world = ['location', 'faction', 'item'].flatMap((k) => S.entities(b, k));
      if (world.length >= 3) return done(`${world.length} entries`);
      if (world.length) return partial(`${world.length} of 3 entries`);
      return todo('Empty');
    },
  },
  {
    n: 6,
    name: 'Build Revelation Map',
    view: 'revelations',
    check: (b) => {
      const revs = S.revelations(b);
      if (!revs.length) return todo('No revelations tracked');
      const placed = revs.filter((r) => r.revealedIn);
      if (placed.length === revs.length) return done(`${revs.length} revelations, all placed`);
      return partial(`${revs.length - placed.length} of ${revs.length} have no reveal scene`);
    },
  },
  {
    n: 7,
    name: 'Build Timeline',
    view: 'timeline',
    check: (b) => {
      const beats = S.beats(b);
      if (beats.length >= 5) return done(`${beats.length} beats`);
      if (beats.length) return partial(`${beats.length} of 5 beats`);
      return todo('No chronology');
    },
  },
  {
    n: 8,
    name: 'Build Story Architecture',
    view: 'chapters',
    check: (b) => {
      const chapters = S.chapters(b);
      if (chapters.length >= 3) return done(`${chapters.length} chapters`);
      if (chapters.length) return partial(`${chapters.length} chapters — too few to see a shape`);
      return todo('No chapters');
    },
  },
  {
    n: 9,
    name: 'Build Chapter Map',
    view: 'chapters',
    check: (b) => {
      const chapters = S.chapters(b);
      if (!chapters.length) return todo('No chapters');
      const bare = chapters.filter((c) => !c.summary?.trim());
      if (!bare.length) return done(`${chapters.length} chapters, all summarised`);
      return partial(`${bare.length} of ${chapters.length} chapters have no summary`);
    },
  },
  {
    n: 10,
    name: 'Build Scene Map',
    view: 'scenes',
    check: (b) => {
      const scenes = S.bookScenes(b);
      if (!scenes.length) return todo('No scenes');
      /* PRD §10: a scene with no stated purpose is the thing the platform is
       * meant to catch, so an unsummarised scene is not a complete Scene Map. */
      const bare = scenes.filter((s) => !s.summary?.trim());
      if (!bare.length) return done(`${scenes.length} scenes, all with a stated purpose`);
      return partial(`${bare.length} of ${scenes.length} scenes have no stated purpose`);
    },
  },
  {
    n: 11,
    name: 'Continuity Audit',
    view: 'audit',
    check: (b) => {
      const errors = audit(b).filter((f) => f.severity === 'error');
      if (!S.bookScenes(b).length) return todo('Nothing to audit');
      return errors.length ? partial(`${errors.length} contradiction(s) open`) : done('Clean');
    },
  },
  {
    n: 12,
    name: 'Information Audit',
    view: 'revelations',
    check: (b) => {
      const info = audit(b).filter((f) =>
        ['premature-knowledge', 'never-revealed', 'unplanted-reveal', 'knowledge-without-source']
          .includes(f.rule));
      if (!S.revelations(b).length) return todo('No revelations to audit');
      return info.length ? partial(`${info.length} information finding(s)`) : done('Clean');
    },
  },
  {
    n: 13,
    name: 'Character Audit',
    view: 'character',
    check: (b) => {
      const cast = S.entities(b, 'character');
      if (!cast.length) return todo('No characters');
      /* Character Lock (PRD §4) needs an AI able to read prose against the
       * "would NEVER do" field. The structural half is checkable today. */
      const unlocked = cast.filter((c) => !c.fields?.['Would NEVER do']?.trim());
      if (unlocked.length) {
        return partial(`${unlocked.length} character(s) have no behavioural limit set`);
      }
      return pending('Limits set — prose-level Character Lock needs the AI layer');
    },
  },
  {
    n: 14,
    name: 'Pacing Audit',
    view: 'chapters',
    check: (b) => {
      const chapters = S.chapters(b);
      if (!chapters.length) return todo('No chapters');
      const untargeted = chapters.filter((c) => !c.targetWords);
      if (untargeted.length) return partial(`${untargeted.length} chapter(s) have no word target`);
      const drift = audit(b).filter((f) => f.rule === 'chapter-word-drift');
      return drift.length ? partial(`${drift.length} chapter(s) off target`) : done('On pace');
    },
  },
  {
    n: 15,
    name: 'Realism Audit',
    view: 'audit',
    check: () => pending('Future module — needs the AI layer and the Research Vault'),
  },
  {
    n: 16,
    name: 'Controlled Rewrite',
    view: 'vault',
    check: (b) => {
      const versions = S.versions(b);
      if (versions.length > 1) return partial(`${versions.length} versions — rewrite in progress`);
      return todo('No rewrite pass started');
    },
  },
  {
    n: 17,
    name: 'Complete Manuscript',
    view: 'manuscript',
    check: (b) => {
      const scenes = S.bookScenes(b);
      if (!scenes.length) return todo('Nothing written');
      const drafted = scenes.filter((s) => ['drafted', 'revised', 'locked'].includes(s.status));
      const target = S.get(b)?.targetWords ?? 0;
      const words = S.bookWords(b);
      if (drafted.length === scenes.length && target && words >= target * 0.8) {
        return done(`${words.toLocaleString()} words, all scenes drafted`);
      }
      return partial(`${drafted.length} of ${scenes.length} scenes drafted`
        + `${target ? `, ${Math.round(ratio(words, target) * 100)}% of target` : ''}`);
    },
  },
];

export function runPipeline(bookId) {
  return STAGES.map((stage) => ({ ...stage, ...stage.check(bookId) }));
}

/* Overall progress counts a `pending` stage as neither done nor outstanding:
 * a number that moves when you build an unrelated module would be a lie. */
export function progress(stages) {
  const scorable = stages.filter((s) => s.state !== 'pending');
  const earned = scorable.reduce((n, s) =>
    n + (s.state === 'done' ? 1 : s.state === 'partial' ? 0.5 : 0), 0);
  return scorable.length ? Math.round((earned / scorable.length) * 100) : 0;
}

/* PRD §41 — "the interface should answer: what should I work on next?"
 *
 * Order matters more than state here. The Controlled Rewrite is a SEQUENCE:
 * pointing the author at stage 16 while stage 3 is unfinished is precisely the
 * uncontrolled rewrite the methodology exists to prevent. So the next action is
 * the earliest stage that is not finished and not blocked on a module that does
 * not exist — one answer, in the order the method prescribes. */
export function nextAction(stages) {
  return stages.find((s) => s.state === 'todo' || s.state === 'partial') ?? null;
}
