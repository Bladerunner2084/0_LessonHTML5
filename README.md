# Novel Development Platform

A client-side workspace for planning, drafting and **continuity-checking** novels
and series. No build step, no server, no account. Open it, and it runs.

```
NOVEL DEVELOPMENT PLATFORM
│
├── Novel Project: ECHO 2084
│   ├── Dashboard          what the book is, computed — and what to do next
│   ├── Draft 0            unstructured first pass, with extraction
│   ├── Draft Vault        every preserved version; nothing is destroyed
│   ├── Story Bible        premise, themes, concepts
│   ├── Character Bible    people, with backlinks
│   ├── World Bible        places, factions, objects
│   ├── Timeline           chronological order
│   ├── Revelation Map     who knows what, and when the reader learns
│   ├── Chapter Map        containers and pacing
│   ├── Scene Map          the atomic unit — prose lives here
│   ├── Manuscript         compiled output, read-only
│   ├── Screenplay         converted from prose; the novel stays untouched
│   ├── Reader Simulator   what the reader holds — and has forgotten
│   ├── Continuity         computed contradictions
│   ├── Decision Log       locked author decisions, authoritative
│   ├── Questions & Ideas  unanswered questions and raw, unfiled ideas
│   └── Publication        traditional · self · AI-assisted
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
node tests/smoke.mjs            # 36 graph, canon, version, pipeline and pace tests
node tests/reader.mjs           # 17 tests for the Reader Model
node tests/script.mjs           # 21 tests for the screenplay converter
node tests/browser.mjs          # 60 tests driving the real app in Chromium
```

The browser suite serves the repo on an ephemeral port and needs Playwright
(`npm install`); it skips itself cleanly when Playwright is absent, so the first
command always works on a bare checkout.

Click **Sample** in the header to load ECHO 2084 plus the two empty projects.
The sample ships with **two deliberate continuity errors** — open **Continuity**
and the app explains itself in about four seconds. A clean sample would
demonstrate nothing.

## Against the PRD

This repository implements the MVP of the NovelForge PRD. Where a feature needs
an AI layer that does not exist yet, it is marked as a pending module rather
than faked — the PRD's own instruction.

| PRD §38 MVP | State |
|---|---|
| 1. Project Dashboard | built — every figure derived, none stored |
| 2. Draft Vault | built — immutable snapshots, reversible restore |
| 3. Story Bible | built |
| 4. Character Bible | built — the §4 field roster, including *Would NEVER do* |
| 5. World Bible | built |
| 6. Chapter / Scene Planner | built |
| 7. Revelation Map | built — the ten §5 reader-states, purpose and consequences |
| 8. Continuity Audit | built — 16 rules (no geography, technology or politics yet) |
| 9. Information Audit | built — premature reveal, unplanted reveal, unsourced knowledge |
| 10. Version Control | built |
| 11. Decision Log | built — locked decisions carry their reason |
| 12. Controlled Rewrite | built — 17 stages, each computed from the graph |
| 13. Manuscript View | built — read-only, compiled |
| 14. AI Writers' Room | **not built** — transport undecided, see below |
| §35 Publication Mode | built — three routes, checklists, submission tracker |
| §36 Standalone vs series | built — chosen at project creation |

### Deadlines and pace

A word count sits on the dashboard permanently. A deadline is **opt-in** — one
toggle — because a deadline imposed by default is ambient guilt, and a writer
who feels watched by their own software stops opening it, which costs more words
than any deadline earns.

Switched on, it takes a due date and how many days a week you actually write,
then does the arithmetic nobody wants to do. Velocity is **measured**: the app
records the book's word count each day it is opened, so the projection comes
from history rather than optimism.

It will tell you no. Past roughly 3,000 words per writing day the verdict is
`impossible`, and the message says to change the date or cut the book. A tool
that answers "you can still make it!" at that pace is not encouraging — it is
lying, and the author finds out too late to act on it.

### Publication (§35)

Four routes, each with the obligations it actually carries: **Traditional**
(query, synopsis, comps, agent research, submission log), **Self-publishing**
(cover, interior, ISBN, copyright, distribution, pricing, ARCs, launch),
**AI-assisted** (human editorial pass, disclosure, imagery rights, metadata,
quality floor), and **Direct to reader** — print-on-demand fulfilment from the
author's own storefront, money to their own bank. Shared obligations carry
across all four.

The direct route is the highest margin per copy, and the author is the retailer.
**This application is deliberately never in the payment path.** The customer pays
the author through the author's own processor; the app prepares the files and
tracks the rails. Putting the money through the platform instead would make it a
money transmitter in several jurisdictions — licensing, identity checks,
chargeback liability — for an outcome identical from the writer's side. That is
an architectural commitment, so a test asserts it rather than trusting it to
memory.

Its checklist leads with production, because a spine width computed from a stale
page count is discovered at the proof stage and costs a week. Then the things
authors discover *after* the first sale: sales tax and VAT per shipped territory,
returns, chargebacks, and unit economics proved against real print and shipping
cost.

Two checklist items — *manuscript complete* and *continuity clean* — cannot be
ticked by hand. They are computed, because ticking them yourself while the
engine disagrees is precisely the self-deception this application removes.

### Canon status (§34 and §2)

Every record carries one of four states, and they are one field rather than two
because §34's canon axis and §2's author-confirmed / AI-inferred / unresolved
axis are the same axis:

🟢 **Canon** · 🟡 **Provisional** · 🔵 **AI suggestion** · 🔴 **Non-canon**

Anything a human creates is canon by default. Only an AI layer may mint a record
as a suggestion, and only the author may promote one. Two continuity rules give
that field teeth: drafted prose resting on a provisional fact is a **risk**, and
drafted prose resting on a rejected one is a **contradiction**. A system that
cannot tell a machine's guess from an author's decision will eventually launder
one into the other, and preventing exactly that is what this platform is for.

### The sample, and §47

§47 says: *do not populate ECHO 2084 with invented canon unless the author
provides it.* An earlier version of this repository broke that rule outright —
it invented a cast, a plot and an ending and filed them as fact.

So the sample now loads two separate projects. **ECHO 2084** is the author's,
created empty, with placeholder pages and open questions instead of answers.
**ECHO 2084 — Demo Fixture** is invented demonstration content, every record of
it marked provisional or AI-suggested, carrying two deliberate continuity
faults. Nothing invented can be mistaken for the author's story — not by a
person and not by a future AI pass reading the graph.

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

## Screenplay mode

A button converts the Scene Map into a screenplay. Two guarantees, both
structural rather than promised:

- **The novel is never touched.** The screenplay is its own record. There is no
  code path from screenplay mode back into a scene's prose, and a test asserts it.
- **Your edits are never silently lost.** Once a human has touched the script,
  re-converting snapshots the whole book to the Draft Vault first and says so.

The format is **Fountain** — plain text, an open standard, and it imports into
Final Draft. Export is `.fountain` or `.fdx`. A screenplay that cannot leave the
tool it was written in is not a screenplay.

**What the converter claims, and what it refuses.** It lays out the skeleton:
scene headings from each scene's location and time of day (reading a real clock,
so 23:40 is NIGHT), dialogue split out from attributed speech, action from the
remaining prose. It does **not** rewrite prose into screen action. Turning *"she
remembered the fire"* into something a camera can see is a craft judgement, and a
machine that silently attempts it produces confident nonsense. Every place it is
unsure emits a Fountain note — `[[like this]]` — that the writer can search for:
unattributed dialogue, two speakers in one paragraph, interior state a camera
cannot see, unwritten scenes, missing locations. A visible gap beats an invisible
guess.

The byline is left blank. The platform does not know who wrote the book, and a
guessed byline is how a draft goes out under the wrong name.

## The Reader Simulator

**Every writing tool models the book. This one models the reader.**

Scrivener models documents. Campfire models entities. All of them are author-side:
they organise what *you* know. The graph here can compute something none of them
can — what the reader knows at every point, and **how much of it they have
forgotten.**

That last clause is the whole idea. Every continuity system treats reader
knowledge as permanent: revealed once, known forever. It is not. A fact stated
once, forty scenes ago, with nothing since, is functionally unknown. Every author
has had an editor say *"I didn't follow that"* and thought *"but I explained it in
chapter four."* Both are true, and no tool has been able to show the author why.

So recall decays. Each time a fact is touched — planted, revealed, or leaned on
by a later scene — the reader's memory resets; between touches it fades with a
half-life of 12 scenes. Everything else falls out of that one change:

- **Tension** is the weight of the questions the reader is carrying, unanswered —
  a number, per scene, which is why it can be drawn as a curve and pointed at.
- **Fading** is what they were told and no longer hold.
- **Cast load** is how many people they have been asked to keep straight.

Five findings come out of it, and they join the Continuity report:

| Rule | What it catches |
|---|---|
| `reader-forgot` | A scene needs a fact last mentioned 19+ scenes ago |
| `tension-flatline` | Five or more scenes where nothing opens and nothing resolves |
| `tension-deflation` | The reader runs out of questions before the book runs out of pages |
| `character-faded` | Someone returns after long enough that the reader lost them |
| `cast-overload` | Six new names inside three scenes |

**None of this is AI.** It is arithmetic over records the author already keeps,
so it runs offline, costs nothing per user, and cannot hallucinate. It is also
the one part of this platform that no competitor can copy without first rebuilding
their storage as a graph.

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
assets/js/pipeline.js       the 17-stage Controlled Rewrite, computed
assets/js/pace.js           deadlines, measured velocity, honest verdicts
assets/js/reader.js         the Reader Model — recall decay, tension, cast load
assets/js/script.js         prose to Fountain, Fountain to page, Final Draft export
assets/js/compile.js        manuscript + bible + timeline compilation
assets/js/dom.js            a 60-line hyperscript helper instead of a framework
assets/js/app.js            bootstrap and router
assets/js/seed.js           the ECHO 2084 sample, faults included
assets/js/views/*.js        one module per screen
tests/smoke.mjs             36 graph, canon, version, pipeline and pace tests
tests/reader.mjs            17 Reader Model tests on a synthetic 40-scene book
tests/script.mjs            21 screenplay conversion and export tests
tests/browser.mjs           60 end-to-end tests against a real Chromium
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
- **Revision history is per-book, not per-scene.** The Draft Vault snapshots the
  whole book; there is no per-scene undo between snapshots.
- **Story time is an ordered list, not a calendar.** `storyTime` is free text for
  humans; the engine reads list position. Overlapping durations and parallel
  timelines are not modelled.
- **One device.** No sync. The JSON backup is the transport between machines.
- **Drag-and-drop reordering** is not implemented; use the `↑`/`↓` buttons.
- **No AI layer.** The Writers' Room (§31), Red Team (§32), Realism Audit (§16),
  prose-level Character Lock (§4) and the Style Engine all wait on one decision
  that has not been made — see below.

## Design posture

The reference points are **Final Draft, Adobe, Figma** — instruments. Not
Campfire, not Notion-with-dragons. That is a product decision, and it has
consequences worth stating so they do not get designed away later:

- **No gamification.** No streaks, no badges, no confetti, no encouragement. The
  deadline panel will tell you a plan is impossible; a tool that cheers instead
  is not on your side.
- **Density over whitespace.** A professional tool shows the work, not the brand.
- **Every number derived.** Nothing on a dashboard that a person has to remember
  to update, because the first stale figure poisons all the others.
- **Keyboard first.** `Ctrl`/`Cmd` + `1`–`0` moves between sections today; that
  is the direction, not the destination.
- **The app never writes for you unasked.** It reports, computes, and gets out of
  the way.

A serious writer's objection to most of this category is that it is a hobby toy
with a subscription. The way not to be that is to be *diagnostic* — to tell the
author something true they could not otherwise see.

## What "SaaS" would still require

The stated goal is a product other writers use, not a personal tool. This
application is not that yet, and the gap is not features — it is that **every
word lives in one browser on one machine.** There are no accounts, no sync, no
sharing, no billing, and no way to recover a project from a cleared cache beyond
the JSON backup the author remembered to take.

Four things stand between here and a product, in the order they bite:

1. **Identity and storage.** Accounts, and the manuscript living somewhere other
   than `IndexedDB`. Everything else depends on this one.
2. **Sync and conflict resolution.** Two devices editing one scene is a merge
   problem, and prose merges badly. The version model here helps; it does not
   solve it.
3. **Billing, and what happens when someone stops paying.** A writer must be
   able to export a complete, readable manuscript from a lapsed account. Anything
   else holds a book hostage.
4. **Support and data-loss liability.** The moment strangers trust it with a
   novel, "back up your own work" stops being an acceptable answer.

None of that is hard in isolation. All of it contradicts the property that makes
the current build durable — no server, no account, no company to outlive — so it
is a deliberate trade, recorded here rather than drifted into.

## The undecided question: how the AI reaches the page

Five PRD features need an AI, and none can be built until the transport is
chosen. The application is a static page with no server, which leaves three
options and no fourth:

1. **The author's own API key**, held in browser storage. Ships today, keeps the
   no-server property, but every user needs their own Anthropic account and the
   key sits in `localStorage`.
2. **A backend.** Removes that friction and destroys the property that makes
   this durable: no server to pay for, no account to lose, no company to outlive.
3. **A Claude Artifact** (PRD §44), where the page can ask Claude directly with
   no key and no backend. Solves both problems and costs the plain-static-host
   guarantee — the app then lives where Artifacts live.

This is not a detail to settle during implementation. Everything downstream
depends on it, so it is recorded here unanswered rather than decided by default.

What already exists is the seam the AI layer plugs into: every record is
addressable, the whole graph serialises to JSON, canon status is enforced so a
suggestion cannot become fact by accident, and the Audit Engine establishes the
contract — read the graph, return findings, store nothing.
