/* views/vault.js — PRD §2 and §26, the Draft Vault.
 *
 * "Nothing is destroyed" is the requirement. Until now the app violated it: a
 * scene overwritten was a scene gone. A version here is an immutable JSON
 * snapshot of the whole book, and restoring one takes its own snapshot first,
 * so there is no sequence of clicks that loses work you cannot get back.
 */

import { h, field, clear, debounce, confirmDanger } from '../dom.js';
import * as S from '../state.js';
import { download, slug } from '../compile.js';
import { readManuscriptFile, detectStructure } from '../import.js';

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

    importCard(bookId),

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

/* PRD Phase 1: import the author's existing manuscript, destroying nothing.
 * Detection is heuristic, so nothing is written until the author has seen what
 * it found — a wrong split applied silently to 90,000 words is a bad afternoon. */
function importCard(bookId) {
  const report = h('div', { class: 'import-report' });
  const actions = h('div', { class: 'chip-row' });
  let pending = null;

  const picker = h('input', {
    type: 'file', accept: '.txt,.md,.markdown,.fountain,.docx', class: 'import-file',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      clear(actions);
      clear(report).append(h('p', { class: 'sub' }, `Reading ${file.name}…`));
      try {
        const text = await readManuscriptFile(file);
        pending = detectStructure(text);
        showPreview(file.name);
      } catch (err) {
        pending = null;
        clear(report).append(h('p', { class: 'empty' }, `Could not read that file. ${err.message}`));
      }
      e.target.value = '';
    },
  });

  function showPreview(filename) {
    if (!pending?.chapterCount) {
      clear(report).append(h('p', { class: 'empty' }, 'No text found in that file.'));
      return;
    }
    clear(report).append(
      h('p', {},
        h('strong', {}, filename), ' — ',
        `${pending.words.toLocaleString()} words, split into `,
        h('strong', {}, `${pending.chapterCount} chapters`), ' and ',
        h('strong', {}, `${pending.sceneCount} scenes`), '.'),
      h('p', { class: 'sub' }, `Detected using: ${pending.strategy}.`),
      h('ul', { class: 'import-preview' },
        pending.chapters.slice(0, 6).map((c) => h('li', {},
          h('span', { class: 'name' }, c.title),
          h('span', { class: 'muted small' }, ` — ${c.scenes.length} scene(s)`))),
        pending.chapters.length > 6
          ? h('li', { class: 'muted small' }, `…and ${pending.chapters.length - 6} more`)
          : null),
      h('p', { class: 'sub' },
        'Wrong? Scene breaks are read from lines like * * * or ---, and chapters from '
        + 'headings. Fix them in the source file and import again — nothing has been '
        + 'written yet.'));

    clear(actions).append(
      h('button', {
        class: 'btn btn-small btn-primary',
        onclick: () => commit(),
      }, `Add ${pending.chapterCount} chapters to this book`),
      h('button', { class: 'chip', onclick: () => { pending = null; clear(report); clear(actions); } },
        'Cancel'));
  }

  async function commit() {
    const plan = pending;
    if (!plan) return;
    clear(actions).append(h('span', { class: 'muted' }, 'Importing…'));

    /* Snapshot first, always. The import appends rather than replaces, but an
     * author who imports the wrong file still needs one click back. */
    await S.snapshotBook(bookId, {
      label: 'Before import',
      reason: `Automatic snapshot taken before importing ${plan.words.toLocaleString()} words.`,
    });

    const book = S.get(bookId);
    let order = S.chapters(bookId).length;
    for (const chapter of plan.chapters) {
      const made = await S.create('chapter', {
        projectId: book.projectId, bookId, title: chapter.title, order,
      });
      order += 1;
      for (const [i, scene] of chapter.scenes.entries()) {
        await S.create('scene', {
          projectId: book.projectId,
          bookId,
          chapterId: made.id,
          order: i,
          title: scene.title,
          prose: scene.prose,
          status: 'drafted',
        });
      }
    }
    pending = null;
    S.setUi({ view: 'chapters', selectionId: null });
  }

  return h('section', { class: 'import-card' },
    h('h3', {}, 'Import an existing manuscript'),
    h('p', { class: 'sub' },
      'Word (.docx), plain text, Markdown or Fountain. Chapters and scene breaks are '
      + 'detected, shown to you, and only written once you agree. A snapshot is taken '
      + 'first either way.'),
    picker,
    report,
    actions);
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
