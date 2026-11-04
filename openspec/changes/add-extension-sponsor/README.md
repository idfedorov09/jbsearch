# Extension sponsor metadata

## Result — 2026-11-04

Added the user-provided Tribute URL as `sponsor.url` to the main extension
manifest. It matches both existing README donation links exactly, including the
`startapp` query value.

## Verification

- `npm run check` passed; `npm test` passed 195/195 with no skips.
- `npm run spec:check` passed 19/19 in the shared working tree; `git diff --check` passed.
- Built an isolated VSIX with `vsce package --out <temporary-path>` and ran
  `scripts/verify-package.js`: 77 main entries and 31 bundled client entries.
- The packaged `extension/package.json` and
  `Microsoft.VisualStudio.Code.SponsorLink` contain the exact requested URL;
  the VSIX gallery tags include `__sponsor_extension`.

The extension listing was not checked in real VS Code or Marketplace. No
publication or payment was performed. The Social Preview work was handled
separately and was not included in this change.
