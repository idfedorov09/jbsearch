# Design

## Context

See proposal.md. The user supplied five broad roadmap areas. Existing project
records separately track unfinished macOS, Windows, and physical Remote SSH
verification; they do not define concrete new features for the other areas.

## Goals / Non-Goals

Describe the user-selected directions without inventing features, deadlines, or
implementation commitments. Keep detailed verification in the release checklist.
This change does not enable Discussions, publish a release, or alter `master`.

## Decisions

- List the five requested areas concisely and explain that individual features,
  priorities, and timing remain subject to planning.
- Link to GitHub Issues for suggestions and reactions. On 2026-11-04, repository
  metadata reported Issues enabled and Discussions disabled; do not link to a
  disabled Discussions page or change repository settings.
- Preserve the release-checklist link so open platform checks remain discoverable.
  The default GitHub branch is `master`; the requested push updates `dev` only.

No new ADR is needed for this documentation-only change; architectural
decisions remain in [docs/adr](../../../docs/adr/README.md).

## Risks / Trade-offs

- Broad wording may be mistaken for detailed commitments → state that specific
  features and timing are subject to planning.
- Feature feedback in Issues is less discussion-oriented than Discussions →
  users can suggest and react to requests without enabling a new repository feature.
