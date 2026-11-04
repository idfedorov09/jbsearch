# Tasks

## 1. README screenshots

- [x] 1.1 Copy the three supplied screenshots into `images/screenshots/`, using the latest attachment for Replace Workflow; verify each file is byte-for-byte identical to its corresponding attachment.
- [x] 1.2 Add the three requested README headings, images, and descriptive alt text in the requested order; verify the mappings and retain the future GIF placeholders.
- [x] 1.3 Copy the supplied hero GIF unchanged to `images/hero.gif`, insert it at the hero placeholder with alt text, and verify the three demo GIF placeholders remain.

## 2. Integration verification

- [x] 2.1 Render the README locally and verify all three images, including the updated replace screenshot, load in order on desktop and mobile, without horizontal overflow.
- [x] 2.2 Build an isolated VSIX in `/tmp`; verify the final images are packaged unchanged and that README image URLs are rewritten to the expected public GitHub paths.
- [x] 2.3 Run relevant project checks and OpenSpec validation, inspect the diff, and record the actual results and release limitation.
- [x] 2.4 Verify that the GIF is animated and renders in the local README; build an isolated VSIX and verify all four assets and their rewritten links, then run appropriate checks and record results.

## Workflow follow-up

- After a separately authorized transfer to `master` and Marketplace release, open the extension listing in real VS Code and confirm that all three screenshots display.
- The user authorized committing and pushing the README, supplied images, and this change to `dev`; transferring branches and publishing require separate authorization.
