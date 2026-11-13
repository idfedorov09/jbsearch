# Design

## Context

See the proposal and specification. The existing release jobs publish a single
universal VSIX; the separate build-only matrix is not a publication gate.
ADRs 0009, 0015 and 0017 capture current authentication and build boundaries.
A gallery release can be partly visible before all target uploads finish.

## Goals / Non-Goals

Produce and check all seven files before any upload, and publish them
sequentially with an exact remote verification following each attempt. Preserve
the existing event guards, protected environments and authentication choices.
Do not publish, change a version, claim client-selection behavior, or infer
Windows/macOS/Remote acceptance from local validation.

## Decisions

### Matrix publication and ordering

Each existing check and publish job builds the verified matrix for its own
channel. The publish job builds before its first upload and processes the
universal fallback first, followed by the six explicit targets. This minimizes
the period without a fallback but is not transactional: if a later target
fails, already published packages remain visible. A shared script enumerates
only the allowlisted names; arbitrary files or root globs are not published.

### Exact verification and bounded retries

Each package is checked locally and then uploaded or skipped as a duplicate.
The registry is queried for the exact version and target; identity, stable or
pre-release marker and SHA-256 must match. A target-specific response cannot
be substituted with a universal fallback. Retry delayed metadata with a bounded
wait; log confirmed targets and make uncertain/partial state explicit on failure.
Duplicate skips never themselves prove success. See the
[Open VSX API](https://github.com/eclipse-openvsx/openvsx/wiki/Registry-API)
and [VS Code target publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions).

### Reproducible builds and recovery

Both stable and beta workflows set `SOURCE_DATE_EPOCH` to the checked-out
commit timestamp before preparing the nested UI VSIX or the outer matrix, using
the existing validated shell logic. The generated client cache records its build
epoch so a VSIX prepared with a different epoch is rebuilt rather than reused.
Reproducibility also depends on identical
source, dependencies, Node, tools and environment. A retry must compare remote
records to locally built hashes, never overwrite a differing artifact, and
stop for investigation if identity or content differs.

### Authentication and routing

Keep Marketplace OIDC, Open VSX token and explicit stable trusted mode, the
same `marketplace` and `open-vsx` environments, and the existing job guards.
Keep the pinned Open VSX CLI's token transport guard and validate matrix names.
No authentication fallback is introduced. The trusted CLI retains its existing
independent security limitations from ADR 0015.

## Risks / Trade-offs

- **No atomic release** → publish the fallback first, verify sequentially,
  report partial/uncertain outcomes and document investigation and retry.
- **Delayed metadata** → bounded retries; a timeout is a failure that can occur
  after a successful upload, not proof of rollback.
- **Target selection differs by client** → retain universal, but require
  separately authorized real registry and editor checks.
- **Builds differ across environments** → use a fixed epoch and lockfile, test
  repeated local builds, and compare exact digests rather than assuming equality.
- **Token leakage** → retain the pinned guard, suppress untrusted output on the
  token route, and test with synthetic secrets and mock requests.

## Migration Plan

Implement and verify locally on `dev`; no external side effects. After separate
approval, review the release version, source history, gallery state and protected
environments before transferring the changes. A future release must be separately
authorized. The already published universal 0.4.4 is not overwritten. If the
workflow fails partway, inspect both registries and exact digests before retrying
or deciding on a new release number; rolling back a workflow cannot unpublish
already uploaded packages.
