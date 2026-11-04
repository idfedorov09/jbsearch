# README screenshots and hero GIF

## Result

- `Floating Search Dialog` uses `images/screenshots/floating-search.png` (the
  user's third original screenshot).
- `Native VS Code Results` uses `images/screenshots/native-results.png` (the
  user's second original screenshot).
- `Replace Workflow` uses `images/screenshots/replace-workflow.png` (the later
  replacement screenshot supplied by the user).
- All three 3164×2070 PNG files are byte-for-byte copies of the selected
  attachments. The three demo GIF placeholders remain.
- The subsequently supplied `images/hero.gif` is displayed above Why JB Search
  and is a byte-for-byte copy of the supplied GIF.

## Verification — 2026-11-04

- The initial screenshot check verified heading order, image mappings, alt text,
  four GIF placeholders, and the linked ADR; the hero slot was later filled.
- A local Chromium Markdown preview rendered the images on dark and light
  backgrounds and on a 390×844 viewport without horizontal overflow. This was
  not a rendered GitHub or Marketplace listing.
- An isolated `/tmp/jbsearch-screenshots-final.vsix` passed the package verifier:
  76 main entries and 31 bundled client entries. Each packaged screenshot was
  compared byte-for-byte against its source. VSCE rewrote the three relative
  README paths to `https://github.com/idfedorov09/jbsearch/raw/HEAD/images/screenshots/...`.
- `npm run check` passed; `npm test` passed 195/195; `npm run spec:check` passed
  15/15; and `git diff --check` passed. The OpenSpec run included an unrelated
  informational archive warning for an existing Explorer change.

## Hero GIF follow-up — 2026-11-04

- The GIF is 1200×757, 349 frames and 29.08 seconds, and loops continuously.
  Its SHA-256 matches the supplied attachment:
  `2cb5c06702bdaab28ae1da46e0e6adcbf6ceab739fb3a624b01db4d71d5286f8`.
- Local Chromium README previews loaded the GIF in dark and light themes and on
  mobile; screen captures four seconds apart confirmed animation. The three
  existing screenshots and their links also loaded at desktop and mobile widths.
- `/tmp/jbsearch-hero-check.vsix` passed the package verifier (77 main entries,
  31 bundled client entries). All four images matched the sources byte-for-byte,
  and their packaged README links used GitHub `raw/HEAD` paths.
- After adding the GIF, `npm run check`, 195/195 tests, 15/15 OpenSpec checks,
  and `git diff --check` passed.

## Release follow-up

GitHub `HEAD` resolves to the repository's default branch, observed as `master`
at verification. The packaged image URLs will require these files to be present
on that branch. A separate, authorized transfer and publication are needed
before checking the actual Marketplace listing in real VS Code. The user has
authorized committing and pushing this change to `dev`; branch transfer,
publication, and live Marketplace verification have not been performed.
