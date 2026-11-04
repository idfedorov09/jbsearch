# Design

## Context

See proposal.md. The repository already contains a branded icon and a real
search dialog screenshot. GitHub repository social images are configured
separately from tracked files; see the [GitHub documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).

## Goals / Non-Goals

Produce an identifiable, editable, minimal social card using the existing
assets. Do not redesign the extension icon, change runtime behavior, change
repository settings, or promise how individual social platforms display cards.

## Decisions

- Compose the cover as a fixed-size HTML/CSS source in `.github/` using the
  existing icon and a crop of the real screenshot. This retains editable text,
  layout, and linked assets without adding a runtime dependency or fabricating
  a different product interface.
- Render a 1280 × 640 PNG with a dark background, readable branding,
  concise tagline, and a framed UI crop. The exported image must be under 1 MB.
- Inspect the output both at full resolution and at a representative reduced
  size, and verify dimensions, size, and the existing asset references.
- Keep artwork in `.github/`, which `.vscodeignore` excludes from the VSIX.
  No ADR is needed; existing architecture is documented in [docs/adr](../../../docs/adr/README.md).

## Risks / Trade-offs

- Small link previews can make a full screenshot unreadable → emphasize the
  logo and headline, and crop the real dialog to its most recognizable region.
- Social services may cache or crop previews → verify the file independently;
  actual platform rendering is a separate check after GitHub settings are updated.
- Repository files do not change Social Preview automatically → provide the
  exact settings path and make no claim that the image is already installed.
