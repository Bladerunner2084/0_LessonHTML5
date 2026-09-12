/* script.js — prose to screenplay, and screenplay to page.
 *
 * Format is Fountain: plain text, an open standard, and it imports directly
 * into Final Draft. That matters more than any internal representation would —
 * a screenplay that cannot leave the tool it was written in is not a screenplay,
 * it is a hostage.
 *
 * What the converter does and does not claim:
 *
 *   It DOES lay out the skeleton — scene headings from the Scene Map's location
 *   and time-of-day, dialogue split out from attributed quotes, action blocks
 *   from the remaining prose, and the cast list per scene.
 *
 *   It does NOT rewrite prose into screen action. Turning "she remembered the
 *   fire" into something a camera can see is a craft judgement, and a machine
 *   that silently attempts it produces confident nonsense. Every place the
 *   converter is unsure emits a Fountain note — [[like this]] — that the writer
 *   can search for. A visible gap beats an invisible guess.
 *
 * The screenplay is a separate record. Converting never touches the manuscript.
 */

import * as S from './state.js';
import { wordCount } from './model.js';

/* Words that put a location outside. Crude, and deliberately so — the author
 * corrects a heading in two seconds, and a wrong guess in a heading is obvious,
 * unlike a wrong guess inside an action line. */
const EXTERIOR = /\b(street|road|alley|yard|garden|forest|woods|field|beach|roof|park|outside|exterior|bridge|station platform|courtyard|desert|mountain|river|sky)\b/i;

const NIGHT_WORD = /\b(night|midnight|dusk|evening|dark|nocturne)\b/i;
const MORNING_WORD = /\b(dawn|sunrise|morning|daybreak)\b/i;

/* Read an actual clock rather than pattern-matching digits. A regex over times
 * gets 23:40 wrong, which is exactly the hour a thriller happens at. */
function clockHour(text) {
  const m = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(am|pm)?\b/i.exec(text ?? '');
  if (!m) return null;
  let hour = Number(m[1]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return hour;
}

/* A said-bookend: the attribution around a quote, which the screen does not
 * need because the character name is already above the line. */
const ATTRIBUTION = /(?:,|\.)?\s*(?:said|asked|replied|murmured|shouted|whispered|added|answered|told|breathed|snapped)\b[^.!?]*[.!?]?/gi;

const TIME_OF_DAY = (scene, beat) => {
  const hay = `${beat?.storyTime ?? ''} ${scene.title} ${scene.summary}`;
  const hour = clockHour(hay);
  if (hour != null) {
    if (hour >= 19 || hour < 5) return 'NIGHT';
    if (hour < 8) return 'DAWN';
    return 'DAY';
  }
  if (MORNING_WORD.test(hay)) return 'DAWN';
  if (NIGHT_WORD.test(hay)) return 'NIGHT';
  return 'DAY';
};

const headingFor = (scene, beat) => {
  const place = scene.locationId ? S.entityName(scene.locationId) : null;
  const prefix = place && EXTERIOR.test(place) ? 'EXT.' : 'INT.';
  const where = (place ?? 'LOCATION UNSET').toUpperCase();
  return `${prefix} ${where} - ${TIME_OF_DAY(scene, beat)}`;
};

/* Split a prose paragraph into screenplay blocks. Conservative by design: a
 * paragraph only becomes dialogue when it carries a quote AND names exactly one
 * character the bible knows about. Everything else stays action, flagged. */
function convertParagraph(text, cast) {
  const quotes = [...text.matchAll(/[“"]([^”"]+)[”"]/g)].map((m) => m[1].trim()).filter(Boolean);
  if (!quotes.length) return [{ type: 'action', text: text.trim() }];

  const named = cast.filter((c) =>
    new RegExp(`\\b${c.name.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
      .test(text));

  /* Prose outside the quotes: stage business that still has to happen. */
  const residue = text
    .replace(/[“"][^”"]+[”"]/g, '')
    .replace(ATTRIBUTION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,.;:\s]+|[,;:\s]+$/g, '');

  if (named.length !== 1) {
    return [{
      type: 'action',
      text: text.trim(),
      note: named.length === 0
        ? 'Dialogue here has no character the bible recognises — assign a speaker.'
        : `Several characters in one paragraph (${named.map((c) => c.name).join(', ')}) — `
          + 'split the speakers by hand.',
    }];
  }

  const blocks = [];
  if (residue.length > 3) blocks.push({ type: 'action', text: residue });
  blocks.push({
    type: 'dialogue',
    character: named[0].name.toUpperCase(),
    /* The comma that ran into "said Mara" has nothing to lead to once the
     * attribution is gone, so it becomes the full stop it always meant. */
    text: quotes.join(' ').replace(/,$/, '.'),
  });
  return blocks;
}

/* Prose that describes interior state cannot be filmed. Flagging it is the most
 * useful thing the converter does, and the one thing it can do without guessing. */
const UNFILMABLE = /\b(remembered|realised|realized|thought|wondered|knew|felt|understood|hoped|decided|recalled|considered|believed)\b/i;

export function proseToFountain(bookId) {
  const book = S.get(bookId);
  const scenes = S.bookScenes(bookId);
  const cast = S.entities(bookId, 'character');
  const beatsByScene = new Map();
  for (const beat of S.beats(bookId)) {
    if (beat.sceneId && !beatsByScene.has(beat.sceneId)) beatsByScene.set(beat.sceneId, beat);
  }

  const out = [
    `Title: ${book?.title ?? 'Untitled'}`,
    'Credit: Written by',
    /* Left blank on purpose. The platform does not know who wrote this, and
     * guessing the project title into a byline is how a draft goes out with the
     * wrong name on the cover page. */
    'Author:',
    `Draft date: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '====',
    '',
  ];

  for (const scene of scenes) {
    out.push(headingFor(scene, beatsByScene.get(scene.id)), '');

    if (!scene.locationId) {
      out.push('[[Location unset in the Scene Map — the heading above is a placeholder.]]', '');
    }

    const prose = (scene.prose ?? '').trim();
    if (!prose) {
      out.push(`[[Unwritten scene: ${scene.title}${scene.summary ? ` — ${scene.summary}` : ''}]]`, '');
      continue;
    }

    for (const para of prose.split(/\n{2,}/)) {
      const text = para.trim();
      if (!text) continue;
      for (const block of convertParagraph(text, cast)) {
        if (block.type === 'dialogue') {
          out.push(block.character, block.text, '');
        } else {
          out.push(block.text, '');
          if (block.note) out.push(`[[${block.note}]]`, '');
          if (UNFILMABLE.test(block.text)) {
            out.push('[[Interior state — a camera cannot see this. Externalise it.]]', '');
          }
        }
      }
    }
  }

  out.push('[[End of converted draft. Every [[note]] marks a decision the converter '
    + 'refused to make for you.]]');
  return out.join('\n');
}

/* --- reading Fountain back ---------------------------------------------- */

const SCENE_HEADING = /^(?:INT\.?\/EXT\.?|INT\.?|EXT\.?|EST\.?|I\/E)[. ]/i;
const TRANSITION = /^[A-Z0-9 ]+TO:$/;
const TITLE_KEY = /^(Title|Credit|Author|Authors|Source|Draft date|Contact|Copyright):/i;

export function parseFountain(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let inTitlePage = true;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();

    if (inTitlePage) {
      if (TITLE_KEY.test(line)) { blocks.push({ type: 'title', text: line }); continue; }
      if (line === '====' || line === '===') { inTitlePage = false; continue; }
      if (!line) continue;
      inTitlePage = false;
    }

    if (!line) continue;
    if (/^\[\[.*\]\]$/.test(line)) {
      blocks.push({ type: 'note', text: line.slice(2, -2).trim() });
      continue;
    }
    if (SCENE_HEADING.test(line) || line.startsWith('.')) {
      blocks.push({ type: 'heading', text: line.replace(/^\./, '').toUpperCase() });
      continue;
    }
    if (TRANSITION.test(line) || line.startsWith('>')) {
      blocks.push({ type: 'transition', text: line.replace(/^>/, '').trim().toUpperCase() });
      continue;
    }
    /* A character cue is an uppercase line with something under it. */
    const next = (lines[i + 1] ?? '').trim();
    const isCue = line === line.toUpperCase() && /[A-Z]/.test(line)
      && !/[.!?]$/.test(line) && next && line.length < 60;
    if (isCue) {
      blocks.push({ type: 'character', text: line });
      continue;
    }
    if (/^\(.*\)$/.test(line)) { blocks.push({ type: 'parenthetical', text: line }); continue; }

    const prev = blocks[blocks.length - 1];
    blocks.push({
      type: prev && (prev.type === 'character' || prev.type === 'parenthetical'
        || prev.type === 'dialogue') ? 'dialogue' : 'action',
      text: line,
    });
  }
  return blocks;
}

/* --- exports ------------------------------------------------------------- */

const esc = (t) => String(t).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FDX_TYPE = {
  heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  dialogue: 'Dialogue',
  parenthetical: 'Parenthetical',
  transition: 'Transition',
};

/* Final Draft's own format, so the script opens in the tool the author already
 * uses rather than arriving as something they have to convert by hand. */
export function toFinalDraft(fountain, title = 'Screenplay') {
  const blocks = parseFountain(fountain).filter((b) => b.type !== 'title');
  const paragraphs = blocks.map((b) => {
    if (b.type === 'note') {
      return `    <Paragraph Type="Action">\n      <Text></Text>\n`
        + `      <ScriptNote><Paragraph><Text>${esc(b.text)}</Text></Paragraph></ScriptNote>\n`
        + '    </Paragraph>';
    }
    return `    <Paragraph Type="${FDX_TYPE[b.type] ?? 'Action'}">\n`
      + `      <Text>${esc(b.text)}</Text>\n    </Paragraph>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paragraphs}
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Action"><Text>${esc(title)}</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`;
}

/* Page count the industry way: roughly one minute, one page. Useful the moment
 * a novelist discovers their 90,000-word book is a six-hour film. */
export function estimatePages(fountain) {
  const blocks = parseFountain(fountain).filter((b) => b.type !== 'title' && b.type !== 'note');
  const lines = blocks.reduce((n, b) => {
    const width = b.type === 'dialogue' ? 35 : b.type === 'character' ? 30 : 58;
    return n + Math.max(1, Math.ceil(b.text.length / width)) + 1;
  }, 0);
  return Math.max(1, Math.round(lines / 55));
}

export const noteCount = (fountain) => parseFountain(fountain)
  .filter((b) => b.type === 'note').length;

export const scriptWords = (fountain) => wordCount(
  parseFountain(fountain).filter((b) => b.type !== 'note' && b.type !== 'title')
    .map((b) => b.text).join(' '));
