# ADR 0019: Overlap platform publication verification

- Status: Accepted
- Date: 2026-11-14
- Extends: [ADR 0018](0018-platform-gallery-publication.md)

## Context

ADR 0018 establishes all-package preflight, a universal-first release, exact
per-target checks and conservative duplicate recovery. In the 0.4.5 pre-release
runs, the sequential publish-and-verify loop spent substantial time between CLI
messages and exact confirmations. Those logs do not separate actual process
shutdown from registry verification, and cannot attribute the wait to gallery
processing alone. The currently observed delay does not guarantee that
parallelizing independent verification will shorten a future release.

## Decision

Keep all local checks before any upload. Publish universal and require its
exact confirmation before attempting any other target. Continue to upload the
six platform targets one at a time; after an unambiguous successful upload,
run its exact verification concurrently with subsequent sequential uploads.
Limit active HTTP verification requests and release slots during retry delays.
Exact ID, version, platform, channel and digest remain mandatory for all seven.

A skip or upload error is not evidence of an exact match. Matrix publication
does not pass `--skip-duplicate`. The pinned Marketplace CLI can exit zero on a
`Canceled` or `Cancelled` error, so the controlled Marketplace child invokes
the public `vsce.publishVSIX` API and acknowledges only after its promise
resolves; the parent also requires a successful process close. A missing
acknowledgement is inconclusive. After an upload failure or any otherwise ambiguous result, block the
next upload until the exact record is proved identical. If that proof is not
available within bounded retries, stop starting new uploads. A known background
verification failure also stops new uploads. Already-running uploads and
verification tasks must be accounted for, and started verification must settle
before logging confirmed, uncertain and not-attempted targets. No gallery write
is rolled back automatically.

Log actual CLI process completion and separately measure registry verification.
Retry diagnostics use safe fixed categories rather than raw third-party errors;
the token publisher retains its output suppression and fail-closed HTTP guard.
Keep the same event guards, trusted publishing modes, protected environments,
release versions, channel markers and target list. No stable or pre-release
publication is authorized by this local decision.

## Alternatives

- Keep upload and verification fully sequential: simpler but leaves every
  verification wait on the critical path.
- Upload targets concurrently: harder to control and audit after a partial
  failure, and not required to overlap registry checks.
- Treat duplicate skip or process success as exact confirmation: unsafe when a
  conflicting version already exists or when gallery metadata is stale.
- Weaken exact checks, extend retries indefinitely, or bypass the Open VSX guard:
  rejects existing safety boundaries and is not acceptable.

## Consequences and limits

A future release may complete faster only if the gallery processes records
independently and verification wait is significant. Offline tests can prove
ordering, request limits, failure accounting and safe logs, not real gallery
speed or client selection. A failure discovered during another upload can leave
multiple uncertain targets; operators must inspect each exact record and hash
before a separately authorized retry. No claim is made about Windows, macOS or
Remote acceptance. Reverting this decision affects later runs, not packages that
have already been uploaded.

## References

- [Overlapping verification change](../../openspec/changes/overlap-platform-verification/)
- [Node.js child process `close` event](https://nodejs.org/api/child_process.html#event-close)
- [VS Code platform-specific packages](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions)
- [Open VSX registry API](https://github.com/eclipse-openvsx/openvsx/wiki/Registry-API)
