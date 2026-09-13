/* useWriteline.ts — the React binding. Twenty lines, and it is the whole
 * integration.
 *
 * useSyncExternalStore rather than useState + useEffect: the engine already has
 * a subscription, and every finding is computed on read. There is no snapshot to
 * keep in sync, which means there is no snapshot to go stale.
 */

import { useSyncExternalStore } from 'react';
import { createWriteline, type Writeline } from './writeline';

const api: Writeline = createWriteline();
let ready = false;
const boot = api.load().then(() => { ready = true; });

export function useWriteline(): Writeline {
  /* Suspense-compatible: throw the promise until the store has loaded. */
  if (!ready) throw boot;

  useSyncExternalStore(
    api.subscribe,
    /* The engine mutates in place and notifies; a counter is enough to tell
     * React that something changed. Everything is recomputed on render. */
    () => version,
    () => version,
  );
  return api;
}

let version = 0;
api.subscribe(() => { version += 1; });

export default useWriteline;
