/* voice.js — the Style Engine, as measurement rather than imitation.
 *
 * PRD §13 is explicit: do not build "write like Author X". Build an original
 * author voice profile. This module is that, taken literally.
 *
 * A profile is a set of NUMBERS measured from a prose sample. The sample itself
 * is never stored — measure() returns statistics and the caller keeps only
 * those. Three things follow from that one decision:
 *
 *   Nothing copyrighted is retained. A writer can calibrate a target against a
 *   novel they own without the application holding one word of it.
 *
 *   A profile is small, portable, and diffable. It travels in the JSON backup
 *   like any other record.
 *
 *   No genre norms are invented. The application ships named profiles with no
 *   numbers in them, because fabricating "thrillers average 14.2 words per
 *   sentence" would be inventing research. The writer supplies prose that
 *   sounds like their target and the app measures THAT.
 *
 * Everything here is arithmetic. No AI, so it runs in the offline single-file
 * build, costs nothing per user, and cannot hallucinate a metric.
 */

/* Craft markers, each chosen because it is countable and because editors
 * actually talk about it. Anything requiring judgement is left out — a wrong
 * number stated confidently is worse than a missing one. */
const FILTER_WORDS = /\b(saw|watched|heard|felt|noticed|realised|realized|thought|wondered|knew|seemed|decided|remembered|observed|sensed)\b/gi;
const FIGURATIVE = /\b(?:like a|like the|as if|as though|as one who)\b/gi;
const PASSIVE = /\b(?:was|were|been|being|is|are)\s+(?:\w+ly\s+)?\w+(?:ed|en)\b/gi;
const ADVERB = /\b\w{3,}ly\b/gi;
const SENTENCE_SPLIT = /[^.!?…]+[.!?…]+["”’)]*|\S[^.!?…]*$/g;
const WORD = /[\p{L}\p{N}'’-]+/gu;

const per1000 = (n, words) => (words ? (n / words) * 1000 : 0);
const round = (n, places = 2) => Number(n.toFixed(places));

const countMatches = (text, re) => (text.match(re) ?? []).length;

/* Moving-average type-token ratio. Plain unique/total shrinks as a text grows,
 * so comparing a 500-word scene to a 90,000-word baseline with it would report
 * drift that is purely an artefact of length. */
function mattr(words, window = 400) {
  if (words.length < window) {
    return words.length ? new Set(words).size / words.length : 0;
  }
  let total = 0;
  let windows = 0;
  for (let i = 0; i + window <= words.length; i += Math.max(1, Math.floor(window / 4))) {
    total += new Set(words.slice(i, i + window)).size / window;
    windows += 1;
  }
  return windows ? total / windows : 0;
}

export const METRICS = {
  meanSentence:   { label: 'Words per sentence',   unit: '',      tolerance: 0.18 },
  sentenceSpread: { label: 'Sentence-length spread', unit: '',    tolerance: 0.25 },
  longSentences:  { label: 'Sentences over 30 words', unit: '%',  tolerance: 0.40 },
  shortSentences: { label: 'Sentences under 8 words', unit: '%',  tolerance: 0.40 },
  meanParagraph:  { label: 'Words per paragraph',  unit: '',      tolerance: 0.30 },
  dialogue:       { label: 'Words inside dialogue', unit: '%',    tolerance: 0.30 },
  variety:        { label: 'Vocabulary variety',   unit: '',      tolerance: 0.12 },
  longWords:      { label: 'Words of 7+ letters',  unit: '%',     tolerance: 0.20 },
  adverbs:        { label: 'Adverbs (-ly)',        unit: '/1k',   tolerance: 0.35 },
  filters:        { label: 'Filter words',         unit: '/1k',   tolerance: 0.35 },
  passive:        { label: 'Passive constructions', unit: '/1k',  tolerance: 0.35 },
  figurative:     { label: 'Simile markers',       unit: '/1k',   tolerance: 0.45 },
  emDash:         { label: 'Em dashes',            unit: '/1k',   tolerance: 0.50 },
  semicolon:      { label: 'Semicolons',           unit: '/1k',   tolerance: 0.60 },
  ellipsis:       { label: 'Ellipses',             unit: '/1k',   tolerance: 0.60 },
  openerVariety:  { label: 'Sentence-opener variety', unit: '',   tolerance: 0.15 },
};

export const METRIC_KEYS = Object.keys(METRICS);

/* The smallest difference worth expressing as a proportion, by unit. Below
 * these, a change is noise in a long book however large it looks as a ratio. */
const FLOORS = { '/1k': 1.5, '%': 1.5, '': 0.05 };

/* Below this a sample says more about the passage than about the voice. */
export const MIN_SAMPLE = 300;

export function measure(text) {
  const source = String(text ?? '');
  const words = source.match(WORD) ?? [];
  const total = words.length;
  if (!total) return null;

  const sentences = (source.match(SENTENCE_SPLIT) ?? [])
    .map((s) => s.trim()).filter(Boolean);
  const lengths = sentences.map((s) => (s.match(WORD) ?? []).length).filter((n) => n > 0);
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length
    ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length : 0;

  const paragraphs = source.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const paragraphWords = paragraphs.map((p) => (p.match(WORD) ?? []).length);

  const quoted = [...source.matchAll(/[“"]([^”"]*)[”"]/g)]
    .reduce((n, m) => n + ((m[1].match(WORD) ?? []).length), 0);

  const lower = words.map((w) => w.toLowerCase());
  const openers = sentences.map((s) => (s.match(WORD) ?? [])[0]?.toLowerCase()).filter(Boolean);

  return {
    sampleWords: total,
    sampleSentences: lengths.length,
    meanSentence: round(mean),
    sentenceSpread: round(Math.sqrt(variance)),
    longSentences: round((lengths.filter((n) => n > 30).length / (lengths.length || 1)) * 100),
    shortSentences: round((lengths.filter((n) => n < 8).length / (lengths.length || 1)) * 100),
    meanParagraph: round(paragraphWords.length
      ? paragraphWords.reduce((a, b) => a + b, 0) / paragraphWords.length : 0),
    dialogue: round((quoted / total) * 100),
    variety: round(mattr(lower), 3),
    longWords: round((words.filter((w) => w.length >= 7).length / total) * 100),
    adverbs: round(per1000(countMatches(source, ADVERB), total)),
    filters: round(per1000(countMatches(source, FILTER_WORDS), total)),
    passive: round(per1000(countMatches(source, PASSIVE), total)),
    figurative: round(per1000(countMatches(source, FIGURATIVE), total)),
    emDash: round(per1000(countMatches(source, /—|--/g), total)),
    semicolon: round(per1000(countMatches(source, /;/g), total)),
    ellipsis: round(per1000(countMatches(source, /…|\.\.\./g), total)),
    openerVariety: round(openers.length ? new Set(openers).size / openers.length : 0, 3),
  };
}

/* Compare a measurement against a profile. Returns one row per metric, ordered
 * by how far off it is, so the writer reads the biggest divergence first rather
 * than scanning sixteen numbers. */
export function compare(current, profile) {
  if (!current || !profile) return [];
  return METRIC_KEYS.map((key) => {
    const target = profile[key];
    const value = current[key];
    if (typeof target !== 'number' || typeof value !== 'number') return null;

    /* Metrics that are legitimately near zero need an absolute floor, or a
     * baseline of 0.2 semicolons makes 0.6 look like a 200% collapse in voice —
     * and a metric that is zero on BOTH sides divides zero by zero and reports
     * NaN%, which is how a diagnostic loses a reader's trust in one line. */
    const denominator = Math.max(Math.abs(target), FLOORS[METRICS[key].unit] ?? 0.05,
      Math.abs(target) * 0.05);
    const drift = (value - target) / denominator;

    return {
      key,
      label: METRICS[key].label,
      unit: METRICS[key].unit,
      value,
      target,
      drift,
      off: Math.abs(drift) > METRICS[key].tolerance,
    };
  }).filter(Boolean).sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

/* Plain English for one row. "0.34" tells a writer nothing; "a third longer
 * than your baseline" tells them what to do in the next paragraph. */
export function describe(row) {
  const pct = Math.round(Math.abs(row.drift) * 100);
  const direction = row.drift > 0 ? 'higher' : 'lower';
  const more = row.drift > 0 ? 'longer' : 'shorter';

  if (row.key === 'meanSentence' || row.key === 'meanParagraph') {
    return `${row.label} runs ${pct}% ${more} than the target `
      + `(${row.value} against ${row.target}).`;
  }
  if (row.key === 'sentenceSpread') {
    return row.drift > 0
      ? `Sentence lengths vary ${pct}% more than the target — a more restless rhythm.`
      : `Sentence lengths vary ${pct}% less than the target — flatter, more uniform.`;
  }
  if (row.key === 'variety' || row.key === 'openerVariety') {
    return `${row.label} is ${pct}% ${direction} than the target `
      + `(${row.value} against ${row.target}).`;
  }
  return `${row.label}: ${row.value}${row.unit} against a target of `
    + `${row.target}${row.unit} — ${pct}% ${direction}.`;
}

/* Blend measured profiles into one target. Weights are relative and normalised,
 * so a writer can type 40 / 20 / 15 / 15 / 10 without the numbers having to add
 * to anything in particular.
 *
 * A blended metric is a weighted mean. That is the honest meaning of "30% Orwell":
 * not a share of the prose, but a pull on each measurable quantity toward the
 * sample the writer chose. Profiles with no measurements contribute nothing
 * rather than dragging the target toward zero. */
export function blend(entries) {
  const usable = entries.filter((e) => e.metrics && e.weight > 0);
  const total = usable.reduce((n, e) => n + e.weight, 0);
  if (!total) return null;

  const out = {};
  for (const key of METRIC_KEYS) {
    let sum = 0;
    let seen = 0;
    for (const entry of usable) {
      const value = entry.metrics[key];
      if (typeof value !== 'number') continue;
      sum += value * entry.weight;
      seen += entry.weight;
    }
    if (seen) out[key] = Number((sum / seen).toFixed(3));
  }
  out.sampleWords = usable.reduce((n, e) => n + (e.metrics.sampleWords ?? 0), 0);
  return out;
}

/* Normalised percentages for display, so the mixer can always show shares that
 * add to 100 without forcing the writer to make them add to 100. */
export function shares(entries) {
  const total = entries.reduce((n, e) => n + Math.max(0, e.weight), 0);
  return entries.map((e) => ({
    ...e,
    share: total ? Math.round((Math.max(0, e.weight) / total) * 100) : 0,
  }));
}

/* PRD #2 §24 — the predefined vocabulary. Characteristics, genres and
 * movements only.
 *
 * §23 is a hard policy: no living author's name may appear in any predefined
 * menu, dropdown, preset, example or autocomplete. None appears below, and a
 * test asserts it by shape rather than by a banned list — a list of names would
 * itself be the thing the policy forbids, and would go out of date.
 *
 * An author may still type a name into a free-form request. The system's job is
 * then to translate it into these characteristics rather than to reproduce
 * anybody's prose. */
export const LITERARY_CHARACTERISTICS = [
  'Clear', 'Direct', 'Lyrical', 'Sparse', 'Dense', 'Analytical', 'Observational',
  'Psychological', 'Introspective', 'Documentary', 'Philosophical', 'Satirical',
  'Emotionally restrained', 'Emotionally intense', 'Atmospheric', 'Descriptive',
  'Minimalist',
];

export const GENRES = [
  'Literary fiction', 'Science fiction', 'Fantasy', 'Mystery', 'Thriller',
  'Historical fiction', 'Romance', 'Horror', 'Crime', 'Noir', 'Speculative fiction',
];

export const MOVEMENTS = [
  'Classical', 'Elizabethan', 'Victorian', 'Romantic', 'Gothic', 'Modernist',
  'Naturalist', 'Hardboiled', 'Stream of consciousness', 'Epistolary',
  'Magical realism',
];

export const STYLE_VOCABULARY = [
  ...LITERARY_CHARACTERISTICS, ...GENRES, ...MOVEMENTS,
];

/* The named profiles ship EMPTY. Every one of these carries a craft note and no
 * numbers, because publishing invented genre averages would be fabricating
 * research and a writer would have no way to tell. The numbers arrive when the
 * writer pastes prose that sounds like what they are aiming for. */
export const STARTER_PROFILES = [
  {
    name: 'My Default Author Voice',
    note: 'Your own baseline. Derive it from prose you are happy with — ideally '
      + '2,000+ words of your own finished work, not a first draft.',
  },
  {
    name: 'Political Thriller',
    note: 'Usually shorter sentences, a high dialogue ratio and concrete nouns. '
      + 'Calibrate against thrillers you admire rather than trusting that description.',
  },
  {
    name: 'Near-Future Sci-Fi',
    note: 'Exposition load is the problem to watch — long paragraphs and abstract '
      + 'vocabulary creep in with the worldbuilding.',
  },
  {
    name: 'Psychological Horror',
    note: 'Watch filter words especially. "She felt the cold" holds the reader at '
      + 'arm’s length exactly where the genre needs them close.',
  },
  {
    name: 'Historical Fiction',
    note: 'Register is the whole game: longer words and lower dialogue ratios read as '
      + 'period, and tip into pastiche a step later.',
  },
  {
    name: 'Custom Profile',
    note: 'Anything else you are aiming at. Paste the prose and let it measure.',
  },
];
