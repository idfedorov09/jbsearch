# Proposal

## Why

The README currently describes search and replacement without showing the
actual interface. The user supplied three screenshots and requested that they
appear in the extension's Marketplace description.

## What Changes

- Add the supplied screenshots for the floating search dialog, native results,
  and replace workflow to a dedicated images directory. Use the later replacement
  screenshot supplied by the user for Replace Workflow.
- Show them in that order under the three headings specified by the user;
  preserve the English README policy and the placeholders for future demo GIFs.
- Place the subsequently supplied hero GIF near the top of the README.
- Verify the source images, README references, and VSIX contents and links.

Confirmed scope: README presentation, the supplied static images and hero GIF,
this OpenSpec change, and the separately authorized commit and push to `dev`.
There are no open product-design questions. Producing additional GIFs, runtime
behavior, dependencies, branch transfers, and Marketplace publication were not
requested. Marketplace appearance can only be verified after a separately
authorized publication, and requires image URLs available on the repository's
default branch.

## Capabilities

### New Capabilities

None; this is a documentation and artwork change.

### Modified Capabilities

None; existing product behavior and capability requirements do not change.

## Impact

Root README, `images/hero.gif`, `images/screenshots/`, and this change. The
images are included in the VSIX; no additional dependencies or platform-specific
behavior are added.
