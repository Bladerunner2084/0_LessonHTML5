# Moving Writeline to a clean repository

This repository began life as a 2018 HTML learning exercise and is a test build.
Nothing in its history is worth carrying. The working tree is.

## What travels

Everything tracked — around 60 files, 700 KB, **no dependencies at runtime and
one devDependency (Playwright) used only by the browser tests.** There is no
build output to copy: `dist/` is generated and git-ignored.

## What does not

- The git history (a 2018 README and this session's branch)
- `dist/` — regenerate with `node build.mjs`
- Nothing else. There are no machine-specific paths, no hardcoded repository
  name, and no reference to the old owner anywhere in the tracked files. That is
  verified rather than assumed:
  `git ls-files -z | xargs -0 grep -l "/opt/\|/home/"` returns nothing.

## The move

```bash
# 1. Create the new empty repository on GitHub, then:
git clone --depth 1 <old-repo-url> writeline-export
cd writeline-export
rm -rf .git                      # the old history does not come with us

git init -b main
git add -A
git commit -m "Writeline: initial import from the test build"
git remote add origin <new-repo-url>
git push -u origin main
```

## Then, in the new repository

1. **Settings → Pages → Source: GitHub Actions.** One dropdown. Not "Deploy from
   a branch."
2. Push to the default branch. The workflow runs all 268 tests, builds the
   single-file distributable, and deploys `landing/`.

The deploy job compares against `github.event.repository.default_branch` rather
than a hardcoded name, so it works whether the new repository uses `main` or
`master`. An earlier version hardcoded `master`: in a fresh repository that runs
the tests, reports success, and silently never deploys.

## Verify the move in the new repository

```bash
node tests/smoke.mjs        # 37   graph, canon, versions, pipeline, pace
node tests/reader.mjs       # 17   the reader model
node tests/script.mjs       # 21   screenplay conversion and export
node tests/voice.mjs        # 24   style measurement and the living-author policy
node tests/io.mjs           # 17   import (real .docx) and search
node tests/api.mjs          # 14   the front-end contract
node tests/publishing.mjs   # 19   readiness, EPUB, DOCX, snapshots
```

Those seven need **nothing installed** — plain Node, no `npm install`. Then:

```bash
npm install                 # Playwright, for the browser suites only
npx playwright install chromium
node tests/landing.mjs      # 23   the marketing site
node tests/browser.mjs      # 86   the app in a real browser
node build.mjs && node tests/dist.mjs   # 10  the built file, offline, via file://
```

Playwright is now located at runtime — a project install, then `npm root -g`,
then a `PLAYWRIGHT_MODULE` override — and the suites skip cleanly when it is
absent rather than failing. The browser suites bind port 0, so they never
collide with a dev server.

**268 tests. If any fail after the move, the move is the cause** — they all pass
here, on this commit.

## Decide before the first public push

**Public or private.** The repository contains the entire application, so a
public repository means the product is free to anyone who can run `node
build.mjs`. That is a coherent choice if the thing being sold is the audit
service rather than the software — but it has to be a choice, not a default.

If private: GitHub Pages charges for private repositories. Cloudflare Pages,
Netlify and Vercel all deploy from a private GitHub repository on their free
tiers. Point any of them at the `landing` directory.

## Known state at the time of transfer

- **Working and tested:** the whole engine, both bibles, timeline, revelations,
  chapters and scenes, manuscript, screenplay, Reader Simulator, Style Studio,
  continuity and reader audits, Draft Vault, deadlines, import, search,
  Publishing Center with EPUB/DOCX export and immutable candidates, the
  marketing site, and the single-file offline build.
- **Not built, and marked as such throughout:** everything requiring the AI
  layer, and everything requiring a backend — accounts, sync, billing, and the
  data-isolation requirements of PRD #2 §35 and §51.
- **Specification drift:** seven shipped features appear in no PRD. See
  `docs/spec-gaps.md` before handing another document to Figma Make.
