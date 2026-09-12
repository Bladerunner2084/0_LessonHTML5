/* views/search.js — results for whatever is in the search box. */

import { h } from '../dom.js';
import * as S from '../state.js';
import { search } from '../search.js';

export function renderSearch() {
  const query = S.ui.query ?? '';
  const results = search(query);

  const grouped = results.reduce((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, `Results for “${query}”`),
        h('p', { class: 'sub' },
          results.length
            ? `${results.length} match${results.length === 1 ? '' : 'es'} across this project`
            : 'Nothing found. Every term has to appear somewhere on a record.')),
      h('div', { class: 'view-actions' },
        h('button', {
          class: 'btn btn-small btn-ghost',
          onclick: () => S.setUi({ query: '' }),
        }, 'Clear'))),

    results.length ? h('div', { class: 'dash results' },
      Object.entries(grouped).map(([kind, rows]) => h('section', {},
        h('h3', {}, kind, h('span', { class: 'muted' }, ` · ${rows.length}`)),
        h('ul', { class: 'result-list' }, rows.map((r) => h('li', {},
          h('button', {
            class: 'result',
            onclick: () => S.setUi({
              query: '',
              bookId: r.bookId ?? S.ui.bookId,
              view: r.view,
              selectionId: r.id,
            }),
          },
            h('span', { class: 'result-head' },
              h('span', { class: 'kind-icon' }, r.icon),
              h('span', { class: 'name' }, r.title)),
            r.snippet.length
              ? h('span', { class: 'result-snippet' },
                r.snippet.map((run) => (run.hit
                  ? h('mark', {}, run.text)
                  : document.createTextNode(run.text))))
              : null))))))) : null);
}
