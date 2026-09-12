/* views/dashboard.js — PRD §30 and §25 on one screen.
 *
 * Every number here is derived. Nothing on this page is a field somebody has to
 * remember to update, because the first stale number on a dashboard destroys
 * trust in all the others.
 */

import { h } from '../dom.js';
import * as S from '../state.js';
import { audit, summarise } from '../lint.js';
import { runPipeline, progress, nextAction } from '../pipeline.js';
import { wordCount } from '../model.js';

const STATE_MARK = { done: '●', partial: '◐', todo: '○', pending: '◌' };

export function renderDashboard(bookId) {
  const book = S.get(bookId);
  const project = S.get(S.ui.projectId);
  const findings = audit(bookId);
  const counts = summarise(findings);
  const stages = runPipeline(bookId);
  const pct = progress(stages);
  const next = nextAction(stages);

  const scenes = S.bookScenes(bookId);
  const words = S.bookWords(bookId);
  const openQuestions = S.questions(bookId).filter((q) => q.status === 'open');
  const needsRevision = scenes.filter((s) => s.status === 'drafted');
  const premature = findings.filter((f) => f.rule === 'premature-knowledge');
  const versions = S.versions(bookId);
  const provisional = ['entity', 'revelation', 'beat', 'scene']
    .flatMap((t) => S.inBook(t, bookId)).filter((r) => r.canon && r.canon !== 'canon');

  const stat = (label, value, view, tone = '') => h('button', {
    class: `stat ${tone}`,
    onclick: () => view && S.setUi({ view, selectionId: null }),
  }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, project?.title ?? 'Dashboard',
          book && book.title !== project?.title ? h('span', { class: 'muted' }, ` · ${book.title}`) : null),
        h('p', { class: 'sub' },
          `${versions[0]?.label ?? 'No version preserved'} · `
          + `${words.toLocaleString()} of ${(book?.targetWords ?? 0).toLocaleString()} words`)),
      h('div', { class: 'view-actions' },
        h('div', { class: 'overall' },
          h('span', { class: 'overall-pct' }, `${pct}%`),
          h('span', { class: 'muted small' }, 'controlled rewrite')))),

    h('div', { class: 'dash' },
      next ? h('section', { class: 'next-up' },
        h('span', { class: 'next-label' }, 'Work on next'),
        h('button', {
          class: 'next-action',
          onclick: () => S.setUi({ view: next.view, selectionId: null }),
        }, `${next.n}. ${next.name}`),
        h('p', { class: 'sub' }, next.detail))
        : h('section', { class: 'next-up clean-note' },
          h('span', { class: 'next-label' }, 'Nothing outstanding'),
          h('p', { class: 'sub' },
            'Every stage the platform can check is finished. What remains needs a '
            + 'reader, not an audit.')),

      h('div', { class: 'stat-grid' },
        stat('chapters', S.chapters(bookId).length, 'chapters'),
        stat('scenes', scenes.length, 'scenes'),
        stat('characters', S.entities(bookId, 'character').length, 'character'),
        stat('beats', S.beats(bookId).length, 'timeline'),
        stat('revelations', S.revelations(bookId).length, 'revelations'),
        stat('versions', versions.length, 'vault'),
        stat('open questions', openQuestions.length, 'inbox', openQuestions.length ? 'warn' : ''),
        stat('continuity errors', counts.error, 'audit', counts.error ? 'bad' : ''),
        stat('premature reveals', premature.length, 'revelations', premature.length ? 'bad' : ''),
        stat('scenes needing revision', needsRevision.length, 'scenes'),
        stat('not yet canon', provisional.length, 'audit', provisional.length ? 'warn' : ''),
        stat('locked decisions', S.decisions(bookId).filter((d) => d.status === 'locked').length,
          'decisions')),

      h('section', { class: 'pipeline' },
        h('h3', {}, 'Controlled Rewrite'),
        h('p', { class: 'sub' },
          'Seventeen stages, each computed from the graph. Nothing here is a checkbox '
          + 'you tick yourself — a checklist you maintain by hand starts lying to you '
          + 'around chapter ten.'),
        h('ol', { class: 'stage-list' }, stages.map((stage) => h('li', {
          class: `stage ${stage.state}`,
        },
          h('button', {
            class: 'stage-row',
            onclick: () => S.setUi({ view: stage.view, selectionId: null }),
          },
            h('span', { class: 'stage-mark' }, STATE_MARK[stage.state]),
            h('span', { class: 'stage-n' }, String(stage.n).padStart(2, '0')),
            h('span', { class: 'stage-name' }, stage.name),
            h('span', { class: 'stage-detail muted' }, stage.detail)))))),

      h('section', { class: 'authority-note' },
        h('h3', {}, 'Where the author stays in charge'),
        h('p', { class: 'sub' },
          'The platform reports. It does not decide. Every finding above links to the '
          + 'record that produced it, and no audit changes a single stored fact.'),
        h('div', { class: 'chip-row' },
          h('button', { class: 'chip', onclick: () => S.setUi({ view: 'decisions' }) },
            'Decision Log'),
          h('button', { class: 'chip', onclick: () => S.setUi({ view: 'inbox' }) },
            'Open Questions & Ideas'),
          h('button', { class: 'chip', onclick: () => S.setUi({ view: 'vault' }) },
            'Draft Vault')))));
}

export { wordCount };
