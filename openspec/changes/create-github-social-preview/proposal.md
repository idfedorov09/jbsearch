# Proposal

## Why

The repository currently uses GitHub's automatic social image. A dedicated cover
can identify JB Search and show its search interface when the repository is shared.

## What Changes

- Create an editable cover source using the existing logo and an actual search
  dialog screenshot.
- Export a 1280 × 640 PNG under GitHub's 1 MB limit, with the product name and a
  concise English tagline.
- Keep the source and final image in `.github/`, outside the extension package.
- Record how to upload the image in repository settings and verify it afterwards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Artwork does not change extension behavior; this change uses
`skip_specs: true`.

## Impact

The change adds repository artwork and its OpenSpec record. It does not modify
runtime code, package metadata, dependencies, versions, GitHub settings, or the
default branch. The user authorized creating the cover and its source; uploading
the image to GitHub requires the repository's settings interface.
