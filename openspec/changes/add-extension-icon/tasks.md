# Tasks

## 1. Icon and documentation

- [x] 1.1 Preserve the SVG, export a 256×256 PNG, reference the manifest icon, and update README/changelog/release checklist; visually inspect the PNG and compare the SVG with the attachment.
- [x] 1.2 Add icon checks to the package verifier; confirm that the VSIX includes the PNG matching the source asset, excludes the SVG from docs, and save a separate report for the new package.

## 2. Validation

- [x] 2.1 Run check/test/spec:check/package and review the diff; record the results and explicitly state that the card in real VS Code was not checked manually.

## Workflow follow-up

- Deliver the completed change through a commit and push only to `dev`; check CI for the pushed HEAD.
- Manual check: after Reload Window, open the JB Search card in Extensions and inspect its icon. Do not present PNG inspection or archive verification as this GUI check.
- Archive after review; public release and `master` require separate actions.
