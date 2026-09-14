# Writeline — PRD #2 status

Publishing Center and Advanced Style Studio. This file records what the PRD
asks for and what the repository actually does, so nobody — Figma Make, a later
session, or you in three months — builds against a promise.

## Status by section

| § | Requirement | Status |
|---|---|---|
| 2, 52 | ECHO 2084 isolation; clean account | **Fixed** — was a real defect, see below |
| 5, 7 | Publishing readiness, PASS / WARNING / ACTION REQUIRED | **Built** — 12 computed rows |
| 6, 40 | Publishing workflow, production-desk layout | **Built** — six steps |
| 8 | Validation against existing audits | **Built** — reuses the audit engine |
| 9, 16 | Book Information and Metadata | **Built** — one `bookinfo` record |
| 10, 11 | Front and back matter | **Built** — records; enable, reorder, retitle, custom |
| 12, 13 | Formatting centre, print preparation | **Partial** — EPUB CSS and DOCX styles; no preset UI |
| 14 | EPUB preparation | **Built** — real EPUB 3, hand-written ZIP, no dependency |
| 15 | Cover Center | **Partial** — cover recorded by name; no design workflow |
| 17 | AI book description assistance | **Blocked** — AI layer |
| 18 | Export Center | **Built** — EPUB, DOCX, Markdown, print-ready HTML, plain text |
| 19 | Publication Snapshot, immutable | **Built** — tested for immutability |
| 20 | Distribution preparation | **Partial** — tracker exists; no integrations, none claimed |
| 21 | Series publishing | **Partial** — series and shared canon exist; no series publish dashboard |
| 23, 24 | Living-author policy; predefined vocabulary | **Built** — policy enforced by a test |
| 25, 26 | My Author Voice; uploaded sample | **Built** — measured, text discarded |
| 27 | Free-form style request | **Blocked** — AI layer |
| 28 | Style Mixer | **Built** |
| 29 | Style transformation workflow | **Blocked** — the transformation step is AI |
| 30, 31 | Style Profile system and reuse | **Built** — library-scoped, `projectId: null` |
| 32 | Style + story integration | **Partial** — drift against the book; not per-chapter yet |
| 33 | AI Editor roles | **Blocked** — AI layer |
| 34 | Author control, canon status | **Built** |
| 35, 51 | Security and data isolation | **Blocked** — see below |
| 36 | Version control | **Built** |
| 37 | Decision Log | **Built** |
| 38, 39, 42, 43 | UX, design system, responsive, accessibility | **Partial** |
| 45 | Error handling — never claim a success that did not happen | **Built** in Export |
| 47 | Configurability — no hard-coded prices or limits | **Built** — one `PLANS` structure |
| 54 | Definition of Done | **See below** |

## §2 and §52 were a defect, not a feature request

The seed created "ECHO 2084" and "ECHO 2084 — Demo Fixture" projects, so a clean
account opened carrying the author's own novel. That is precisely the line
between a platform and one writer's tool.

Fixed: the demo is now "The Last Signal — Demo Project" with an invented cast,
every seeded project is labelled a demo, every seeded record is provisional
rather than canon, and loading it is an explicit action. Two tests enforce this —
one serialises every record type and fails if ECHO 2084 or its cast appears,
another fails if any seeded project is unlabelled or claims canon.

## §35 and §51 cannot be satisfied in this architecture

"User A cannot access User B's project" has no meaning in an application with no
users. Every data-isolation test in §51 is a **server-side authorization test**,
and authorization needs a server.

This is not a gap to schedule. It is the architectural fork the root README has
recorded as undecided since the beginning: accounts, storage, sync and billing.
Until it is decided, §17, §18, §27, §28, §33 and §35 are all one blocked item
wearing six hats.

Today's honest privacy claim is stronger than the one §35 describes, and worth
keeping while it is true: **the manuscript never leaves the machine.** No server
holds it, so no server can leak it. That stops being true the day accounts exist.

## §54, read carefully

The Definition of Done requires, for each feature: UI, database model, API,
authentication, authorization, error handling, validation, versioning, tests,
responsive behaviour, accessibility, security review, monitoring and
documentation.

Of those fourteen, this repository can currently satisfy nine. **Authentication,
authorization, API and monitoring are all the backend.** Applying §54 literally
means nothing in PRD #2 is "done" until that decision is made — which is a
reasonable standard, and it should be said out loud rather than discovered at the
end of a build.

## What the exports actually are

EPUB and DOCX are both ZIP archives of XML, so `assets/js/zip.js` writes ZIP
directly — CRC-32 verified against the standard check value, every entry stored
uncompressed, the EPUB mimetype first as the specification demands. No
dependency, which matters because the application still has to build into one
file that opens with no package manager.

The DOCX is verified by a round trip: it is read back with this application's own
`.docx` importer. If our reader cannot read what our writer produced, Word
probably cannot either.

**PDF is deliberately not implemented.** It is produced by printing the
print-ready HTML from the browser. Embedding a PDF engine would add megabytes to
a file whose selling point is that it is one file, and a generated PDF that
quietly gets its margins wrong is worse than no PDF at all.

## What is claimed, and what is not

PRD §5 asks for "Writeline validation checks passed" rather than "ready for
publication". That language is enforced by a test: the overall verdict can only
be `WRITELINE CHECKS PASSED`, `REVIEW SUGGESTED` or `ACTION REQUIRED`, and a test
fails if it ever matches /ready for publication|will be accepted|guarantee/.

Likewise §15: the cover is recorded by filename. Writeline does not claim a cover
meets any printer's specification, because it has not measured one.
