/* views/draft0.js — Draft 0 is the only place in the app with no structure at
 * all, and that is its job: get the thing out of your head before the graph
 * starts asking you questions it is too early to answer.
 *
 * The one affordance it does have is extraction. Select a phrase, promote it to
 * a character, a beat or a scene. That is how an unstructured dump becomes a
 * graph without a separate transcription pass — the step where most outlining
 * tools quietly lose you.
 */

import { h, debounce } from '../dom.js';
import * as S from '../state.js';
import { wordCount } from '../model.js';

const saveBody = debounce((id, body) => S.patch(id, { body }), 400);

export function renderDraft0(bookId) {
  let note = S.inBook('note', bookId).find((n) => n.slot === 'draft0' && n.bookId === bookId);
  if (!note) {
    S.create('note', { bookId, slot: 'draft0', title: 'Draft 0', body: '' });
    return h('p', { class: 'empty pad' }, 'Preparing Draft 0…');
  }

  const area = h('textarea', {
    class: 'draft0-area',
    placeholder:
      'Write badly and fast. Nobody reads Draft 0 — not even you, later.\n\n'
      + 'Select any phrase and use the buttons above to promote it into a '
      + 'character, a beat or a scene.',
    value: note.body,
    oninput: (e) => {
      saveBody(note.id, e.target.value);
      counter.textContent = `${wordCount(e.target.value).toLocaleString()} words`;
    },
  });

  const counter = h('span', { class: 'muted' }, `${wordCount(note.body).toLocaleString()} words`);
  const status = h('span', { class: 'muted' });

  const selection = () => area.value.slice(area.selectionStart, area.selectionEnd).trim();

  const promote = (label, fn) => h('button', {
    class: 'btn btn-small',
    onclick: async () => {
      const text = selection();
      if (!text) {
        status.textContent = 'Select some text first.';
        return;
      }
      await fn(text.replace(/\s+/g, ' ').slice(0, 120), text);
      status.textContent = `Promoted to ${label.toLowerCase()}.`;
    },
  }, label);

  return h('div', { class: 'view draft0' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Draft 0'),
        h('p', { class: 'sub' }, 'Unstructured. Unjudged. The raw material for everything else.')),
      h('div', { class: 'view-actions' }, counter)),

    h('div', { class: 'extract-bar' },
      h('span', { class: 'muted' }, 'Selection →'),
      promote('Character', (name) => S.create('entity', { bookId, kind: 'character', name })),
      promote('Location', (name) => S.create('entity', { bookId, kind: 'location', name })),
      promote('Concept', (name) => S.create('entity', { bookId, kind: 'concept', name })),
      promote('Beat', (label, full) => S.create('beat', {
        bookId, label, description: full, order: S.beats(bookId).length,
      })),
      promote('Revelation', (label, full) => S.create('revelation', {
        bookId, label, fact: full,
      })),
      promote('Scene', async (title, full) => {
        const chapter = S.chapters(bookId)[0]
          ?? await S.create('chapter', { bookId, title: 'Chapter One', order: 0 });
        await S.create('scene', {
          bookId,
          chapterId: chapter.id,
          title,
          summary: full,
          order: S.scenesOf(chapter.id).length,
        });
      }),
      status),

    area);
}
