# Novel Development Platform

A client-side workspace for planning, drafting and **continuity-checking** novels
and series. No build step, no server, no account. Open it, and it runs.

```
NOVEL DEVELOPMENT PLATFORM
│
├── Novel Project: ECHO 2084
│   ├── Draft 0            unstructured first pass, with extraction
│   ├── Story Bible        premise, themes, concepts
│   ├── Character Bible    people, with backlinks
│   ├── World Bible        places, factions, objects
│   ├── Timeline           chronological order
│   ├── Revelation Map     who knows what, and when the reader learns
│   ├── Chapter Map        containers and pacing
│   ├── Scene Map          the atomic unit — prose lives here
│   ├── Manuscript         compiled output, read-only
│   └── Continuity         computed contradictions
│
├── Novel Project: Future Novel
│
└── Novel Project: Future Series
    ├── Book 1
    ├── Book 2
    └── Book 3
```

## Run it

```bash
python3 -m http.server 8000     # or: npx serve .
# then open http://localhost:8000
```

It needs a static server, not `file://` — ES modules are blocked over the file
protocol by browser CORS rules. Any static host works: GitHub Pages, Netlify,
an S3 bucket, a Raspberry Pi on your desk.

```bash
node tests/smoke.mjs            # 16 graph + continuity tests, no browser needed
node tests/browser.mjs          # 19 tests driving the real app in Chromium
```

The browser suite serves the repo on an ephemeral port and needs Playwright
(`npm install`); it skips itself cleanly when Playwright is absent, so the first
command always works on a bare checkout.

Click **Sample** in the header to load ECHO 2084 plus the two empty projects.
The sample ships with **two deliberate continuity errors** — open **Continuity**
and the app explains itself in about four seconds. A clean sample would
demonstrate nothing.

## The one architectural decision that matters

The tree above looks like nine documents in a folder. It is not, and the
difference is the entire point.

**Nine documents means nine places the same fact lives.** A character dies in
the Timeline and speaks in Chapter 22. The Revelation Map says the twist lands
in Scene 31 while Scene 14 already leans on it. Every outliner built as a folder
of documents has this failure mode, and none of them can detect it, because
documents do not check each other.

So the storage model is **one graph, many projections**:

| Records (written once) | Projections (computed every paint) |
|---|---|
| `entity` — character, location, faction, item, concept | Story / Character / World Bible |
| `beat` — one thing that happens, in story time | Timeline |
| `revelation` — a fact, its holders, its reveal scene | Revelation Map |
| `chapter` — an ordered container | Chapter Map |
| `scene` — cast, POV, place, and the prose itself | Scene Map, Manuscript |
| `note` — freeform text | Draft 0, Story Bible pages |

Write a fact once; every view that depends on it updates. Nothing is duplicated,
so nothing can disagree.

Three consequences worth stating plainly:

- **The Manuscript is read-only.** It is compiled from scenes. Every tool that
  lets you edit both the outline and the manuscript ends the same way: the two
  drift, the outline loses, and by chapter thirty you are maintaining a lie.
- **Deletes cascade and scrub.** Removing a character unlinks them from every
  scene, beat and revelation. Dangling references would make the continuity
  engine report ghosts, which is worse than reporting nothing.
- **Series-shared records carry `bookId: null`.** Three books, one character
  bible, zero copies. Edit the character once.

## Continuity: two orders that disagree

Every book runs on two orders, and they are not the same order:

- **reading order** — `chapter.order`, then `scene.order` (how the reader arrives)
- **chronological order** — `beat.order` (when it actually happened)

Almost every continuity bug in a novel is a disagreement between those two. The
engine in `assets/js/lint.js` is a list of specific, checkable forms of that
disagreement:

| Rule | Severity | What it catches |
|---|---|---|
| `premature-knowledge` | error | A scene leans on a fact the reader has not been shown yet |
| `ghost-cast` | error | A character on the page after they died or left |
| `pov-not-present` | error | The POV character is not in their own scene's cast |
| `empty-drafted` | error | Marked drafted, contains no prose |
| `chronology-inversion` | warn | Story time runs backwards with no flashback flag |
| `unplanted-reveal` | warn | A major reveal with zero setup — reads as a cheat |
| `never-revealed` | warn | A tracked fact the reader never learns |
| `knowledge-without-source` | warn | A character knows something with no beat explaining how |
| `missing-pov` | warn | A drafted scene with no POV |
| `missing-location` | info | A drafted scene with no place |
| `unplaced-scene` | info | No beat attached, so no position in story time |
| `orphan-entity` | info | In the bible, never appears anywhere |
| `chapter-word-drift` | info | A fully drafted chapter far off its target |

Nothing in the report is stored, so nothing in it can go stale. Fix the graph
and the finding disappears — there is no second place to update. A clean report
does not mean the book is good; it means the book agrees with itself.

Scenes marked **flashback** are exempt from the chronology and cast gates, which
is the one escape hatch the model needs and the only one it gets.

## Your words are yours

Records live in IndexedDB — asynchronous and effectively unbounded, unlike
`localStorage`, which is a synchronous ~5MB bucket that would block the main
thread re-serialising your whole novel on every keystroke. If IndexedDB is
unavailable (private mode, a locked-down browser) the app degrades to memory and
says so in the header rather than pretending to save.

**Browsers throw local data away without asking.** So:

- **Back up all** writes every project to one JSON file. That file is the
  archive of record; the browser database is a convenience.
- **Restore** reads it back, either replacing or merging.
- Manuscript exports to Markdown and to print-ready HTML. Bibles and the
  Timeline export to Markdown. All plain text, all diffable, all yours.

## Layout

```
index.html
assets/css/app.css          one stylesheet, dark by default, light follows the OS
assets/js/model.js          record types and factories — the schema
assets/js/store.js          IndexedDB, JSON export/import, memory fallback
assets/js/state.js          in-memory index, selectors, mutators, cascades
assets/js/lint.js           the continuity engine
assets/js/compile.js        manuscript + bible + timeline compilation
assets/js/dom.js            a 60-line hyperscript helper instead of a framework
assets/js/app.js            bootstrap and router
assets/js/seed.js           the ECHO 2084 sample, faults included
assets/js/views/*.js        one module per screen
tests/smoke.mjs             graph and continuity tests, Node only
tests/browser.mjs           end-to-end tests against a real Chromium
.github/workflows/pages.yml CI, and deploy to GitHub Pages from master
```

No runtime dependencies. No framework. No transpiler. The only `devDependency`
is Playwright, and it never reaches the published site. A novel outlives a
toolchain, and this one should still open in a browser in 2035.

**Keyboard:** `Ctrl`/`Cmd` + `1`–`0` jumps between the ten sections.

## Known limits

Stated plainly, because a roadmap disguised as a feature list is how software
lies:

- **No full-text search.** With a 90k-word manuscript you will want it.
- **No revision history.** Overwrite a scene and the previous text is gone.
  Back up before a big revision pass.
- **Story time is an ordered list, not a calendar.** `storyTime` is free text for
  humans; the engine reads list position. Overlapping durations and parallel
  timelines are not modelled.
- **One device.** No sync. The JSON backup is the transport between machines.
- **Drag-and-drop reordering** is not implemented; use the `↑`/`↓` buttons.
- **No AI orchestration and no Style Engine yet.** Both are named components of
  the wider system and both have specifications held outside this repository.
  They are absent rather than guessed at — see below.

## Not built, deliberately

The wider system names two components this repository does not implement:
**AI orchestration** and a **Style Engine**. Their specifications (PRD, writing
methodology, style specs, controlled-rewrite passes) live outside this repo.

They are not stubbed, mocked or approximated here. A Style Engine built from a
guess about someone's prose standards is worse than no Style Engine: it produces
confident output against the wrong rules, and confident wrong output in a
manuscript is expensive to detect and expensive to undo. When the specifications
land in the repository, they get built against the specifications.

What does exist is the seam they plug into: every record is addressable, the
whole graph serialises to JSON, and the Audit Engine already establishes the
pattern — read the graph, return findings, store nothing.
