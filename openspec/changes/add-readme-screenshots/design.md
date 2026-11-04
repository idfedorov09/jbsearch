# Design

## Context

See the proposal. VSCE uses the repository URL from `package.json` to rewrite
relative README image links to GitHub `raw/HEAD` URLs, while including image
files in the VSIX. At the time of this change, the public repository's default
branch is `master`; normal work takes place on `dev`. The existing publication
process targets `master` as described in [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md).

## Goals / Non-Goals

Keep the README directly readable from the repository, package all four images,
and make the resulting Marketplace image paths verifiable. Do not change the
release workflow or claim that the Marketplace listing has been published.

## Decisions

1. Store the provided PNGs without cropping, resizing, or recompression under
   `images/screenshots/`; use descriptive file names and alt text. This keeps
   room for the user's future GIFs without moving the current extension icon.
   The latest supplied Replace Workflow image replaces the earlier attachment;
   the floating search and native results images retain their original mappings.
2. Add the exact requested level-two headings in the requested order after
   `Demo`, preserving the three inline GIF placeholders. Place the supplied
   `images/hero.gif` at the former hero placeholder without re-encoding it.
   Relative Markdown image paths keep the source README easy to preview locally.
3. Use normal VSCE packaging and inspect the actual VSIX. Relative paths become
   GitHub `raw/HEAD` URLs; they resolve to `master` at this point in time. Avoid
   hard-coding `dev`, which would make stable releases depend on mutable dev
   content. Publication requires the images to exist on the default branch.

## Risks / Trade-offs

- Until the hero and screenshots reach `master`, VSCE's generated `raw/HEAD`
  URLs cannot serve them → report this prerequisite and do not claim a live check.
- Published README rendering and the Marketplace page cannot be verified in a
  local preview → separately check them after an authorized release.
- Existing uncommitted work touches README → make a targeted edit and preserve
  all unrelated changes.
