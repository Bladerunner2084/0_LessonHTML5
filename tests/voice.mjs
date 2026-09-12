/* tests/voice.mjs — the Style Engine.
 *
 * The property that matters most is negative: a profile must contain numbers and
 * nothing else. If a sample's text could survive into a stored profile, the
 * application would be retaining prose the writer may not own.
 *
 *   node tests/voice.mjs
 */

import assert from 'node:assert/strict';
import {
  measure, compare, describe, blend, shares,
  METRIC_KEYS, METRICS, MIN_SAMPLE, STARTER_PROFILES,
} from '../assets/js/voice.js';

let passed = 0;
const results = [];
const test = (name, fn) => {
  try { fn(); passed += 1; results.push(`  ok   ${name}`); }
  catch (err) { results.push(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
};

const LONG = 'The committee had considered the question at length, and had arrived, '
  + 'after some difficulty, at a conclusion that satisfied nobody present. ';
const SHORT = 'Rain fell. He waited. Nothing came. The door stayed shut. ';

test('an empty sample measures nothing rather than zeroes', () => {
  assert.equal(measure(''), null);
  assert.equal(measure('   \n\n  '), null);
  assert.equal(measure(null), null);
});

test('a profile holds numbers and nothing else', () => {
  const m = measure(`${LONG}${SHORT}`);
  for (const [key, value] of Object.entries(m)) {
    assert.equal(typeof value, 'number', `${key} is ${typeof value}, not a number`);
  }
  /* The clinching check: no stored value can contain the sample's words. */
  assert.ok(!JSON.stringify(m).includes('committee'),
    'sample text leaked into the measurement');
});

test('sentence length is measured, and long prose measures longer', () => {
  const longer = measure(LONG.repeat(6));
  const shorter = measure(SHORT.repeat(20));
  assert.ok(longer.meanSentence > 15, `got ${longer.meanSentence}`);
  assert.ok(shorter.meanSentence < 5, `got ${shorter.meanSentence}`);
  assert.ok(shorter.shortSentences > 90);
  assert.equal(shorter.longSentences, 0);
});

test('dialogue is measured as a share of words inside quotes', () => {
  const none = measure(SHORT.repeat(10));
  const lots = measure('"We should go," she said. "Now, before it closes." '.repeat(10));
  assert.equal(none.dialogue, 0);
  assert.ok(lots.dialogue > 50, `expected a dialogue-heavy reading, got ${lots.dialogue}`);
});

test('craft markers are counted per thousand words', () => {
  const m = measure(('She quickly realised the door was slowly closing. '
    + 'He felt that it was sudden. ').repeat(30));
  assert.ok(m.adverbs > 20, `adverbs ${m.adverbs}`);
  assert.ok(m.filters > 20, `filters ${m.filters}`);
});

test('punctuation leaves a fingerprint', () => {
  const m = measure('He waited — and waited; and then, at last, waited some more… '.repeat(30));
  assert.ok(m.emDash > 10);
  assert.ok(m.semicolon > 10);
  assert.ok(m.ellipsis > 10);
});

/* Plain unique/total shrinks as a text grows, so a 500-word scene would always
 * look more varied than a 90,000-word book and the drift would be an artefact. */
test('vocabulary variety does not drift with sample length', () => {
  const unit = `${LONG}${SHORT}`;
  const small = measure(unit.repeat(6));
  const large = measure(unit.repeat(60));
  assert.ok(large.sampleWords > small.sampleWords * 8, 'the large sample must be much larger');
  assert.ok(Math.abs(large.variety - small.variety) < 0.08,
    `variety moved from ${small.variety} to ${large.variety} on length alone`);
});

test('every documented metric is actually produced', () => {
  const m = measure(`${LONG}${SHORT}`.repeat(5));
  for (const key of METRIC_KEYS) {
    assert.equal(typeof m[key], 'number', `${key} missing from the measurement`);
  }
});

/* --- the mixer ----------------------------------------------------------- */

const plain = measure(SHORT.repeat(40));
const ornate = measure(LONG.repeat(20));

test('a blend is a weighted mean of the measured profiles', () => {
  const even = blend([{ metrics: plain, weight: 50 }, { metrics: ornate, weight: 50 }]);
  const mid = (plain.meanSentence + ornate.meanSentence) / 2;
  assert.ok(Math.abs(even.meanSentence - mid) < 0.01, `${even.meanSentence} vs ${mid}`);

  const leaning = blend([{ metrics: plain, weight: 90 }, { metrics: ornate, weight: 10 }]);
  assert.ok(leaning.meanSentence < even.meanSentence,
    'weighting toward the plainer voice must shorten the target');
});

test('weights are relative — they need not add to anything', () => {
  const a = blend([{ metrics: plain, weight: 3 }, { metrics: ornate, weight: 1 }]);
  const b = blend([{ metrics: plain, weight: 75 }, { metrics: ornate, weight: 25 }]);
  assert.equal(a.meanSentence, b.meanSentence);
});

test('profiles with no measurements contribute nothing instead of dragging to zero', () => {
  const withEmpty = blend([
    { metrics: plain, weight: 50 },
    { metrics: null, weight: 50 },
  ]);
  assert.equal(withEmpty.meanSentence, plain.meanSentence);
  assert.equal(blend([{ metrics: null, weight: 100 }]), null);
  assert.equal(blend([]), null);
});

test('shares are normalised to whole percentages for display', () => {
  const rows = shares([{ weight: 40 }, { weight: 20 }, { weight: 15 }, { weight: 15 }, { weight: 10 }]);
  assert.deepEqual(rows.map((r) => r.share), [40, 20, 15, 15, 10]);
  const odd = shares([{ weight: 1 }, { weight: 1 }, { weight: 1 }]);
  assert.deepEqual(odd.map((r) => r.share), [33, 33, 33]);
  assert.deepEqual(shares([{ weight: 0 }]).map((r) => r.share), [0]);
});

/* --- comparison ---------------------------------------------------------- */

/* Zero on both sides is agreement, not a divide-by-zero. */
test('a metric that is zero in both the draft and the target reports no drift', () => {
  const row = compare({ ...plain, ellipsis: 0 }, { ...plain, ellipsis: 0 })
    .find((r) => r.key === 'ellipsis');
  assert.equal(row.drift, 0);
  assert.equal(row.off, false);
  assert.ok(!Number.isNaN(row.drift));
  assert.ok(!/NaN/.test(describe(row)), describe(row));
});

test('a draft matching its target reports no drift', () => {
  const rows = compare(plain, plain);
  assert.equal(rows.filter((r) => r.off).length, 0);
  assert.equal(rows.length, METRIC_KEYS.length);
});

test('a draft far from its target reports the biggest divergence first', () => {
  const rows = compare(ornate, plain);
  assert.ok(rows.some((r) => r.off), 'expected drift between two very different voices');
  assert.ok(Math.abs(rows[0].drift) >= Math.abs(rows[rows.length - 1].drift),
    'rows must be ordered by how far off they are');
  const sentence = rows.find((r) => r.key === 'meanSentence');
  assert.ok(sentence.drift > 0, 'the ornate sample has longer sentences than the plain target');
});

/* Rates near zero need an absolute floor, or 0.2 semicolons against 0.6 reads as
 * a 200% collapse in voice rather than three semicolons in a long book. */
test('near-zero rates do not produce false drift', () => {
  const base = { ...plain, semicolon: 0.2 };
  const drafted = { ...plain, semicolon: 0.6 };
  const row = compare(drafted, base).find((r) => r.key === 'semicolon');
  assert.equal(row.off, false, `drift ${row.drift} flagged on a 0.4/1000 difference`);
});

test('comparison is skipped rather than guessed when either side is missing', () => {
  assert.deepEqual(compare(null, plain), []);
  assert.deepEqual(compare(plain, null), []);
  const partial = compare(plain, { meanSentence: 10 });
  assert.equal(partial.length, 1, 'only metrics present on both sides are compared');
});

test('a finding reads as a sentence a writer can act on', () => {
  const row = compare(ornate, plain).find((r) => r.key === 'meanSentence');
  const text = describe(row);
  assert.match(text, /Words per sentence runs \d+% longer than the target/);
  assert.ok(!/NaN|undefined|Infinity/.test(text), text);
});

test('every metric describes itself without leaking a raw key', () => {
  for (const row of compare(ornate, plain)) {
    const text = describe(row);
    assert.ok(text.length > 15, `${row.key} described as "${text}"`);
    assert.ok(!/NaN|undefined|Infinity/.test(text), `${row.key}: ${text}`);
  }
});

/* --- what ships ---------------------------------------------------------- */

test('the starter profiles ship with craft notes and no invented numbers', () => {
  assert.equal(STARTER_PROFILES.length, 6);
  for (const p of STARTER_PROFILES) {
    assert.ok(p.name && p.note, `${p.name} is missing its note`);
    assert.equal(p.metrics, undefined,
      `${p.name} ships with numbers — that would be fabricated research`);
  }
  assert.ok(STARTER_PROFILES.some((p) => p.name === 'My Default Author Voice'));
});

test('the minimum sample is large enough to describe a voice, not a passage', () => {
  assert.ok(MIN_SAMPLE >= 300);
  assert.equal(measure(SHORT).sampleWords < MIN_SAMPLE, true);
});

test('every metric declares a tolerance, or drift could not be judged', () => {
  for (const key of METRIC_KEYS) {
    assert.ok(METRICS[key].tolerance > 0, `${key} has no tolerance`);
    assert.ok(METRICS[key].label, `${key} has no label`);
  }
});

console.log('\nNovel Development Platform — style engine tests\n');
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed\n`);
