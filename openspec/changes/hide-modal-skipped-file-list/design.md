# Design

## Context

The worker retains bounded structured skip details. The controller currently
formats them into one diagnostic string used by both surfaces; the webview
renders that full string as text. See `proposal.md` for the requested correction
and [ADR 0010](../../../docs/adr/0010-binary-search-exclusion.md) for classification
and completeness rationale.

## Goals / Non-Goals

Keep modal warnings compact without changing classification or replacement
guards. Do not delete diagnostics, add settings, change the client bridge,
change native modal APIs, or claim platform acceptance.

## Decisions

- Add an internal summary-only option to the existing formatter. Its default
  detailed output and full-statistics classification remain unchanged; summary
  output stops before path or omitted-detail lines. Do not parse diagnostic text
  in the webview or infer safety from displayed text.
- Keep a separate summary string in session snapshots. Initialize, reset, transfer,
  and roll it back together with detailed diagnostics. Only the summary is
  rendered by the modal; Find Panel continues using the detailed string.
- Retain the existing webview `textContent`/`hidden` rendering. No VS Code API
  changes or additional dependencies are needed. The native modal and panel
  architecture in ADRs 0007/0008 is unchanged.
- Prepare 0.4.1 as a corrective presentation patch against published 0.4.0.
  Moving optional detail review to the existing Find Panel is an explicit UX
  trade-off requested by the maintainer, not a new setting or a changed mandatory
  safety step. Document that destination instead of implying details remain in
  the modal. The client component is unchanged at 0.1.0.

## Risks / Trade-offs

- Hidden paths are less immediately discoverable: the README and release note
  identify Open in Find Panel as the existing detail-review route.
- Summary and details could diverge during reset or transfer: regressions cover
  their common lifecycle and stale-generation rejection.
- VM/browser checks are not native acceptance: record the real VS Code checklist
  separately and retain the known sandbox/platform limitation.

## Migration Plan

No configuration or stored-session migration is needed; sessions are in memory.
Use a separate reviewed `dev` to `beta` PR linked to issue #3. Do not reuse 0.4.0,
change `master`, or merge/publish without separate release authorization.
