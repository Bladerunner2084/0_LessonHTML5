/* views/reader.js — the Reader Simulator.
 *
 * A slider that walks the book one scene at a time, showing what is in the
 * reader's head at that point: what they are still waiting to find out, what
 * they were told and are losing, what they believe that is wrong, and who they
 * have met. The curve above it is the weight of the unanswered — computed, not
 * felt, which is the only way to point at the exact scene where a book sags.
 */

import { h, clear, svg as sv } from '../dom.js';
import * as S from '../state.js';
import { readerModel, readerStateAt, tensionCurve, readerFindings, recallAt, FAINT }
  from '../reader.js';

const CHART_W = 1000;
const CHART_H = 150;
const PAD = { top: 14, right: 10, bottom: 22, left: 10 };

export function renderReader(bookId) {
  const model = readerModel(bookId);
  const scenes = model.scenes;

  if (scenes.length < 2) {
    return h('div', { class: 'view' },
      header(0, 0, () => {}),
      h('p', { class: 'empty pad' },
        'The Reader Simulator needs at least two scenes. It models a mind moving '
        + 'through a book; one scene is not a journey.'));
  }

  const curve = tensionCurve(bookId, model);
  const findings = readerFindings(bookId);

  /* Position lives in UI state so it survives a repaint mid-scrub. */
  let at = Number.isInteger(S.ui.readerAt) ? S.ui.readerAt : scenes.length - 1;
  at = Math.max(0, Math.min(scenes.length - 1, at));

  const panel = h('div', { class: 'reader-panel' });
  const chartHost = h('div', { class: 'chart-host' });
  const caption = h('p', { class: 'sub chart-caption' });

  const slider = h('input', {
    type: 'range', class: 'scrub',
    min: 0, max: scenes.length - 1, step: 1, value: at,
    'aria-label': 'Scene position in reading order',
    oninput: (e) => paint(Number(e.target.value)),
    onchange: (e) => { S.ui.readerAt = Number(e.target.value); },
  });

  function paint(next) {
    at = next;
    slider.value = String(next);
    S.ui.readerAt = next;
    clear(chartHost).append(chart(curve, at, paint));
    clear(panel).append(statePanel(bookId, at, model));
    const point = curve[at];
    caption.textContent =
      `Scene ${at + 1} of ${scenes.length} — “${point.scene.title}”. `
      + `Tension ${point.tension}: the weight of every question the reader is `
      + 'still carrying here.';
  }

  paint(at);

  return h('div', { class: 'view' },
    header(scenes.length, findings.length, () => paint(scenes.length - 1)),
    h('div', { class: 'dash' },
      h('section', { class: 'chart-block' },
        h('h3', {}, 'Open questions the reader is carrying'),
        chartHost,
        slider,
        caption),
      findings.length ? h('section', {},
        h('h3', {}, 'What the curve found'),
        h('ul', { class: 'reader-findings' }, findings.map((f) => h('li', { class: f.severity },
          h('button', {
            class: 'link',
            onclick: () => {
              const i = S.bookScenes(bookId).findIndex((s) => s.id === f.recordId);
              if (i >= 0) paint(i);
            },
          }, f.message))))) : null,
      panel));
}

function header(sceneCount, findingCount, reset) {
  return h('header', { class: 'view-head' },
    h('div', {},
      h('h2', {}, 'Reader Simulator'),
      h('p', { class: 'sub' },
        'Not what you wrote — what they are holding. Facts fade when nothing '
        + 'reinforces them, because readers forget and every other tool pretends '
        + 'they do not.')),
    h('div', { class: 'view-actions' },
      findingCount
        ? h('span', { class: 'tally warn' }, `${findingCount} finding(s)`)
        : h('span', { class: 'tally' }, 'nothing flagged'),
      h('button', { class: 'btn btn-small btn-ghost', onclick: reset }, 'Jump to end')));
}

/* --- the curve ---------------------------------------------------------- */

function chart(curve, at, onPick) {
  const max = Math.max(1, ...curve.map((p) => p.tension));
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const step = curve.length > 1 ? plotW / (curve.length - 1) : 0;

  const x = (i) => PAD.left + i * step;
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  const line = curve.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.tension).toFixed(1)}`).join(' ');
  const area = `${line} L${x(curve.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  const tip = h('div', { class: 'chart-tip', hidden: true });

  /* Gridlines stay recessive: two references, no boxed frame, no tick forest. */
  const grid = [max, max / 2].map((v) => sv('line', {
    class: 'grid', x1: PAD.left, x2: CHART_W - PAD.right, y1: y(v), y2: y(v),
  }));

  /* Where something opens or closes, mark it. A reader feels these moments;
   * the author should be able to see them without counting. */
  const events = curve.flatMap((p, i) => [
    p.opened ? sv('circle', { class: 'ev open', cx: x(i), cy: y(p.tension), r: 4 }) : null,
    p.closed ? sv('circle', { class: 'ev close', cx: x(i), cy: y(p.tension), r: 4 }) : null,
  ].filter(Boolean));

  /* Hit targets are wider than the marks, per scene. */
  const hits = curve.map((p, i) => sv('rect', {
    class: 'hit',
    x: x(i) - step / 2, y: 0, width: Math.max(step, 6), height: CHART_H,
    onpointerenter: () => {
      tip.hidden = false;
      tip.style.left = `${(x(i) / CHART_W) * 100}%`;
      clear(tip).append(
        h('strong', {}, `${i + 1}. ${p.scene.title}`),
        h('span', {}, `Carrying ${p.tension}`),
        p.opened ? h('span', { class: 'ev-open' }, `${p.opened} opened`) : null,
        p.closed ? h('span', { class: 'ev-close' }, `${p.closed} resolved`) : null);
    },
    onpointerleave: () => { tip.hidden = true; },
    onclick: () => onPick(i),
  }));

  const chartEl = sv('svg', {
    class: 'tension-chart', viewBox: `0 0 ${CHART_W} ${CHART_H}`,
    preserveAspectRatio: 'none', role: 'img',
    'aria-label': `Open questions across ${curve.length} scenes, peaking at ${max}`,
  },
    grid,
    sv('path', { class: 'area', d: area }),
    sv('path', { class: 'line', d: line }),
    sv('line', { class: 'axis', x1: PAD.left, x2: CHART_W - PAD.right, y1: y(0), y2: y(0) }),
    sv('line', { class: 'cursor', x1: x(at), x2: x(at), y1: PAD.top - 6, y2: y(0) }),
    sv('circle', { class: 'cursor-dot', cx: x(at), cy: y(curve[at].tension), r: 5 }),
    events,
    /* Hit targets last, so they sit above every mark they explain. */
    hits);

  return h('figure', { class: 'chart-figure' },
    h('div', { class: 'chart-wrap' }, chartEl, tip),
    h('figcaption', {},
      h('span', {}, `peak ${max}`),
      h('span', { class: 'ev-open' }, '● question opens'),
      h('span', { class: 'ev-close' }, '● question answered')));
}

/* --- what is in their head --------------------------------------------- */

function statePanel(bookId, at, model) {
  const state = readerStateAt(bookId, at, model);

  const strengthBar = (value) => h('span', {
    class: `recall ${value < FAINT ? 'faint' : ''}`,
    title: `${Math.round(value * 100)}% recall`,
  }, h('i', { style: { width: `${Math.max(4, Math.round(value * 100))}%` } }));

  const group = (title, note, items, render) => h('section', { class: 'reader-group' },
    h('h3', {}, title, h('span', { class: 'muted' }, ` · ${items.length}`)),
    h('p', { class: 'sub' }, note),
    items.length
      ? h('ul', { class: 'reader-list' }, items.map(render))
      : h('p', { class: 'empty' }, 'Nothing.'));

  return h('div', { class: 'reader-columns' },
    group('Still waiting on', 'Questions opened and not yet answered. This is the tension.',
      state.open, (e) => h('li', {},
        h('span', { class: `weight ${e.weight === 3 ? 'twist' : e.weight === 2 ? 'major' : ''}` },
          e.weight),
        h('span', { class: 'name' }, e.label),
        h('span', { class: 'muted small' }, `open ${at - e.lastSeen + 1} scene(s)`))),

    group('Knows', 'Revealed, and how firmly the reader still holds it.',
      state.known, (e) => h('li', {},
        strengthBar(e.strength),
        h('span', { class: 'name' }, e.label),
        h('span', { class: 'muted small' },
          e.scenesSince === 0 ? 'just now' : `${e.scenesSince} scene(s) ago`))),

    group('Fading', 'Told once, long enough ago that they no longer have it.',
      state.fading, (e) => h('li', { class: 'faint-row' },
        strengthBar(e.strength),
        h('span', { class: 'name' }, e.label),
        h('span', { class: 'muted small' }, `${e.scenesSince} scenes of silence`))),

    group('Believes wrongly', 'Facts you have marked misunderstood or false.',
      state.wrong, (e) => h('li', {},
        h('span', { class: 'weight twist' }, '!'),
        h('span', { class: 'name' }, e.label))),

    group('Has met', 'Everyone introduced so far, most recent first.',
      state.met, (e) => h('li', {},
        strengthBar(e.strength),
        h('span', { class: 'name' }, S.entityName(e.entityId)),
        h('span', { class: 'muted small' },
          e.since === 0 ? 'on the page' : `last seen ${e.since} scene(s) ago`))));
}

export { recallAt };
