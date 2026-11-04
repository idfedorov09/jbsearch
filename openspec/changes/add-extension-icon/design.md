# Design

## Context

See proposal.md. The user authorized this change. The SVG contains only geometry,
gradients, and metadata, with no external resources. `.vscodeignore` excludes
`docs/` but includes `media/`.

## Decisions

- Preserve the supplied SVG unchanged at `docs/artwork/icon.svg`; put the
  256×256 raster export at `media/icon.png`. This includes the ready-to-use icon
  in the VSIX while keeping the source available for future work.
- Use the standard manifest `icon` field, without new runtime mechanisms.
  The size follows [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest#fields).
- Do not change the internal UI component or standard command/tree icons: the
  request concerns the icon of the main installable extension.
- Validate the PNG in the existing package verifier: manifest path, presence and
  equality with the source asset, PNG signature, and a square IHDR of at least
  128×128 (the actual export is 256×256). A static asset needs no new dependencies
  or separate UI tests; the ADR architecture remains unchanged.

## Risks / Trade-offs

Installed-extension card cache → check through Reload Window after updating the
source registration; an installed VSIX requires reinstalling the package.

## Migration Plan

Check the image and package, run check/test/spec:check/package, and record the
results; push the commit to `dev` and check CI. Publication is separate.
