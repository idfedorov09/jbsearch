# README cleanup and search keywords

## Result — 2026-11-04

- Removed three obsolete GIF TODO comments from the root README. The hero GIF,
  three demo screenshots, and their descriptions remain in place.
- Added the 11 requested search and productivity keywords to the main extension
  manifest. The extension version, dependencies, and runtime code are unchanged.

## Verification

- The source manifest contains the exact requested keyword list; all four demo
  media files exist and the obsolete TODO comments are absent.
- `npm run check` passed; `npm test` passed 195/195, with no skips.
- `npm run spec:check` passed 16/16; `git diff --check` passed.
- `npm run prepare:client` prepared the bundled client extension. An isolated
  VSIX was built with `vsce package --out <temporary-path>` and passed
  `scripts/verify-package.js`: 77 main entries and 31 client entries.
- The isolated package contains the exact keyword array, all 11 corresponding
  gallery tags, the README, and its hero and three demo images.
- The pre-existing `jbsearch-0.2.1.vsix` in the repository root retained the
  same SHA-256 before and after the isolated package build.

No real VS Code or Marketplace listing was opened for this documentation and
metadata change. The effect on Marketplace search can be checked after a
separately authorized publication.
