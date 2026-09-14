# Shipped, but in no PRD

The PRDs are the spec of record and they drive Figma Make. Anything built that
they do not mention is at risk of being designed out — not by a decision, but by
omission.

These features exist, are tested, and appear in **no** PRD as a requirement.
Each needs either a line in the next PRD or a deliberate decision to drop it.

| Feature | Where it lives | PRD status |
|---|---|---|
| **Reader Simulator** — recall decay, tension curve, fading facts, cast load | `reader.js`, 17 tests | Absent from every PRD |
| **Screenplay mode** — prose → Fountain, editable, `.fountain` and `.fdx` export | `script.js`, 21 tests | PRD #1 §37 as a deferred aside; PRD #2 silent, and §18's export list omits both formats |
| **Deadlines and measured pace** — velocity from recorded history, honest verdicts | `pace.js` | Absent |
| **Cross-record search** | `search.js`, `views/search.js` | Absent |
| **Manuscript import** — `.docx` parsed without a dependency | `import.js`, 17 tests | Named only as a signup card ("Import Existing Manuscript"), never specified |
| **Single-file offline build** | `build.mjs`, 10 tests | Absent — and it is the entire basis of the "works offline forever" claim |
| **Direct-to-reader publishing route** | `views/publish.js` | PRD #2 §20 names KDP, IngramSpark and Draft2Digital; direct storefront is not mentioned |

## The two that matter most

**Reader Simulator.** It is the differentiator — the one capability no competitor
has, and the reason the product is worth naming. It is in no PRD, and therefore
in no Figma Make design. A front end built strictly to the spec would ship
without it.

**Screenplay.** PRD #2 §18 enumerates six export formats and omits the two the
application actually produces for screen work. An implementer following §18
literally would remove a working feature and not know they had.

## How the drift happened, and how to stop it

Both PRDs were written as forward specifications. Several features were then
requested in conversation and built. Nothing wrote them back into the document,
so the spec now describes a slightly different product from the one in the
repository — and the spec is the one being handed to designers.

The cheap fix is a rule rather than a process: **when a feature is requested in
conversation and built, it gets a line in the PRD in the same pass.** The
expensive version of this problem is a redesign that silently drops the thing
the product is named for.

## Two the PRD asks for that do not exist

Stated here so the traffic runs both ways:

- **AI Editor** (PRD #2 §33) appears in the front-end prototype's primary
  navigation. It has no engine behind it.
- **Promises & Payoffs** and **Foreshadowing** (PRD #1 §17, §18) are named in
  pricing tiers and the prototype sidebar. Neither is built.
