# rewrite-readme-in-english

Rewrite the main README in English using the agreed structure and establish the language for future edits.

Historical scope note: this change established English for the root README only.
The repository-wide English policy in adopt-english-project-language supersedes
that narrower policy; the results below record the original change.

## Results and validation — 2026-11-04

- README is entirely in English; 11 second-level sections follow the user's
  order. Hero and three demos are marked by four HTML comments without broken images.
- 17 links parsed; local targets and the internal Installation anchor exist.
  Requirements/version and main shortcuts checked against the manifest; New Line
  checked against media/search.js.
- English for the root README was established in AGENTS.md, CONTRIBUTING.md,
  and openspec/config.yaml; OpenSpec artifacts retained Russian at that time.
- `npm run check` and `git diff --check` passed.
- `npm test`: 146/146; `npm run spec:check`: 9/9, including this change.
- No new persistent text tests were added. Runtime, dependencies, and version
  remained unchanged; GUI and VSIX packaging were not performed for this task.

## Materials still needed from the user

- A Hero GIF and three demo GIFs.
- A confirmed Marketplace link after publication. Install currently leads to
  actual VSIX/source installation instructions.
- A financial-support link, if desired. Support development currently suggests
  a GitHub star, feedback, and platform checks.
- Additional roadmap product priorities, if needed: the current list contains
  only existing open platform checks and release preparation, without deadlines.
