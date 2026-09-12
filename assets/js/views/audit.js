/* views/audit.js — the report the rest of the app exists to make possible. */

import { h } from '../dom.js';
import * as S from '../state.js';
import { audit, summarise, RULES } from '../lint.js';

const SEVERITY_LABEL = { error: 'Contradiction', warn: 'Risk', info: 'Note' };

export function renderAudit(bookId) {
  const findings = audit(bookId);
  const counts = summarise(findings);

  const grouped = findings.reduce((acc, f) => {
    (acc[f.rule] ??= []).push(f);
    return acc;
  }, {});

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Continuity'),
        h('p', { class: 'sub' },
          'Computed from the graph on every change. Nothing here is stored, so nothing '
          + 'here can go stale.')),
      h('div', { class: 'view-actions score' },
        h('span', { class: 'tally bad' }, `${counts.error} contradictions`),
        h('span', { class: 'tally warn' }, `${counts.warn} risks`),
        h('span', { class: 'tally info' }, `${counts.info} notes`))),

    findings.length
      ? h('div', { class: 'audit' }, Object.entries(grouped).map(([rule, items]) =>
        h('section', { class: `audit-group ${RULES[rule].severity}` },
          h('h3', {},
            h('span', { class: `tally ${RULES[rule].severity === 'error' ? 'bad' : RULES[rule].severity}` },
              SEVERITY_LABEL[RULES[rule].severity]),
            rule.replace(/-/g, ' '),
            h('span', { class: 'muted' }, ` · ${items.length}`)),
          h('p', { class: 'sub' }, RULES[rule].blurb),
          h('ul', {}, items.map((f) => h('li', {},
            h('button', {
              class: 'link',
              onclick: () => S.setUi({ view: f.view, selectionId: f.recordId }),
            }, f.message)))))))
      : h('div', { class: 'clean' },
        h('p', {}, 'No contradictions found.'),
        h('p', { class: 'sub' },
          'That is not the same as "the book is good". It means the graph agrees with '
          + 'itself — nothing more, and nothing you should have to check by hand.')));
}
