/* tests/playwright.mjs — find Playwright wherever it happens to live.
 *
 * The browser suites previously carried a hardcoded path to one machine's
 * global npm directory. That works until the repository moves, which is exactly
 * what repositories do. This resolves at runtime instead: a project install
 * first, then the global root as npm itself reports it, then an explicit
 * override, and finally a clean skip rather than a failure — the non-browser
 * suites must stay runnable on a bare checkout with nothing installed.
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

export async function loadPlaywright() {
  const require = createRequire(import.meta.url);

  /* 1. A normal dependency. */
  try { return require('playwright'); } catch { /* not installed locally */ }

  /* 2. An explicit override, for unusual layouts. */
  if (process.env.PLAYWRIGHT_MODULE) {
    try { return await import(process.env.PLAYWRIGHT_MODULE); } catch { /* keep looking */ }
  }

  /* 3. A global install, at whatever path this machine actually uses. */
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
    if (root) return await import(join(root, 'playwright', 'index.mjs'));
  } catch { /* no global install either */ }

  return null;
}

export function skipMessage(suite) {
  return `${suite}: Playwright is not installed — skipping.\n`
    + '  npm install && npx playwright install chromium';
}
