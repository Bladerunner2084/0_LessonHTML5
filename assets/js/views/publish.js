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

import { h, field, select, clear, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { PATHWAYS, FRONT_MATTER, BACK_MATTER } from '../model.js';
import { audit } from '../lint.js';
import { runPipeline } from '../pipeline.js';
import { toMarkdown, toHtml, download, slug } from '../compile.js';
import {
  readiness, buildEpub, buildDocx, createPublication, publications,
  PASS, WARNING, ACTION,
} from '../publishing.js';

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

const STEPS = [
  ['validation', '01  Validation'],
  ['info', '02  Book Information'],
  ['matter', '03  Front & Back Matter'],
  ['route', '04  Route'],
  ['export', '05  Export'],
  ['candidates', '06  Publication Candidates'],
];

const saveInfo = debounce((id, fields) => S.patch(id, fields), 350);

function bookInfo(bookId) {
  return S.list('bookinfo').find((r) => r.bookId === bookId) ?? null;
}

/* PRD §40 — a production desk: workflow on the left, one workspace in the
 * middle. The step lives in UI state so a repaint mid-edit does not throw the
 * author back to the first screen. */
export function renderPublish(bookId) {
  const step = S.ui.publishStep ?? 'validation';
  const panel = h('div', { class: 'publish-panel' });

  const paint = () => {
    clear(panel).append(
      step === 'validation' ? validationStep(bookId)
        : step === 'info' ? infoStep(bookId)
          : step === 'matter' ? matterStep(bookId)
            : step === 'export' ? exportStep(bookId)
              : step === 'candidates' ? candidatesStep(bookId)
                : routeStep(bookId));
  };
  paint();

  const state = readiness(bookId);
  const tone = state.overall === 'ACTION REQUIRED' ? 'bad'
    : state.overall === 'REVIEW SUGGESTED' ? 'warn' : '';

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Publishing Center'),
        h('p', { class: 'sub' },
          'Writeline reports whether its own checks passed. It cannot tell you a book is '
          + 'ready for the world, and any tool that says otherwise is guessing on your behalf.')),
      h('div', { class: 'view-actions' },
        h('span', { class: `tally ${tone}` }, state.overall))),

    h('div', { class: 'split-body publish-split' },
      h('nav', { class: 'list publish-steps' }, STEPS.map(([id, label]) => h('button', {
        class: `list-item ${step === id ? 'current' : ''}`,
        onclick: () => S.setUi({ publishStep: id }),
      }, h('span', { class: 'name' }, label)))),
      panel));
}

/* --- 01 validation -------------------------------------------------------- */

function validationStep(bookId) {
  const state = readiness(bookId);
  const mark = { [PASS]: '✓', [WARNING]: '!', [ACTION]: '✗' };

  return h('div', { class: 'detail' },
    h('h3', {}, 'Validation'),
    h('p', { class: 'sub' },
      'Every row is computed from the manuscript. None of them is a box you tick, and the '
      + 'overall verdict is the worst row — one open contradiction is not averaged away by '
      + 'nine green ones.'),
    h('ul', { class: 'check-rows' }, state.rows.map((row) => h('li', {
      class: row.state === ACTION ? 'bad' : row.state === WARNING ? 'warn' : 'good',
    },
      h('span', { class: 'check-mark' }, mark[row.state]),
      h('span', { class: 'check-label' }, row.label),
      h('span', { class: 'check-detail muted' }, row.detail),
      row.view ? h('button', {
        class: 'link', onclick: () => S.setUi({ view: row.view }),
      }, 'open') : null))));
}

/* --- 02 book information -------------------------------------------------- */

function infoStep(bookId) {
  const info = bookInfo(bookId);
  if (!info) {
    const book = S.get(bookId);
    S.create('bookinfo', {
      projectId: book.projectId, bookId,
      title: book.title, copyrightYear: String(new Date().getFullYear()),
    });
    return h('p', { class: 'empty' }, 'Preparing…');
  }

  const text = (key, label, hint, placeholder = '') => field(label, h('input', {
    value: info[key] ?? '', placeholder,
    oninput: (e) => saveInfo(info.id, { [key]: e.target.value }),
  }), hint);

  return h('div', { class: 'detail' },
    h('h3', {}, 'Book information'),
    h('p', { class: 'sub' },
      'Everything here is optional and nothing is invented for you. An ISBN, a publisher or a '
      + 'publication date you did not enter would be a fabrication a distributor rejects.'),

    h('div', { class: 'row' },
      text('title', 'Title'),
      text('subtitle', 'Subtitle')),
    h('div', { class: 'row' },
      text('author', 'Author name'),
      text('penName', 'Pen name')),
    h('div', { class: 'row' },
      text('series', 'Series'),
      text('volume', 'Volume'),
      text('edition', 'Edition')),
    h('div', { class: 'row' },
      text('isbn', 'ISBN', 'One per format. Not needed for every route.'),
      text('publisher', 'Publisher'),
      text('imprint', 'Imprint')),
    h('div', { class: 'row' },
      field('Publication date', h('input', {
        type: 'date', value: info.publicationDate ?? '',
        onchange: (e) => S.patch(info.id, { publicationDate: e.target.value }),
      })),
      text('language', 'Language', 'BCP-47, e.g. en or en-GB'),
      text('copyrightYear', 'Copyright year'),
      text('copyrightHolder', 'Copyright holder')),

    field('Description', h('textarea', {
      rows: 4, value: info.description ?? '',
      placeholder: 'The back-cover copy. What a reader sees before they buy.',
      oninput: (e) => saveInfo(info.id, { description: e.target.value }),
    })),
    field('Keywords', h('input', {
      value: (info.keywords ?? []).join(', '), placeholder: 'comma separated',
      oninput: (e) => saveInfo(info.id, {
        keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
      }),
    })),
    field('Cover file', h('input', {
      value: info.coverName ?? '', placeholder: 'e.g. last-signal-cover.jpg',
      oninput: (e) => saveInfo(info.id, { coverName: e.target.value }),
    }), 'Recorded by name. Writeline does not claim a cover meets any printer’s spec.'));
}

/* --- 03 front and back matter --------------------------------------------- */

function matterStep(bookId) {
  const book = S.get(bookId);
  const rows = (side) => S.list('matter')
    .filter((m) => m.bookId === bookId && m.side === side)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const section = (side, presets) => {
    const list = rows(side);
    const used = new Set(list.map((m) => m.title));
    return h('section', {},
      h('h3', {}, side === 'front' ? 'Front matter' : 'Back matter'),
      h('div', { class: 'stack' }, list.length ? list.map((m) => h('article', { class: 'card' },
        h('div', { class: 'card-head' },
          h('label', { class: 'check' },
            h('input', {
              type: 'checkbox', checked: m.enabled,
              onchange: (e) => S.patch(m.id, { enabled: e.target.checked }),
            }),
            h('span', {}, m.enabled ? 'Included' : 'Excluded')),
          h('input', {
            class: 'title-input', value: m.title,
            oninput: (e) => saveInfo(m.id, { title: e.target.value }),
          }),
          h('span', { class: 'nudge' },
            h('button', { class: 'btn btn-small', onclick: () => S.move(m.id, -1) }, '↑'),
            h('button', { class: 'btn btn-small', onclick: () => S.move(m.id, 1) }, '↓')),
          h('button', {
            class: 'btn btn-small btn-danger',
            onclick: () => { if (confirmDanger(`Remove “${m.title}”?`)) S.remove(m.id); },
          }, '×')),
        h('textarea', {
          rows: 3, value: m.body, placeholder: 'The text of this section.',
          oninput: (e) => saveInfo(m.id, { body: e.target.value }),
        })))
        : h('p', { class: 'empty' }, 'Nothing yet.')),
      h('div', { class: 'chip-row' }, presets.filter((t) => !used.has(t)).map((title) =>
        h('button', {
          class: 'chip',
          onclick: () => S.create('matter', {
            projectId: book.projectId, bookId, side, title, order: list.length,
          }),
        }, `+ ${title}`))),
      h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: () => {
          const title = window.prompt('Section title')?.trim();
          if (title) {
            S.create('matter', {
              projectId: book.projectId, bookId, side, title, order: list.length,
            });
          }
        },
      }, '+ Custom section'));
  };

  return h('div', { class: 'detail' },
    h('p', { class: 'sub' },
      'Offered, never imposed. Enable what your route needs, reorder it, retitle it, or write '
      + 'your own. A title page and copyright page are always written into EPUB and DOCX.'),
    section('front', FRONT_MATTER),
    section('back', BACK_MATTER));
}

/* --- 05 export ------------------------------------------------------------ */

function exportStep(bookId) {
  const name = slug(bookInfo(bookId)?.title || S.get(bookId)?.title || 'manuscript');
  const state = readiness(bookId);
  const blocked = state.rows.find((r) => r.label === 'Export readiness').state === ACTION;
  const status = h('p', { class: 'sub' });

  const saveBlob = async (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* PRD §45: never report success for something that did not happen. */
  const attempt = (label, fn) => h('button', {
    class: 'btn btn-small',
    disabled: blocked,
    onclick: async () => {
      status.textContent = `Exporting ${label}…`;
      try {
        await fn();
        status.textContent = `${label} export complete.`;
      } catch (err) {
        status.textContent = `${label} export failed — ${err.message}`;
      }
    },
  }, label);

  return h('div', { class: 'detail' },
    h('h3', {}, 'Export'),
    h('p', { class: 'sub' },
      blocked
        ? 'Nothing is written yet, so there is nothing to export.'
        : 'Exports are built from the current manuscript. To freeze a version, create a '
          + 'publication candidate first.'),
    h('div', { class: 'chip-row' },
      attempt('EPUB', () => saveBlob(buildEpub(bookId), `${name}.epub`)),
      attempt('DOCX', () => saveBlob(buildDocx(bookId), `${name}.docx`)),
      attempt('Markdown', () => download(`${name}.md`, toMarkdown(bookId), 'text/markdown')),
      attempt('Print-ready HTML', () => download(`${name}.html`, toHtml(bookId), 'text/html')),
      attempt('Plain text', () => download(`${name}.txt`,
        toMarkdown(bookId).replace(/^#+ /gm, ''), 'text/plain'))),
    status,
    h('p', { class: 'sub' },
      'PDF is produced by printing the print-ready HTML from your browser — Writeline does not '
      + 'embed a PDF engine, and a page that lies about its own margins is worse than none.'));
}

/* --- 06 publication candidates -------------------------------------------- */

function candidatesStep(bookId) {
  const rows = publications(bookId);

  return h('div', { class: 'detail' },
    h('h3', {}, 'Publication candidates'),
    h('p', { class: 'sub' },
      'A candidate freezes the manuscript, the book information, the matter and the validation '
      + 'result as they were the moment you created it. Editing afterwards cannot reach '
      + 'backwards and change what you approved.'),
    h('button', {
      class: 'btn btn-small btn-primary',
      onclick: async () => {
        const label = window.prompt('Label for this candidate')?.trim();
        await createPublication(bookId, label || undefined);
      },
    }, '+ Create candidate'),

    h('div', { class: 'stack', style: { marginTop: '.9rem' } }, rows.length
      ? rows.map((p) => {
        const info = JSON.parse(p.info || '{}');
        const checks = JSON.parse(p.checks || '[]');
        return h('article', { class: 'card' },
          h('div', { class: 'card-head' },
            h('strong', {}, p.label),
            h('span', { class: `tally ${p.overall === 'ACTION REQUIRED' ? 'bad' : ''}` }, p.overall),
            h('button', {
              class: 'btn btn-small btn-ghost',
              onclick: () => download(`${slug(p.label)}.json`,
                JSON.stringify({ label: p.label, createdAt: p.createdAt, info, checks,
                  frozen: JSON.parse(p.frozen || '{}') }, null, 2), 'application/json'),
            }, 'Export record')),
          h('div', { class: 'card-meta' },
            h('span', {}, new Date(p.createdAt).toLocaleString()),
            h('span', {}, `${p.words.toLocaleString()} words`),
            h('span', {}, info.title ?? ''),
            h('span', {}, `${checks.filter((c) => c.state === PASS).length} of ${checks.length} checks passed`)));
      })
      : h('p', { class: 'empty' }, 'No candidates yet.')));
}

/* --- 04 route (the four publishing paths) --------------------------------- */

function routeStep(bookId) {
  const book = S.get(bookId);
  if (!book) return h('p', { class: 'empty' }, 'No book open.');

  const pathway = book.pathway;
  const checks = book.pubChecks ?? {};
  const errors = audit(bookId).filter((f) => f.severity === 'error');
  const manuscriptStage = runPipeline(bookId).find((s) => s.n === 17);
  const ready = manuscriptStage.state === 'done' && errors.length === 0;

  return h('div', { class: 'detail' },
    h('div', {},
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
