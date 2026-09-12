/* dom.js — a 60-line hyperscript helper instead of a framework.
 * The app has no build step: open index.html through any static server and it
 * runs. That constraint is deliberate — a novel outlives a toolchain. */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value;
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const frag = (...children) => append(document.createDocumentFragment(), children);

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/* Typing must not trigger a full repaint on every keystroke — the caret would
 * jump and long prose would stutter. Every text input in the app writes
 * through this. */
export function debounce(fn, ms = 350) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(timer); fn(...args); };
  return wrapped;
}

export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function select(options, value, onchange, { placeholder = '—' } = {}) {
  const el = h('select', { onchange: (e) => onchange(e.target.value || null) },
    h('option', { value: '' }, placeholder),
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  el.value = value ?? '';
  return el;
}

/* Multi-select as checkboxes: a scene's cast list is read far more often than
 * it is edited, so it has to be scannable at a glance, not hidden in a listbox. */
export function checkList(options, selected, onchange) {
  const chosen = new Set(selected ?? []);
  return h('div', { class: 'checklist' },
    options.length ? options.map((o) => h('label', { class: 'check' },
      h('input', {
        type: 'checkbox',
        checked: chosen.has(o.value),
        onchange: (e) => {
          if (e.target.checked) chosen.add(o.value); else chosen.delete(o.value);
          onchange([...chosen]);
        },
      }),
      h('span', {}, o.label))) : h('p', { class: 'empty' }, 'Nothing to choose yet.'));
}

/* PRD §34 — canon status belongs on every editable record, and it must look
 * identical everywhere. An AI suggestion that renders like an author's decision
 * is exactly the laundering this platform exists to prevent. */
export function canonControl(record, onchange, CANON, CANON_ORDER) {
  return h('div', { class: 'canon-row' },
    CANON_ORDER.map((key) => h('button', {
      class: `canon-chip ${key} ${(record.canon ?? 'canon') === key ? 'on' : ''}`,
      title: CANON[key].blurb,
      onclick: () => onchange(key),
    }, CANON[key].mark, ' ', CANON[key].label)));
}

export function confirmDanger(message) {
  return window.confirm(`${message}\n\nThis cannot be undone.`);
}
