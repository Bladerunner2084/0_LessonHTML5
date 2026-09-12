/* views/manuscript.js — read-only on purpose.
 *
 * Every tool that lets you edit both the outline and the manuscript ends the
 * same way: the two disagree, and the outline loses, and by chapter thirty you
 * are maintaining a lie. Here the Manuscript is a compile target. If a line is
 * wrong, you fix it in the scene that owns it.
 */

import { h } from '../dom.js';
import * as S from '../state.js';
import { compileBook, toMarkdown, toHtml, download, slug } from '../compile.js';

export function renderManuscript(bookId) {
  const book = compileBook(bookId, { includeNotes: false });
  const target = S.get(bookId)?.targetWords ?? 0;
  const name = slug(book.title);

  const pages = Math.round(book.words / 250);

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Manuscript'),
        h('p', { class: 'sub' },
          `${book.words.toLocaleString()} words · ~${pages} pages`
          + `${target ? ` · ${Math.round((book.words / target) * 100)}% of target` : ''}`)),
      h('div', { class: 'view-actions' },
        h('button', {
          class: 'btn btn-small',
          onclick: () => download(`${name}.md`, toMarkdown(bookId), 'text/markdown'),
        }, 'Export .md'),
        h('button', {
          class: 'btn btn-small',
          onclick: () => download(`${name}.html`, toHtml(bookId), 'text/html'),
        }, 'Export .html'),
        h('button', {
          class: 'btn btn-small btn-ghost',
          onclick: () => download(`${name}-annotated.md`,
            toMarkdown(bookId, { sceneHeadings: true, includeNotes: true }), 'text/markdown'),
        }, 'Export annotated'))),

    book.chapters.length
      ? h('div', { class: 'manuscript' }, book.chapters.map((ch) => h('section', {},
        h('h3', {}, `${ch.number}. ${ch.title}`),
        ch.scenes.map((scene, i) => h('div', { class: 'ms-scene' },
          i > 0 ? h('div', { class: 'ms-break' }, '* * *') : null,
          scene.prose.trim()
            ? scene.prose.trim().split(/\n{2,}/).map((p) => h('p', {}, p))
            : h('p', { class: 'ms-empty' },
              h('button', {
                class: 'link',
                onclick: () => S.setUi({ view: 'scenes', selectionId: scene.id }),
              }, `[ ${scene.title} — unwritten ]`)))))))
      : h('p', { class: 'empty pad' }, 'Nothing to compile yet.'));
}
