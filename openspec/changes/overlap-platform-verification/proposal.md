# Proposal

## Why

In the 0.4.5 pre-release runs, publication waited for every registry check
before starting the next target. The observed waits made the seven-package
release slow, although the logs do not distinguish CLI shutdown time from
registry propagation or transport failures. Overlapping independent verification
may reduce the critical path without issuing concurrent writes.

## What Changes

- Retain all-package preflight and a universal-first exact-verification gate;
  upload the other targets sequentially while overlapping their exact checks.
- Bound in-flight HTTP requests, without occupying a request slot during a retry
  delay, and never report success until every exact check has succeeded.
- Resolve ambiguous upload outcomes against the exact existing record before
  issuing any later upload; stop on known failures, drain started checks, and
  report confirmed, uncertain and not-attempted targets honestly.
- Add secret-safe CLI-completion and verification diagnostics. Keep both
  galleries' existing routes, authorization and protected environments.
- Test with local fakes only; assess actual time savings separately on a future,
  independently authorized publication.

## Capabilities

### New Capabilities

- `platform-gallery-publication`: Add bounded overlapping verification and
  diagnosable partial-failure handling to the gallery-publication capability.
  Its earlier full requirements are in the still-unarchived
  `publish-platform-packages` change; no main spec exists yet.

### Modified Capabilities

None in `openspec/specs/`.

## Impact

This affects the publication orchestrator, verifier, their tests, release
instructions and an ADR. It does not change the extension's runtime behavior,
package targets, version or channel, nor does it add a publication trigger. The
user authorized local implementation on `dev` only; a commit, push, merge,
release and any real-registry performance measurement require separate
approval. No platform or Remote runtime acceptance is implied.
