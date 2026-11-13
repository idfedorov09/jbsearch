# Design

## Context

The 0.4.5 jobs followed ADR 0018's strictly sequential upload-and-check loop.
Their logs show long intervals between publisher messages and confirmations,
but the interval includes an unmeasured CLI shutdown phase and cannot establish
whether gallery indexing, the network or verification was responsible. The
existing verifier checks an exact target, channel and digest on both registries;
Open VSX also follows a restricted digest redirect chain. See the proposal for
the confirmed scope and the delta spec for externally observable behavior.

## Goals / Non-Goals

The goal is to shorten the possible critical path while maintaining a single
writer, a fallback-first gate and fail-closed recovery. Real latency improvement
is a hypothesis, not an acceptance criterion for offline tests. Do not modify
branch guards, protected environments, credentials, channels or package content.
Do not perform registry writes or infer native-platform support during local
verification.

## Decisions

### One writer, independent verifiers

Preflight all seven local VSIX files before any write. Upload universal, then
block on its exact verification. Afterwards, initiate one target upload at a
time; after a proven successful upload, start its background exact verification
and allow the next upload to begin. A completed background failure is latched
before starting any new upload. An already-running upload cannot safely be
assumed cancelled; include it in the final results. Settle every background
check and report all confirmed, uncertain and not-attempted targets. Only the
complete exact matrix permits a successful exit.

Sequential upload-and-verify is safer to reason about but serializes the entire
propagation interval. Parallel writes would create a less predictable partial
release, may provoke registry conflicts, and are explicitly out of scope. The
result remains non-atomic and gallery processing may still serialize internally.

### Duplicates and ambiguous outcomes

A CLI exit that can mean either upload or duplicate skip is not proof of a new
upload; a duplicate with mismatched bytes must not allow later writes. Remove
`--skip-duplicate` from matrix publishing. The pinned `vsce` CLI can also
suppress cancellation errors and exit zero, so a controlled child invokes the
public `publishVSIX` API and sends an acknowledgement only after it resolves;
the parent requires both acknowledgement and successful process close. A
missing acknowledgement remains ambiguous. An upload failure (including an existing version or an unknown outcome)
requires exact verification of the affected target before another upload. A
match allows continuation even if the upload CLI failed; an unconfirmed target
stops further uploads. Do not parse raw third-party output or infer a duplicate
from an exit status. If an upload-success status is not demonstrably
unambiguous for a route, that route must retain the exact-verification gate
before the next write rather than assuming acceptance.

### Bounded requests and safe diagnostics

All overlapping verifiers share a concurrency limit for public registry HTTP
requests, including Open VSX metadata, digest requests and redirects. A slot is
held until the response body is consumed or cancelled, but not while a retry
sleeps. Retry limits remain finite and the existing exact identity, target,
channel and digest checks remain unchanged. Promise failures are observed as
soon as they occur and all launched checks are awaited.

Mark the actual child process close and separately time each verification.
Report retry attempts through a small allowlist of reason classes; unrecognized
or untrusted exceptions become a generic class without echoing error strings,
URLs or tokens. Preserve the Open VSX token wrapper's suppression of
untrusted CLI output and fail-closed HTTP guard. Do not label the entire
verification interval gallery processing time: it also includes network and
local work.

### References

- [ADR 0018](../../../docs/adr/0018-platform-gallery-publication.md) and
  [ADR 0019](../../../docs/adr/0019-overlapping-publication-verification.md)
- [Node.js child process `close` event](https://nodejs.org/api/child_process.html#event-close)
- [VS Code platform-specific packages](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions)
- [Open VSX registry API](https://github.com/eclipse-openvsx/openvsx/wiki/Registry-API)

## Risks / Trade-offs

- **No transaction or automatic rollback** -> stop known-failed work, drain
  started checks, and retain a complete partial/uncertain account for operators.
- **Registry consistency or contention** -> the new scheduling might not reduce
  duration; measure only on a separately authorized future release.
- **False continuation on duplicate** -> do not trust a skip or failure without
  exact record verification; preserve sequential gating when exit semantics are
  not proven.
- **Leaking credentials through diagnostics** -> allowlisted classifications,
  synthetic-secret tests and the unchanged guarded token publisher.
- **Late asynchronous errors** -> attach rejection handling immediately and
  await all launched work before reporting.

## Migration Plan

Implement and test locally on `dev`. A later separately authorized commit,
branch transfer and publication retain the existing release routes and require
their usual review and environment controls. If the approach is later
reverted, future runs can return to the older sequential loop, but a partial
release already sent to a gallery cannot be rolled back by changing code.
