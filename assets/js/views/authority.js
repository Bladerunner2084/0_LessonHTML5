/* views/authority.js — PRD §27, §28, §29: Decision Log, Open Questions,
 * Idea Inbox. Grouped because they are one idea: the places where the author's
 * judgement is recorded so it does not evaporate into a conversation.
 *
 * A locked decision is the constraint any future AI layer must respect. Storing
 * the reason matters more than storing the decision — six months on, the reason
 * is the only thing that lets you judge whether unlocking it is a betrayal of
 * the book or a correction to it.
 */

import { h, field, select, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';

const save = debounce((id, fields) => S.patch(id, fields), 350);

const DECISION_STATUS = [
  { value: 'locked', label: '🔒 Locked — authoritative' },
  { value: 'open', label: '◌ Open — still deciding' },
  { value: 'unlocked', label: '🔓 Unlocked — open to change' },
];

export function renderDecisions(bookId) {
  const rows = S.decisions(bookId);
  const locked = rows.filter((d) => d.status === 'locked');

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Decision Log'),
        h('p', { class: 'sub' },
          `${locked.length} locked of ${rows.length}. A locked decision is authoritative: `
          + 'no audit, no suggestion and no future AI pass may quietly work around it.')),
      h('div', { class: 'view-actions' },
        h('button', {
          class: 'btn btn-small',
          onclick: async () => {
            const d = await S.create('decision', { bookId, label: 'New decision' });
            S.setUi({ selectionId: d.id });
          },
        }, '+ Decision'))),

    h('div', { class: 'stack' }, rows.length
      ? rows.map((d) => h('article', { class: `card decision ${d.status}` },
        h('div', { class: 'card-head' },
          h('input', {
            class: 'title-input', value: d.label,
            oninput: (e) => save(d.id, { label: e.target.value }),
          }),
          select(DECISION_STATUS, d.status, (v) => S.patch(d.id, { status: v || 'open' }),
            { placeholder: 'Status' }),
          h('button', {
            class: 'btn btn-small btn-danger',
            onclick: () => { if (confirmDanger(`Delete “${d.label}”?`)) S.remove(d.id); },
          }, '×')),
        field('Reason', h('textarea', {
          rows: 2, value: d.rationale,
          placeholder: 'Why. This is the field that matters in six months.',
          oninput: (e) => save(d.id, { rationale: e.target.value }),
        }))))
      : h('p', { class: 'empty pad' },
        'No decisions recorded. The first one worth writing down is usually the one you '
        + 'have already changed your mind about twice.')));
}

export function renderInbox(bookId) {
  const questions = S.questions(bookId);
  const open = questions.filter((q) => q.status === 'open');
  const ideas = S.ideas(bookId);

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Questions & Ideas'),
        h('p', { class: 'sub' },
          `${open.length} unanswered question(s), ${ideas.length} raw idea(s). `
          + 'Nothing here is organised, and that is deliberate.')),
      h('div', { class: 'view-actions' },
        h('button', {
          class: 'btn btn-small',
          onclick: () => S.create('question', { bookId, text: '' }),
        }, '+ Question'),
        h('button', {
          class: 'btn btn-small',
          onclick: () => S.create('idea', { bookId, text: '' }),
        }, '+ Idea'))),

    h('div', { class: 'two-col' },
      h('section', {},
        h('h3', {}, 'Open questions'),
        h('p', { class: 'sub' },
          'Things the story has not answered yet. Left in a conversation, these disappear.'),
        h('div', { class: 'stack' }, questions.length
          ? questions.map((q) => h('article', { class: `card question ${q.status}` },
            h('div', { class: 'card-head' },
              h('label', { class: 'check' },
                h('input', {
                  type: 'checkbox', checked: q.status === 'answered',
                  onchange: (e) => S.patch(q.id, { status: e.target.checked ? 'answered' : 'open' }),
                }),
                h('span', {}, q.status === 'answered' ? 'Answered' : 'Open')),
              h('button', {
                class: 'btn btn-small btn-danger',
                onclick: () => S.remove(q.id),
              }, '×')),
            h('textarea', {
              rows: 2, value: q.text, placeholder: 'Why did the AI choose Winston?',
              oninput: (e) => save(q.id, { text: e.target.value }),
            }),
            q.status === 'answered' ? h('textarea', {
              rows: 2, value: q.answer, placeholder: 'The answer you settled on.',
              oninput: (e) => save(q.id, { answer: e.target.value }),
            }) : null))
          : h('p', { class: 'empty' }, 'No questions recorded.'))),

      h('section', {},
        h('h3', {}, 'Idea inbox'),
        h('p', { class: 'sub' },
          'Unstructured, unjudged, unfiled. Creativity is messy before it is organised, '
          + 'and making you file an idea at the moment you have it is how ideas die.'),
        h('div', { class: 'stack' }, ideas.length
          ? ideas.map((idea) => h('article', { class: 'card idea' },
            h('textarea', {
              rows: 3, value: idea.text,
              placeholder: 'What if the AI isn’t actually conscious?',
              oninput: (e) => save(idea.id, { text: e.target.value }),
            }),
            h('div', { class: 'card-meta' },
              h('button', {
                class: 'link',
                onclick: async () => {
                  const text = idea.text.trim();
                  if (!text) return;
                  await S.create('question', {
                    bookId, text, canon: idea.canon,
                  });
                  await S.remove(idea.id);
                },
              }, 'Promote to question'),
              h('button', { class: 'link', onclick: () => S.remove(idea.id) }, 'Discard'))))
          : h('p', { class: 'empty' }, 'Empty. Throw something in without thinking about it.')))));
}
