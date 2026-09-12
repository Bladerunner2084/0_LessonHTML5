/* pace.js — deadlines, and the arithmetic nobody wants to do.
 *
 * The point of a deadline feature is not to display a date. It is to answer one
 * question honestly: at the rate you are actually writing, do you make it? That
 * requires measured velocity, not a guess, which is why every day the app is
 * opened it records the book's word count. Fourteen rows of history is enough
 * to tell a writer something their own optimism will not.
 *
 * This module tells the truth even when the truth is "no". A tool that says
 * "you can still make it!" at 4,000 words a day is not encouraging, it is
 * lying, and the author finds out too late to change anything.
 */

import * as S from './state.js';

export const today = (d = new Date()) => d.toISOString().slice(0, 10);

const DAY = 86400000;
const dateOf = (iso) => new Date(`${iso}T00:00:00Z`);
export const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / DAY);

/* A pace nobody sustains. Writers who hit 3k/day do it in bursts, not for six
 * weeks straight, so past this line the honest answer is that the plan needs to
 * change — the scope, the date, or the definition of done. */
const IMPOSSIBLE_PER_DAY = 3000;

/* Record where the book stands today. Called on load and after any prose edit;
 * one row per book per day, overwritten as the count climbs. */
export async function logWords(bookId) {
  if (!bookId) return null;
  const words = S.bookWords(bookId);
  const date = today();
  const existing = S.list('wordlog').find((w) => w.bookId === bookId && w.date === date);
  if (existing) {
    if (existing.words === words) return existing;
    return S.patch(existing.id, { words });
  }
  const book = S.get(bookId);
  return S.create('wordlog', { projectId: book?.projectId, bookId, date, words });
}

export const logs = (bookId) =>
  S.list('wordlog').filter((w) => w.bookId === bookId)
    .sort((a, b) => a.date.localeCompare(b.date));

/* Velocity over the trailing window, in words per calendar day. Measured from
 * the span the history actually covers, so a writer with four days of data is
 * not told they average a quarter of their real output. */
export function velocity(bookId, window = 14) {
  const rows = logs(bookId);
  if (rows.length < 2) return null;
  const cutoff = today(new Date(Date.now() - window * DAY));
  const recent = rows.filter((r) => r.date >= cutoff);
  const span = recent.length >= 2 ? recent : rows.slice(-2);
  const first = span[0];
  const last = span[span.length - 1];
  const days = Math.max(1, daysBetween(first.date, last.date));
  const gained = last.words - first.words;
  return { perDay: gained / days, days, gained, from: first.date, to: last.date };
}

export function paceReport(bookId) {
  const book = S.get(bookId);
  if (!book) return null;

  const words = S.bookWords(bookId);
  const target = book.targetWords || 0;
  const wordsLeft = Math.max(0, target - words);
  const v = velocity(bookId);

  if (!book.deadlineOn || !book.deadline) {
    return {
      verdict: 'none', words, target, wordsLeft, velocity: v,
      message: v && v.perDay > 0
        ? `Writing ${Math.round(v.perDay).toLocaleString()} words a day lately. `
          + `${wordsLeft.toLocaleString()} to go — about `
          + `${Math.ceil(wordsLeft / v.perDay)} days at that rate.`
        : 'No deadline set. Nothing here is counting down.',
    };
  }

  const daysLeft = daysBetween(today(), book.deadline);
  const writingRatio = Math.min(7, Math.max(1, book.writingDays || 7)) / 7;
  const writingDaysLeft = Math.max(0, Math.round(daysLeft * writingRatio));
  const perDay = writingDaysLeft > 0 ? wordsLeft / writingDaysLeft : Infinity;

  const base = {
    words, target, wordsLeft, daysLeft, writingDaysLeft,
    requiredPerDay: perDay, velocity: v, deadline: book.deadline,
  };

  if (wordsLeft === 0) {
    return { ...base, verdict: 'done', message: 'Target reached. The deadline is academic.' };
  }
  if (daysLeft < 0) {
    return {
      ...base, verdict: 'passed',
      message: `The deadline passed ${Math.abs(daysLeft)} day(s) ago with `
        + `${wordsLeft.toLocaleString()} words outstanding. Move the date or cut the scope — `
        + 'a deadline you have already missed stops being information.',
    };
  }
  if (perDay > IMPOSSIBLE_PER_DAY) {
    return {
      ...base, verdict: 'impossible',
      message: `${Math.round(perDay).toLocaleString()} words per writing day would be needed. `
        + 'Almost nobody sustains that. This plan needs a new date or a smaller book, and '
        + 'you are better off knowing now than in week five.',
    };
  }

  const measured = v?.perDay ?? null;
  if (measured == null) {
    return {
      ...base, verdict: 'unknown',
      message: `${Math.round(perDay).toLocaleString()} words per writing day for `
        + `${writingDaysLeft} day(s). No history yet — come back tomorrow and this becomes `
        + 'a measurement instead of a projection.',
    };
  }

  const ratio = measured / perDay;
  const verdict = ratio >= 1.15 ? 'ahead' : ratio >= 0.85 ? 'on-track' : 'behind';
  const projectedDays = measured > 0 ? Math.ceil(wordsLeft / measured) : Infinity;

  return {
    ...base,
    verdict,
    projectedDays,
    message: verdict === 'behind'
      ? `Needs ${Math.round(perDay).toLocaleString()}/day; you are averaging `
        + `${Math.round(measured).toLocaleString()}. At the current rate this finishes in about `
        + `${projectedDays} days — ${projectedDays - daysLeft} past the date.`
      : `Needs ${Math.round(perDay).toLocaleString()}/day; you are averaging `
        + `${Math.round(measured).toLocaleString()}. On this rate you finish in about `
        + `${projectedDays} days, ${daysLeft - projectedDays} to spare.`,
  };
}

export const VERDICT_TONE = {
  ahead: 'good', 'on-track': 'good', done: 'good',
  behind: 'warn', unknown: 'warn', none: '',
  impossible: 'bad', passed: 'bad',
};
