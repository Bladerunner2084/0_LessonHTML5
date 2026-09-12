/* views/vault.js — PRD §2 and §26, the Draft Vault.
 *
 * "Nothing is destroyed" is the requirement. Until now the app violated it: a
 * scene overwritten was a scene gone. A version here is an immutable JSON
 * snapshot of the whole book, and restoring one takes its own snapshot first,
 * so there is no sequence of clicks that loses work you cannot get back.
 */

import { h, field, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { download, slug } from '../compile.js';

const save = debounce((id, fields) => S.patch(id, fields), 350);

export function renderVault(bookId) {
  const versions = S.versions(bookId);
  const current = S.bookWords(bookId);

  return h('div', { class: 'view' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h2', {}, 'Draft Vault'),
        h('p', { class: 'sub' },
          'Every preserved state of this book. Snapshots are immutable; restoring one '
          + 'snapshots the present first, so nothing you have written can be reached '
          + 'by a single wrong click.')),
      h('div', { class: 'view-actions' },
        h('span', { class: 'muted' }, `${current.toLocaleString()} words now`),
        h('button', { class: 'btn btn-small btn-primary', onclick: () => snapshot(bookId) },
          '+ Preserve this state'))),

    h('div', { class: 'vault' }, versions.length
      ? versions.map((v, i) => versionCard(v, versions[i + 1], current, bookId))
      : h('p', { class: 'empty pad' },
        'Nothing preserved yet. Take a snapshot before your first rewrite pass — '
        + 'that is the one you will want back.')));
}

function versionCard(version, older, currentWords, bookId) {
  const delta = older ? version.words - older.words : null;
  const date = new Date(version.createdAt);

  return h('article', { class: 'card version-card' },
    h('div', { class: 'card-head' },
      h('input', {
        class: 'title-input', value: version.label,
        oninput: (e) => save(version.id, { label: e.target.value || 'Untitled version' }),
      }),
      version.aiInvolved ? h('span', { class: 'badge' }, 'AI involved') : null,
      h('button', {
        class: 'btn btn-small', title: 'Export this version as JSON',
        onclick: () => download(`${slug(version.label)}.json`,
          JSON.stringify({ format: 'novel-platform/v1', records: JSON.parse(version.snapshot) },
            null, 2), 'application/json'),
      }, 'Export'),
      h('button', {
        class: 'btn btn-small btn-danger',
        onclick: () => {
          if (confirmDanger(`Delete the snapshot “${version.label}”?`)) S.remove(version.id);
        },
      }, '×')),

    h('div', { class: 'card-meta' },
      h('span', {}, date.toLocaleString()),
      h('span', {}, `${version.words.toLocaleString()} words`),
      delta != null ? h('span', { class: delta >= 0 ? 'gain' : 'loss' },
        `${delta >= 0 ? '+' : ''}${delta.toLocaleString()} vs previous`) : null,
      h('span', {}, `${JSON.parse(version.snapshot).length} records`)),

    field('Reason for this version', h('input', {
      value: version.reason, placeholder: 'Why did you preserve this?',
      oninput: (e) => save(version.id, { reason: e.target.value }),
    })),

    h('button', {
      class: 'btn btn-small',
      onclick: async () => {
        const diff = currentWords - version.words;
        if (!confirmDanger(
          `Restore “${version.label}”?\n\n`
          + `The current book (${currentWords.toLocaleString()} words) will be replaced by `
          + `this snapshot (${version.words.toLocaleString()} words, `
          + `${diff >= 0 ? 'losing' : 'gaining'} ${Math.abs(diff).toLocaleString()}).\n\n`
          + 'A snapshot of the present is taken first, so this is reversible.')) return;
        const n = await S.restoreVersion(version.id);
        S.setUi({ view: 'dashboard', selectionId: null });
        window.alert(`Restored ${n} records from “${version.label}”.`);
      },
    }, 'Restore this version'));
}

async function snapshot(bookId) {
  const label = window.prompt('Version label', suggestLabel(bookId))?.trim();
  if (!label) return;
  const reason = window.prompt('Why are you preserving this? (optional)')?.trim() ?? '';
  await S.snapshotBook(bookId, { label, reason });
}

/* Suggest the next name in the sequence the PRD lays out, rather than making
 * the author invent a naming scheme at the moment they are trying to save. */
function suggestLabel(bookId) {
  const versions = S.versions(bookId);
  if (!versions.length) return 'Draft 0';
  const last = versions[0].label;
  const m = last.match(/^(.*?)(\d+)(?:\.(\d+))?$/);
  if (!m) return `${last} — revised`;
  const [, stem, major, minor] = m;
  return minor
    ? `${stem}${major}.${Number(minor) + 1}`
    : `${stem}${major}.1`;
}
