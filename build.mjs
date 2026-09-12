/* build.mjs — produce the sellable artifact: ONE self-contained HTML file.
 *
 * Why one file. Browsers refuse to load ES modules over file://, so a buyer who
 * downloads a folder and double-clicks index.html gets a blank page and asks for
 * a refund. Inlining everything removes the module loader from the equation: the
 * file opens from a desktop, a USB stick, or an email attachment, with no
 * server, no install, no account, and no internet.
 *
 * That constraint turns out to be the product's best property. Nothing to
 * subscribe to, nothing to log into, and it still opens in ten years.
 *
 *   node build.mjs        ->  dist/writeline.html
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const ENTRY = 'assets/js/app.js';

/* --- resolve the module graph ------------------------------------------- */

const IMPORT_RE = /^\s*import\s+(?:(\*\s*as\s+\w+)|(\{[^}]*\}))\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;

const modules = new Map();   // key -> { source, deps }

async function collect(key) {
  if (modules.has(key)) return;
  const source = await readFile(join(ROOT, key), 'utf8');
  const deps = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[3];
    if (!spec.startsWith('.')) throw new Error(`${key}: bare import "${spec}" cannot be inlined`);
    deps.push(relative(ROOT, resolve(dirname(join(ROOT, key)), spec)).split('\\').join('/'));
  }
  modules.set(key, { source, deps });
  for (const dep of deps) await collect(dep);
}

/* Depth-first, so a module is defined after everything it reads at load time.
 * Cycles are fatal rather than papered over: every import in this codebase runs
 * at module top level, so a cycle would hand somebody an undefined binding at
 * runtime instead of a build error now. */
function order() {
  const sorted = [];
  const state = new Map();
  const visit = (key, trail) => {
    if (state.get(key) === 'done') return;
    if (state.get(key) === 'busy') {
      throw new Error(`circular import: ${[...trail, key].join(' -> ')}`);
    }
    state.set(key, 'busy');
    for (const dep of modules.get(key).deps) visit(dep, [...trail, key]);
    state.set(key, 'done');
    sorted.push(key);
  };
  visit(ENTRY, []);
  return sorted;
}

/* --- rewrite ESM into a tiny registry ----------------------------------- */

const EXPORT_FN = /^export\s+(async\s+)?function\s+(\w+)/gm;
const EXPORT_DECL = /^export\s+(const|let|var)\s+(\w+)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}\s*;?\s*$/gm;

function transform(key, source) {
  const names = new Set();
  let body = source;

  for (const m of source.matchAll(EXPORT_FN)) names.add(m[2]);
  for (const m of source.matchAll(EXPORT_DECL)) names.add(m[2]);
  for (const m of source.matchAll(EXPORT_LIST)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }

  body = body
    .replace(EXPORT_LIST, () => '')
    .replace(EXPORT_FN, (_, isAsync, name) => `${isAsync ?? ''}function ${name}`)
    .replace(EXPORT_DECL, (_, kind, name) => `${kind} ${name}`)
    .replace(IMPORT_RE, (_, star, braces, spec) => {
      const dep = relative(ROOT, resolve(dirname(join(ROOT, key)), spec)).split('\\').join('/');
      if (star) return `const ${star.replace(/^\*\s*as\s+/, '')} = __req(${JSON.stringify(dep)});`;
      /* `{ a, b as c }` is valid destructuring once `as` becomes `:`. */
      const bindings = braces.replace(/\bas\b/g, ':');
      return `const ${bindings} = __req(${JSON.stringify(dep)});`;
    });

  const assigns = [...names].map((n) => `  __x.${n} = ${n};`).join('\n');
  return `__def(${JSON.stringify(key)}, (__x) => {\n${body}\n${assigns}\n});`;
}

const RUNTIME = `
/* Minimal module registry, standing in for the browser's ESM loader so the
   whole application can live in one file that opens from a desktop. */
const __mods = {};
const __cache = {};
const __def = (key, factory) => { __mods[key] = factory; };
const __req = (key) => {
  if (!__cache[key]) {
    const exports = {};
    __cache[key] = exports;
    __mods[key](exports);
  }
  return __cache[key];
};`;

/* --- assemble ------------------------------------------------------------ */

await collect(ENTRY);
const sorted = order();
const css = await readFile(join(ROOT, 'assets/css/app.css'), 'utf8');
const shell = await readFile(join(ROOT, 'index.html'), 'utf8');

const bundled = sorted
  .filter((key) => key !== ENTRY)
  .map((key) => transform(key, modules.get(key).source))
  .join('\n\n');

/* The entry is not registered — it simply runs, last. */
const entrySource = transform(ENTRY, modules.get(ENTRY).source)
  .replace(/^__def\("assets\/js\/app\.js", \(__x\) => \{\n/, '(() => {\n')
  .replace(/\n[^\n]*\n\}\);$/, '\n})();');

/* Replacement text goes through a FUNCTION, never a string. A string
 * replacement expands $&, $1 and friends — and this codebase contains the
 * literal '\\$&' inside a regex-escaping call, which silently spliced the
 * matched tag into the middle of the bundle and broke the file. */
const put = (haystack, needle, value) => haystack.replace(needle, () => value);

let html = shell;
html = put(html, '<link rel="stylesheet" href="assets/css/app.css">', `<style>\n${css}\n  </style>`);
html = put(html, '<script type="module" src="assets/js/app.js"></script>',
  `<script type="module">\n${RUNTIME}\n\n${bundled}\n\n${entrySource}\n  </script>`);
html = put(html, '<title>Writeline</title>',
  '<title>Writeline</title>\n  <meta name="robots" content="noindex">');

/* A literal </script> anywhere in the source would end the block early, so
 * refuse to ship rather than emit a file that half-renders as text. */
const scriptBody = html.slice(html.indexOf('<script type="module">') + 22);
if (scriptBody.slice(0, scriptBody.indexOf('</script>')).includes('</script')) {
  throw new Error('source contains a literal </script> — it would terminate the block');
}

await mkdir(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', 'writeline.html');
await writeFile(out, html, 'utf8');

const { size } = await stat(out);
console.log(`built dist/writeline.html`);
console.log(`  ${sorted.length} modules inlined, ${(size / 1024).toFixed(0)} KB, no dependencies`);
console.log(`  order: ${sorted.map((k) => k.split('/').pop()).join(' -> ')}`);
