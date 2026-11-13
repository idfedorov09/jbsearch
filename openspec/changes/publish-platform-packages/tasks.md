# Tasks

## 1. Exact target and channel verification

- [x] 1.1 Verify Marketplace and Open VSX records by exact identity, version, target, stable/pre-release channel and SHA-256; test universal and all targets, mismatched/fallback records, errors and duplicate skips using synthetic fixtures.
- [x] 1.2 Add bounded retry and partial/uncertain-publication reporting with tests for metadata delay, upload failure, duplicate skip and sequential stop.

## 2. Matrix publication

- [x] 2.1 Publish only the seven pre-verified allowlisted artifacts in deterministic fallback-first order on Marketplace and Open VSX; test fake CLI invocations, all channels and authentication modes without registry publication.
- [x] 2.2 Preserve and test the pinned Open VSX token safety guard when allowing matrix filenames; keep the trusted mode separate and document its existing limitation.
- [x] 2.3 Update the existing release workflows to build and verify the matrix with reproducible timestamps on both channels before publishing; test their event guards, environments, permissions and authentication modes.

## 3. Release documentation and integration

- [x] 3.1 Record the publication decision and partial-failure recovery, target/version identity and unverified gallery/OS boundaries in an ADR and the publishing/versioning guides; validate OpenSpec.
- [x] 3.2 Run `npm run check`, `npm test`, `npm run spec:check`, `npm run package`, stable and pre-release matrix builds, and a repeat-build digest check; record actual outcomes and any limitations without claiming real publication.

## Workflow follow-up

- A later version, review, branch transfer, publication and external client-selection acceptance require separate user authorization and evidence.
