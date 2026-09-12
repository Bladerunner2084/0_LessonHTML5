/* views/screenplay.js — Screenplay mode.
 *
 * Two guarantees, both structural rather than promised:
 *
 *   The novel is never touched. The screenplay is its own record; conversion
 *   reads the Scene Map and writes somewhere else entirely. There is no code
 *   path from this screen back into a scene's prose.
 *
 *   Your edits are never silently lost. Once a human has touched the script,
 *   re-converting takes a snapshot of the whole book first and says so. The
 *   author can always get back the version the machine overwrote.
 */

import { h, clear, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import {
  proseToFountain, parseFountain, toFinalDraft, estimatePages, noteCount, scriptWords,
} from '../script.js';
import { download, slug } from '../compile.js';

const saveBody = debounce((id, body) => S.patch(id, { body, editedSince: true }), 500);

export function renderScreenplay(bookId) {
  const script = S.list('script').find((r) => r.bookId === bookId) ?? null;
  const book = S.get(bookId);

  if (!script) {
    return h('div', { class: 'view' },
      head(null, bookId),
      h('div', { class: 'welcome' },
        h('h2', {}, 'No screenplay yet'),
        h('p', {},
          'Convert lays out a screenplay from the Scene Map: headings from each scene’s '
          + 'location and time of day, dialogue split out from attributed speech, action '
          + 'from the remaining prose.'),
        h('p', {},
          'It will not rewrite your prose into screen action. Turning “she remembered the '
          + 'fire” into something a camera can see is a craft judgement, and a machine that '
          + 'silently attempts it produces confident nonsense. Wherever it is unsure it '
          + 'leaves a note you can search for.'),
        h('p', { class: 'sub' },
          'Your novel is not modified. The screenplay is a separate document from the moment '
          + 'it is created.'),
        h('button', { class: 'btn btn-primary', onclick: () => convert(bookId, null) },
          'Convert to screenplay')));
  }

  const preview = h('div', { class: 'script-page' });
  const stats = h('div', { class: 'script-stats' });

  const source = h('textarea', {
    class: 'script-source', value: script.body, spellcheck: true,
    oninput: (e) => {
      saveBody(script.id, e.target.value);
      paint(e.target.value);
    },
  });

  function paint(body) {
    clear(preview).append(...parseFountain(body).map(renderBlock));
    const notes = noteCount(body);
    clear(stats).append(
      h('span', {}, `~${estimatePages(body)} pages`),
      h('span', {}, `${scriptWords(body).toLocaleString()} words`),
      notes
        ? h('span', { class: 'tally warn' }, `${notes} decision(s) left to you`)
        : h('span', { class: 'tally' }, 'no open notes'));
  }
  paint(script.body);

  return h('div', { class: 'view' },
    head(script, bookId),
    h('div', { class: 'split-body script-split' },
      h('div', { class: 'script-editor' },
        h('div', { class: 'script-bar' },
          h('span', { class: 'muted small' },
            script.editedSince ? 'Edited since conversion' : 'As converted'),
          stats),
        source),
      h('div', { class: 'script-preview' }, preview)));
}

function head(script, bookId) {
  const name = slug(S.get(bookId)?.title ?? 'screenplay');
  return h('header', { class: 'view-head' },
    h('div', {},
      h('h2', {}, 'Screenplay'),
      h('p', { class: 'sub' },
        'Fountain format — plain text, and it opens in Final Draft. A screenplay that '
        + 'cannot leave the tool it was written in is not a screenplay.')),
    h('div', { class: 'view-actions' },
      script ? h('button', {
        class: 'btn btn-small', onclick: () => convert(bookId, script),
      }, 'Re-convert from prose') : null,
      script ? h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: () => download(`${name}.fountain`, script.body, 'text/plain'),
      }, 'Export .fountain') : null,
      script ? h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: () => download(`${name}.fdx`,
          toFinalDraft(script.body, S.get(bookId)?.title), 'application/xml'),
      }, 'Export .fdx') : null));
}

function renderBlock(block) {
  if (block.type === 'title') return h('p', { class: 'sp-title' }, block.text);
  if (block.type === 'note') return h('p', { class: 'sp-note' }, block.text);
  return h('p', { class: `sp-${block.type}` }, block.text);
}

/* Re-converting is the only destructive action on this screen, so it is the one
 * that asks — and snapshots regardless of the answer to the prompt. */
async function convert(bookId, existing) {
  if (existing?.editedSince) {
    if (!confirmDanger(
      'Re-convert from the prose?\n\n'
      + 'Your edits to this screenplay will be replaced by a fresh conversion. '
      + 'A snapshot of the current state is saved to the Draft Vault first, so you can '
      + 'restore it.')) return;
    await S.snapshotBook(bookId, {
      label: `Before re-converting the screenplay`,
      reason: 'Automatic snapshot taken before the screenplay was regenerated from prose.',
    });
  }

  const body = proseToFountain(bookId);
  const now = new Date().toISOString();
  if (existing) await S.patch(existing.id, { body, generatedAt: now, editedSince: false });
  else {
    const book = S.get(bookId);
    await S.create('script', {
      projectId: book.projectId,
      bookId,
      title: `${book.title} — screenplay`,
      body,
      generatedAt: now,
    });
  }
}
