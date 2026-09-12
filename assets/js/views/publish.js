/* views/publish.js — PRD §35/§36, Publication Mode.
 *
 * Three routes out of a finished manuscript, and the platform is honest that it
 * carries you to the door of each rather than through it. Every checklist item
 * here is a real obligation somebody has to discharge; none of them are
 * automated, and pretending otherwise is how authors publish books missing a
 * copyright page.
 *
 * The readiness gate is deliberate. Publication Mode opens regardless — you are
 * allowed to plan — but it will not tell you the manuscript is ready when the
 * Continuity engine still has open contradictions.
 */

import { h, field, select, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { PATHWAYS } from '../model.js';
import { audit } from '../lint.js';
import { runPipeline } from '../pipeline.js';
import { toMarkdown, toHtml, download, slug } from '../compile.js';

const save = debounce((id, fields) => S.patch(id, fields), 350);

/* Shared obligations first: they are true whichever door you walk through. */
const COMMON = [
  ['manuscript', 'Manuscript complete and compiled'],
  ['continuity', 'Continuity clean — no open contradictions'],
  ['proofread', 'Line edit and proofread by someone who is not you'],
  ['title', 'Title and subtitle settled'],
  ['blurb', 'Back-cover blurb written'],
  ['bio', 'Author bio written'],
];

const CHECKLISTS = {
  traditional: [
    ...COMMON,
    ['query', 'Query letter drafted'],
    ['synopsis', 'One-to-two page synopsis'],
    ['comps', 'Comparable titles identified — recent, same shelf'],
    ['agents', 'Agent list researched and prioritised'],
    ['guidelines', 'Each agent’s submission guidelines read individually'],
    ['tracker', 'Submissions logged below'],
    ['rights', 'Rights you are prepared to give up, decided in advance'],
  ],
  self: [
    ...COMMON,
    ['cover', 'Cover designed — commissioned, not improvised'],
    ['interior', 'Interior layout and typesetting'],
    ['isbn', 'ISBN acquired (one per format)'],
    ['copyright', 'Copyright page and registration'],
    ['platform', 'Distribution platform chosen'],
    ['pricing', 'Pricing and royalty structure decided'],
    ['metadata', 'Categories and keywords chosen'],
    ['arc', 'ARC readers lined up for launch-week reviews'],
    ['launch', 'Launch plan — the book does not sell itself'],
  ],
  /* Ordered by what actually blocks a launch. The production items come first
   * because a wrong spine width is discovered at the proof stage and costs a
   * week; the money and tax items come next because they are the ones authors
   * discover after the first sale, which is the worst possible time. */
  /* Deliberately NOT a custodial model. The customer pays the author, through
   * the author's own processor; this application never holds funds, so it never
   * becomes a money transmitter with the licensing, identity checks and
   * chargeback liability that position carries. The author gets the identical
   * outcome. The checklist below is therefore the author's own setup, ordered by
   * what actually blocks a launch. */
  direct: [
    ...COMMON,
    ['interior', 'Print-ready interior PDF at the printer’s spec — bleed, trim, gutter'],
    ['spine', 'Cover wrap built from the printer’s spine calculator for the FINAL page count'],
    ['proof', 'Physical proof copy ordered, held, and approved'],
    ['pod', 'Print-on-demand partner chosen and account linked'],
    ['store', 'Storefront live on your own domain'],
    ['payments', 'Your own payment processor, paying into your own bank account'],
    ['mor', 'Merchant of record: YOU. This app is never in the payment path'],
    ['tax', 'Sales tax / VAT registration and collection, per territory you ship to'],
    ['chargebacks', 'Chargeback and fraud policy agreed with your processor'],
    ['shipping', 'Shipping rates, delivery estimates and a returns policy published'],
    ['economics', 'Unit economics proved: print + shipping + fees against your price'],
    ['support', 'A support channel — a physical product generates physical problems'],
    ['isbn', 'ISBN acquired (one per format, in your own name if you want to keep it)'],
  ],
  assisted: [
    ...COMMON,
    ['editorial', 'Human editorial pass — the tooling does not replace this'],
    ['disclosure', 'AI involvement disclosed where the platform requires it'],
    ['cover', 'Cover produced and rights to the imagery confirmed'],
    ['metadata', 'Metadata and keywords generated, then checked by hand'],
    ['platform', 'Distribution platform and its AI policy read'],
    ['pricing', 'Pricing decided'],
    ['quality', 'Quality floor agreed — what you will not ship'],
  ],
};

const STATUS = ['planned', 'sent', 'replied', 'offer', 'rejected', 'live'];

export function renderPublish(bookId) {
  const book = S.get(bookId);
  if (!book) return h('p', { class: 'empty pad' }, 'No book open.');

  const pathway = book.pathway;
  const checks = book.pubChecks ?? {};
  const errors = audit(bookId).filter((f) => f.severity === 'error');
  const manuscriptStage = runPipeline(bookId).find((s) => s.n === 17);
  const ready = manuscriptStage.state === 'done' && errors.length === 0;

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Publication'),
        h('p', { class: 'sub' },
          'Three routes out. The platform takes you to the door of each and is honest '
          + 'that it cannot walk through for you.')),
      h('div', { class: 'view-actions' },
        h('span', { class: `tally ${ready ? '' : 'warn'}` },
          ready ? 'Manuscript ready' : 'Manuscript not ready'))),

    h('div', { class: 'dash' },
      h('section', { class: `readiness ${ready ? 'ok' : ''}` },
        h('h3', {}, 'Readiness'),
        h('ul', {},
          h('li', {}, manuscriptStage.state === 'done'
            ? '✓ Manuscript complete'
            : `✗ ${manuscriptStage.detail}`),
          h('li', {}, errors.length === 0
            ? '✓ No open contradictions'
            : h('span', {}, `✗ ${errors.length} contradiction(s) — `,
              h('button', {
                class: 'link', onclick: () => S.setUi({ view: 'audit' }),
              }, 'open Continuity'))),
          h('li', {}, book.published ? '✓ Marked as published' : '◌ Not yet published')),
        h('p', { class: 'sub' },
          'You may plan a route at any time. This panel will not tell you the manuscript '
          + 'is ready when it is not.')),

      h('section', {},
        h('h3', {}, 'Route'),
        h('div', { class: 'pathways' }, Object.entries(PATHWAYS).map(([key, p]) =>
          h('button', {
            class: `pathway ${pathway === key ? 'on' : ''}`,
            onclick: () => S.patch(bookId, { pathway: pathway === key ? null : key }),
          },
            h('strong', {}, p.label),
            h('span', { class: 'sub' }, p.blurb)))),
        pathway ? null : h('p', { class: 'sub' },
          'Pick one to see what it actually requires. You can change it — the shared '
          + 'obligations carry across, and only the route-specific items reset.')),

      pathway ? checklist(bookId, pathway, checks, ready) : null,
      pathway ? tracker(bookId, pathway) : null));
}

function checklist(bookId, pathway, checks, ready) {
  const items = CHECKLISTS[pathway];
  const doneCount = items.filter(([k]) => checks[k]).length;

  return h('section', {},
    h('h3', {}, `${PATHWAYS[pathway].label} checklist`,
      h('span', { class: 'muted' }, ` · ${doneCount} of ${items.length}`)),
    h('div', { class: 'meter' }, h('span', {
      style: { width: `${Math.round((doneCount / items.length) * 100)}%` },
    })),
    h('ul', { class: 'pub-list' }, items.map(([key, label]) => h('li', {},
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: !!checks[key],
          /* Two items are computed, not claimed. Ticking "continuity clean" by
           * hand while the engine disagrees is exactly the self-deception this
           * application exists to remove. */
          disabled: key === 'continuity' || key === 'manuscript',
          onchange: (e) => S.patch(bookId, {
            pubChecks: { ...checks, [key]: e.target.checked },
          }),
        }),
        h('span', {},
          (key === 'continuity' || key === 'manuscript')
            ? h('span', { class: ready ? 'gain' : 'muted' }, `${ready ? '✓' : '○'} ${label}`)
            : label))))),
    h('div', { class: 'chip-row' },
      h('button', {
        class: 'chip',
        onclick: () => download(`${slug(S.get(bookId).title)}-submission.md`,
          toMarkdown(bookId), 'text/markdown'),
      }, 'Export manuscript (.md)'),
      h('button', {
        class: 'chip',
        onclick: () => download(`${slug(S.get(bookId).title)}.html`,
          toHtml(bookId), 'text/html'),
      }, 'Export print-ready (.html)')));
}

function tracker(bookId, pathway) {
  const rows = S.list('submission').filter((r) => r.bookId === bookId);
  const label = pathway === 'traditional'
    ? 'Agents and publishers'
    : pathway === 'direct' ? 'Printers, storefront and payment rails' : 'Platforms and listings';

  return h('section', {},
    h('h3', {}, label, h('span', { class: 'muted' }, ` · ${rows.length}`)),
    h('p', { class: 'sub' },
      pathway === 'traditional'
        ? 'Log every query. Six months on, "did I already send to them?" is a question you '
          + 'will not be able to answer from memory.'
        : pathway === 'direct'
          ? 'Log each supplier and rail: printer, storefront, processor, tax registration. '
            + 'When an order fails you need to know which of the four broke.'
          : 'Log every listing. Platforms, prices and dates diverge fast across three stores.'),
    h('div', { class: 'stack' }, rows.map((row) => h('article', { class: `card sub-row ${row.status}` },
      h('div', { class: 'card-head' },
        h('input', {
          class: 'title-input', value: row.target, placeholder: 'Who or where',
          oninput: (e) => save(row.id, { target: e.target.value }),
        }),
        select(STATUS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
          row.status, (v) => S.patch(row.id, { status: v || 'planned' }), { placeholder: 'Status' }),
        h('button', {
          class: 'btn btn-small btn-danger',
          onclick: () => { if (confirmDanger(`Remove “${row.target || 'this entry'}”?`)) S.remove(row.id); },
        }, '×')),
      h('div', { class: 'row' },
        field('Contact', h('input', {
          value: row.contact, placeholder: 'name, email, or URL',
          oninput: (e) => save(row.id, { contact: e.target.value }),
        })),
        field('Sent', h('input', {
          type: 'date', value: row.sentOn,
          onchange: (e) => S.patch(row.id, { sentOn: e.target.value }),
        }))),
      h('textarea', {
        rows: 2, value: row.notes, placeholder: 'Guidelines, response times, what you sent.',
        oninput: (e) => save(row.id, { notes: e.target.value }),
      })))),
    h('button', {
      class: 'btn btn-small',
      onclick: () => S.create('submission', {
        projectId: S.get(bookId).projectId, bookId, pathway,
      }),
    }, '+ Add entry'));
}
