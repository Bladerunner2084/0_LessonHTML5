# Selling this

Practical notes for putting the single-file build in front of buyers. Nothing
here needs money to start.

## Read this first: the repository is public

Anyone can clone this repo and run `node build.mjs` themselves. **You cannot
meaningfully sell software whose source is public**, so decide which of these
you are doing before you list a price:

1. **Make the repository private.** Simplest. You keep the portfolio value by
   describing the work publicly and sharing the repo privately with anyone who
   asks to see it (recruiters included).
2. **Leave it public and sell convenience.** A built file, a landing page, and
   updates are worth something to a novelist who will never open a terminal.
   Real, but a thinner proposition and easier to undercut.
3. **Leave it public and do not sell the software at all** — sell the *audit*
   instead (see below), using the tool as your instrument.

Option 3 is the fastest route to a paying customer and the only one that also
tells you whether the continuity findings are any good.

## If you sell the file

**What you list.** `dist/novel-platform.html` — one file, produced by
`node build.mjs`. Do not zip it. A zip adds a step and a support email.

**Where.** Gumroad, Payhip and Lemon Squeezy all take a file, a price and a
payout account, with no monthly fee. Compare their cut and their handling of
sales tax / VAT — the one that acts as merchant of record for you is worth a
higher percentage, because it removes the tax registration problem entirely.

**Price.** Scrivener anchors this market at roughly $60 once, and every buyer
knows it. Below about $15 people assume it is a toy; above Scrivener you are
arguing against fifteen years of reputation. Somewhere between is defensible.
Start lower than feels right — you are buying information, not revenue.

**Refunds.** Offer them without argument. A digital file cannot be returned, the
refund rate on honest listings is low, and one public complaint costs more than
the refunds do.

**The listing copy is already written.** `landing/index.html` — including the
"what it does not do" section. Do not delete that section. It is doing more work
than the feature list: it filters out the buyers who would have refunded.

## If you sell the audit instead

Offer a fixed-scope **continuity and reader-knowledge report** on a finished
manuscript. You run it through the app, read the findings, write them up as
prose an author can act on.

- Price it as a narrow service, well under a full developmental edit.
- Fix the scope in writing: what you check, what you do not, how long it takes.
- Do the **first two free**, in exchange for permission to quote the result.
  You need testimonials and you need to find out whether the findings hold up
  against real books more than you need the first fee.

This is the only path that validates the tool and pays in the same motion.

## First customers

Writers gather in places that are easy to find and easy to get thrown out of.
Read each community's self-promotion rules before posting, and post as a writer
with a tool, not as a vendor. The pitch that works is the problem, not the
feature list: *"your reader forgot what you told them in chapter four"* is a
sentence novelists recognise instantly.

Three sales is the number that matters. Not because of the money — because three
strangers paying means the problem is real, and zero means it is not.

## Spend nothing yet

No domain, no company, no ads, no paid tools. GitHub Pages hosts the landing
page free, the build has no dependencies, and the storefronts take their cut only
when you are paid. Add costs after revenue, never before.
