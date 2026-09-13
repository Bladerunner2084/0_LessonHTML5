# Wiring the Figma Make front end to the engine

The prototype at `figma.com/make/as6kdHRIcsJXzafyowtCsN` is React + Vite +
TypeScript, well designed, and **contains no logic**. Every finding, count and
percentage in it is a literal. That is normal for a prototype. This directory
exists so the next step is connection rather than reimplementation.

## The one rule

**A component renders findings. It never computes them.**

The moment a `.tsx` file hand-writes a findings array, a recall half-life, or a
continuity check, the logic exists twice. The two drift. The product is back to
the failure the whole architecture was built to prevent — and you are maintaining
two versions of your only differentiator.

## How to connect it

Copy `assets/js/` into the Vite project (or publish it as a package) and add
these three files. Then, per view:

```tsx
import useWriteline from './useWriteline';

const w = useWriteline();
const findings = w.findings();     // recomputed on every render, never cached
```

`Audits.tsx` in this directory is the worked example. Every style, token and
letter-spacing is exactly as Figma Make produced it. The diff is the data source
and nothing else.

## What each prototype view maps to

| Prototype view | Engine call | Exists? |
|---|---|---|
| `Dashboard` | `w.stats()`, `w.pipeline()`, `w.pace()` | yes |
| `Audits` | `w.findings()`, `w.findingCounts()` | yes — see `Audits.tsx` |
| `Characters` | `w.entities(bookId, 'character')` | yes |
| `Timeline` | `w.beats(bookId)` | yes |
| `Write` | `w.bookScenes()`, `w.patch(sceneId, { prose })` | yes |
| `StyleStudio` | `w.style.measure()`, `w.style.blend()`, `w.style.drift()` | yes |
| `Revisions` | `w.pipeline().stages` (the 17) | yes |
| `Series` | `w.books(projectId)` | yes |
| `Projects` | `w.projects()` | yes |
| *(missing)* **Reader Simulator** | `w.reader(bookId, at)` | **yes — and not in the prototype** |
| `AIEditor` | — | **no engine behind it** |
| `Tutorials` | — | not built |
| `Signup`, `Onboarding` | — | needs a backend |

## Two things to fix in the front-end spec

### 1. The Reader Simulator is missing, and it is the product

The prototype's sidebar features **AI Editor** and **Promises & Payoffs**, neither
of which is built. It has no Reader Simulator, which is built, tested, and the one
capability no competitor has.

`w.reader(bookId, at)` returns everything that view needs: the tension curve per
scene, and at any position what the reader is still waiting on, what they know,
**what has faded**, what they believe wrongly, and who they have met.

### 2. The prototype's findings all require an LLM

Look at what it invented:

> *"Director Harel is described as left-handed while signing documents. Chapter 4
> establishes him signing with his right hand."*

No software produces that without reading prose semantically. Neither does
*"Maren accepts Harel's explanation without the skepticism her psychology would
predict."*

Now the engine's:

> *"Tessa Vance appears in a scene set after they leave the story."*
> *"Scene 38 relies on a fact last mentioned 23 scenes earlier."*

These fall out of structure. They cost nothing per user, run offline, and cannot
be hallucinated. **That is a business-model difference, not a design one.** If the
UI is built to the prototype's promise, every audit becomes an API call — a
per-user cost, a latency and a hallucination surface, on the feature the product
is named for.

Build both. Just keep them visibly separate: free structural findings, and
AI findings labelled as suggestions under the canon rules.

## What the engine does not give you yet

- **Finding dismissals.** "Accept as written" and "Defer" need a record that does
  not exist, and a decision first: should a dismissal survive an edit to the scene
  it was raised against? It probably has to expire, or an author silences a
  finding in draft two and never sees it again in draft five.
- **Accounts, sync, billing.** The backend fork, recorded in the root README.
- **Anything AI.** Blocked on the same transport decision.

## Files here

| File | What it is |
|---|---|
| `writeline.d.ts` | TypeScript declarations for the engine |
| `useWriteline.ts` | The React binding — twenty lines, via `useSyncExternalStore` |
| `Audits.tsx` | The prototype's component, wired to real data |
