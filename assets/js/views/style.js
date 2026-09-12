/* views/style.js — Style Studio.
 *
 * Profiles live in a library that belongs to the writer, not to a project. The
 * same voice can be aimed at a standalone novel, at book three of a series, and
 * at a project that does not exist yet.
 *
 * On the [ Author ] and [ Book ] buttons in the sketch: they are not here, and
 * the omission is deliberate. Typing "George Orwell" would make the application
 * assert a characterisation of a real writer it has never measured — invented
 * research presented as fact, with a rights problem attached. Paste a passage
 * instead. The app measures it, keeps the NUMBERS, and discards the text. The
 * writer can calibrate against any book they legally hold and the application
 * never stores a word of it.
 *
 * There is no [ GENERATE REWRITE ] button. Rewriting prose needs the AI layer
 * this build does not have, and a button that produced something else would be
 * a lie. What the mixer produces instead is a measurable TARGET, and a report
 * of how far the actual draft sits from it — which is the half that tells a
 * writer what to do in the next paragraph.
 */

import { h, field, select, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import {
  measure, compare, describe, blend, shares, METRICS, METRIC_KEYS,
  MIN_SAMPLE, STARTER_PROFILES,
} from '../voice.js';

const save = debounce((id, fields) => S.patch(id, fields), 350);

/* Resolve a profile to numbers: measured profiles carry them, mixed profiles
 * compute them from whatever they reference. Depth-limited, because a mix that
 * referenced itself would otherwise recurse until the tab died. */
export function metricsOf(profile, depth = 0) {
  if (!profile) return null;
  if (profile.metrics) return profile.metrics;
  if (depth > 3 || !profile.mix?.length) return null;
  return blend(profile.mix.map((row) => ({
    weight: row.weight,
    metrics: metricsOf(S.get(row.profileId), depth + 1),
  })));
}

export function renderStyle(bookId) {
  const profiles = S.styleProfiles();
  const selected = S.get(S.ui.selectionId);
  const active = selected?.type === 'styleprofile' ? selected : profiles[0] ?? null;
  const book = S.get(bookId);

  if (!profiles.length) {
    return h('div', { class: 'view' },
      header(bookId, null),
      h('div', { class: 'welcome' },
        h('h2', {}, 'No style profiles yet'),
        h('p', {},
          'A profile is a set of measurements taken from prose — sentence rhythm, dialogue '
          + 'ratio, adverb and filter-word rates, punctuation fingerprint. Sixteen numbers '
          + 'that together describe how a page moves.'),
        h('p', {},
          'You never type an author’s name. You paste prose that sounds like what you are '
          + 'aiming at, and the app measures it. The sample is discarded — only the numbers '
          + 'are kept, so nothing copyrighted is ever stored.'),
        h('button', { class: 'btn btn-primary', onclick: createStarters }, 'Create my library')));
  }

  return h('div', { class: 'view split' },
    header(bookId, active),
    h('div', { class: 'split-body' },
      h('ul', { class: 'list' },
        profiles.map((p) => {
          const m = metricsOf(p);
          return h('li', {},
            h('button', {
              class: `list-item ${active?.id === p.id ? 'current' : ''}`,
              onclick: () => S.setUi({ selectionId: p.id }),
            },
              h('span', { class: 'kind-icon' }, p.mix?.length ? '⩶' : '◈'),
              h('span', { class: 'name' }, p.name),
              book?.styleProfileId === p.id ? h('span', { class: 'badge' }, 'in use') : null,
              m ? null : h('span', { class: 'badge' }, 'empty')));
        }),
        h('li', {}, h('button', {
          class: 'btn btn-small btn-ghost',
          onclick: async () => {
            const p = await S.create('styleprofile', { name: 'New profile' });
            S.setUi({ selectionId: p.id });
          },
        }, '+ Profile'))),

      active ? editor(active, bookId) : h('p', { class: 'empty pad' }, 'Select a profile.')));
}

function header(bookId, active) {
  const book = S.get(bookId);
  return h('header', { class: 'view-head' },
    h('div', {},
      h('h2', {}, 'Style Studio'),
      h('p', { class: 'sub' },
        'Profiles belong to you, not to a project — aim the same voice at any book, '
        + 'including one you have not started.')),
    h('div', { class: 'view-actions' },
      book ? field('This book aims at', select(
        S.styleProfiles().map((p) => ({ value: p.id, label: p.name })),
        book.styleProfileId,
        (v) => S.patch(bookId, { styleProfileId: v }),
        { placeholder: 'No target' },
      )) : null,
      active ? h('button', {
        class: 'btn btn-small btn-ghost',
        onclick: async () => {
          const copy = await S.create('styleprofile', {
            name: `${active.name} (copy)`,
            note: active.note,
            metrics: active.metrics,
            mix: [...(active.mix ?? [])],
            sampleWords: active.sampleWords,
          });
          S.setUi({ selectionId: copy.id });
        },
      }, 'Duplicate') : null));
}

function editor(profile, bookId) {
  const metrics = metricsOf(profile);
  const isMix = (profile.mix?.length ?? 0) > 0;

  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      h('input', {
        class: 'title-input', value: profile.name,
        oninput: (e) => save(profile.id, { name: e.target.value || 'Untitled profile' }),
      }),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => { if (confirmDanger(`Delete “${profile.name}”?`)) S.remove(profile.id); },
      }, 'Delete')),

    field('Note to yourself', h('textarea', {
      rows: 2, value: profile.note, placeholder: 'What this voice is for.',
      oninput: (e) => save(profile.id, { note: e.target.value }),
    })),

    isMix ? null : sampleBox(profile),
    mixer(profile, bookId),
    metrics ? metricTable(profile, metrics) : h('p', { class: 'empty' },
      'No measurements yet. Paste a sample above, or mix other profiles below.'),
    metrics ? driftReport(bookId, metrics) : null);
}

/* The sample box keeps nothing. Measure, store numbers, drop the prose. */
function sampleBox(profile) {
  const box = h('textarea', {
    class: 'sample-area', rows: 6,
    placeholder: 'Paste 300+ words of prose that sounds like what you are aiming at. '
      + 'Your own finished work, or a passage from a book you hold.',
  });
  const status = h('p', { class: 'sub' },
    profile.metrics
      ? `Measured from ${profile.sampleWords.toLocaleString()} words`
        + `${profile.measuredAt ? ` on ${profile.measuredAt.slice(0, 10)}` : ''}. `
        + 'The sample itself was not kept.'
      : 'Nothing measured yet.');

  return h('div', { class: 'sample-box' },
    h('h3', {}, 'Measure from a sample'),
    h('p', { class: 'sub' },
      'The text is measured and then discarded — only the sixteen numbers are stored. '
      + 'Nothing copyrighted is retained, and the profile stays small enough to travel '
      + 'in your backup file.'),
    box,
    h('div', { class: 'chip-row' },
      h('button', {
        class: 'btn btn-small btn-primary',
        onclick: async () => {
          const result = measure(box.value);
          if (!result || result.sampleWords < MIN_SAMPLE) {
            status.textContent = `Needs at least ${MIN_SAMPLE} words — below that the numbers `
              + 'describe the passage rather than the voice.';
            return;
          }
          await S.patch(profile.id, {
            metrics: result,
            sampleWords: result.sampleWords,
            measuredAt: new Date().toISOString(),
          });
          box.value = '';
          status.textContent = `Measured from ${result.sampleWords.toLocaleString()} words. `
            + 'The sample has been discarded.';
        },
      }, 'Measure and discard'),
      profile.metrics ? h('button', {
        class: 'chip',
        onclick: () => S.patch(profile.id, { metrics: null, sampleWords: 0, measuredAt: '' }),
      }, 'Clear measurements') : null),
    status);
}

/* The Style Mixer. Weights are relative; the app normalises them, so the writer
 * can drag sliders without arithmetic. */
function mixer(profile, bookId) {
  const rows = profile.mix ?? [];
  const others = S.styleProfiles().filter((p) => p.id !== profile.id);
  const withShares = shares(rows);

  const update = (next) => S.patch(profile.id, { mix: next });

  return h('div', { class: 'mixer' },
    h('h3', {}, 'Style mixer'),
    h('p', { class: 'sub' },
      'Pull the target toward other profiles. A weight is not a share of the prose — it is '
      + 'how hard each measured voice pulls on every number.'),

    rows.length ? h('div', { class: 'mix-rows' }, withShares.map((row, i) => h('div', {
      class: 'mix-row',
    },
      select(others.map((p) => ({ value: p.id, label: p.name })), row.profileId,
        (profileId) => {
          const next = [...rows];
          next[i] = { ...row, profileId };
          update(next);
        }, { placeholder: 'Which voice' }),
      h('input', {
        type: 'range', min: 0, max: 100, step: 5, value: row.weight,
        oninput: (e) => {
          const next = [...rows];
          next[i] = { ...row, weight: Number(e.target.value) };
          update(next);
        },
      }),
      h('span', { class: 'mix-share' }, `${row.share}%`),
      metricsOf(S.get(row.profileId)) ? null : h('span', { class: 'badge' }, 'no data'),
      h('button', {
        class: 'kv-kill',
        onclick: () => update(rows.filter((_, j) => j !== i)),
      }, '×')))) : h('p', { class: 'empty' }, 'Nothing mixed in.'),

    h('button', {
      class: 'btn btn-small btn-ghost',
      onclick: () => update([...rows, { profileId: others[0]?.id ?? null, weight: 25 }]),
    }, '+ Add influence'));
}

function metricTable(profile, metrics) {
  return h('div', { class: 'metric-table' },
    h('h3', {}, 'The target'),
    h('div', { class: 'metric-grid' }, METRIC_KEYS.map((key) => {
      const value = metrics[key];
      if (typeof value !== 'number') return null;
      return h('div', { class: 'metric' },
        h('span', { class: 'metric-value' }, `${value}${METRICS[key].unit}`),
        h('span', { class: 'metric-label' }, METRICS[key].label));
    })));
}

/* The half that tells a writer what to do next: not "here is a voice", but
 * "here is where this draft is not it". */
function driftReport(bookId, target) {
  const scenes = S.bookScenes(bookId);
  const prose = scenes.map((s) => s.prose ?? '').join('\n\n').trim();
  const current = measure(prose);

  if (!current || current.sampleWords < MIN_SAMPLE) {
    return h('div', { class: 'drift' },
      h('h3', {}, 'This book against the target'),
      h('p', { class: 'sub' },
        `Only ${current?.sampleWords ?? 0} words written so far. Comparison needs at least `
        + `${MIN_SAMPLE} — below that it would measure the passage, not the voice.`));
  }

  const rows = compare(current, target);
  const off = rows.filter((r) => r.off);

  return h('div', { class: 'drift' },
    h('h3', {}, 'This book against the target',
      h('span', { class: 'muted' }, ` · ${current.sampleWords.toLocaleString()} words`)),
    off.length
      ? h('ul', { class: 'drift-list' }, off.map((row) => h('li', {
        class: Math.abs(row.drift) > METRICS[row.key].tolerance * 2 ? 'far' : '',
      }, describe(row))))
      : h('p', { class: 'sub' },
        'Every measure is inside tolerance of the target. That says the mechanics match — '
        + 'it does not say the prose is good, and no number can.'),
    h('details', { class: 'fold' },
      h('summary', {}, 'All sixteen measures'),
      h('ul', { class: 'drift-list all' }, rows.map((row) => h('li', {
        class: row.off ? 'off' : '',
      }, `${row.label}: ${row.value}${row.unit} vs ${row.target}${row.unit}`)))));
}

async function createStarters() {
  let first = null;
  for (const starter of STARTER_PROFILES) {
    const made = await S.create('styleprofile', starter);
    first ??= made;
  }
  S.setUi({ selectionId: first?.id ?? null });
}
