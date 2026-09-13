# Writeline — acquisition experience PRD (addendum)

Landing page, pricing, signup, onboarding and tutorials, as a first-class part of
the product rather than a separate design exercise.

**This file is the specification.** What is actually implemented, and what is
blocked on infrastructure that does not exist, is recorded in the status column
below so nobody — Figma Make, a future session, or you in three months — builds
against a promise.

## Status of every section

| § | Section | Status |
|---|---|---|
| 1–16 | Landing page, positioning, feature showcase, demo, pricing display, FAQ | **Built** — `landing/index.html`, static, no dependencies |
| 17 | Sign-up flow | **Blocked** — needs accounts, which need a backend |
| 18 | Onboarding after signup | **Blocked** — same |
| 19–26 | Tutorial system, tutorial centre, contextual help, help centre | **Not started** — see the note on scale below |
| 24 | "The Last Signal" demo project | **Superseded** — the ECHO 2084 demo fixture already does this job |
| 27 | Account / billing / subscription | **Blocked** — needs a payment processor and a backend |
| 28 | Free-to-paid conversion UX | **Blocked** — needs plans, which need billing |
| 29–31 | Shared design language, responsive, conversion principles | **Built** into the landing page |
| 32–33 | Three-layer architecture | Layer 1 built; layer 2 not started; layer 3 is the existing application |

## Four things worth deciding before Figma Make starts

### 1. The prices are invented, and there are four of them

$0 / $19 / $39 / $79 are placeholders. The market they enter is anchored by
Scrivener at roughly $60 **once**, and buyers know that number. Four tiers before
a single customer exists means four guesses about what people will pay for,
guessed by the person least able to be objective about it.

The landing page therefore renders pricing from **one data structure**
(`PLANS` in `landing/index.html`), so changing a price, a tier, or the whole
model is an edit to a list rather than a redesign. Treat the current tiers as
illustrative until someone has paid.

### 2. Several gated features do not exist

The tiers gate AI Editor, Red Team, Foreshadowing Engine, Promise/Payoff Tracker,
Character Lock and Advanced Audits. **None of these are built**, and all of them
wait on the AI-transport decision recorded in the README.

Marketing copy that implies otherwise is not a positioning choice — it is a
refund generator, and for a paid product it is a misrepresentation. Every unbuilt
feature on the landing page is therefore marked `Planned`, visibly, and the FAQ
says plainly what exists today.

### 3. The tutorial system is bigger than the application

Twelve interactive tutorials, five tutorial categories, a thirteen-category help
centre and a professional learning path is **months of content work** — writing,
not design. It is also the section most likely to be built and then never
finished, leaving a half-populated Tutorial Centre that makes the product look
abandoned.

A cheaper version that gets most of the value: **contextual help only** (§23).
One `? Learn` affordance per feature, a paragraph, and a link into the demo
fixture. That is a day of work rather than a quarter, and it answers the question
at the moment the user has it — which is the actual point of §23.

### 4. Signup, accounts and billing are the backend, and the backend is the fork

§17, §18, §27 and §28 cannot be designed away. They require identity, storage,
sync and a payment processor — the architectural fork the README records as
undecided. The landing page is built to work either way: its CTAs point at a
download today and can point at a signup route the day one exists.

## What the landing page implements

Sections 1–16 and 29–31, as one static page with no dependencies:

- Sticky navigation, hero, and the "more than an AI writing tool" comparison
- The seven-step journey, drawn as a single connected line
- Feature showcase, with `Planned` marked honestly
- An interactive product demo — click through Story, Character, Timeline, Scene,
  Audit and watch the panel change
- The canon-status philosophy section (CANON / PROVISIONAL / AI SUGGESTION /
  NON-CANON), which is a real implemented mechanic, not a claim
- Style Studio with a working mixer visual
- Series, audiences, pricing with a monthly/annual toggle, a comparison table,
  FAQ, and the closing CTA
- Desktop, tablet and mobile

## Handing this to Figma Make

`landing/index.html` is a working reference implementation, not a description of
one. It carries the real copy, the real structure, the real responsive behaviour
and the real interaction model. Design against what it does; change what it looks
like.

Two constraints to carry across:

- **The application and the site share one design language** (§29). The app's
  tokens are in `assets/css/app.css`; the landing page restates the same palette
  so a visitor crossing from one to the other does not feel the seam.
- **No gamification** (§25), no "AI magic" clichés, no stock photography. The
  reference points are Final Draft, Adobe and Figma. Instruments.
