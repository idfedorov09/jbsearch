# Public roadmap

## Result — 2026-11-04

The README now lists the five user-selected development areas without promising
specific features or dates. It retains the release checklist and links to GitHub
Issues for feedback and reactions. Repository metadata confirmed that Issues
was enabled and Discussions was disabled; no repository settings were changed.

## Verification

- Checked all five roadmap entries and the release checklist path; the Issues
  page returned HTTP 200.
- `npm run check` passed; `npm test` passed 195/195 with no skips.
- `npm run spec:check` passed 17/17; `git diff --check` passed.
- Built a temporary VSIX with `vsce package --out <temporary-path>` and ran
  `scripts/verify-package.js`: 77 main entries and 31 bundled client entries.
  The packaged README contains the roadmap and Issues link.

No real VS Code or default-branch GitHub rendering was tested for this
documentation-only change. The default branch remained `master`; this change
was prepared for the requested `dev` branch.
