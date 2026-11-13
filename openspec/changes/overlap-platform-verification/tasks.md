# Tasks

## 1. Safe bounded verification

- [x] 1.1 Bound concurrent public registry requests through response consumption, release request slots during retry sleeps, and add tests for the limit, redirects, retries and exact record matching.
- [x] 1.2 Add safe retry classifications and separate verification timing, and test that synthetic secrets and raw exceptions do not appear in diagnostics.

## 2. Overlapping publication

- [x] 2.1 Implement preflight, the universal confirmation gate, sequential target uploads and overlapping exact checks; use controlled async tests to prove ordering, no parallel uploads and waiting for late checks.
- [x] 2.2 Resolve ambiguous upload outcomes by exact verification before the next write; test duplicate matches and conflicts, failed-but-accepted uploads, background failures, draining and complete partial-result reporting.
- [x] 2.3 Preserve the existing registry/authentication routes, token guard, branch/event restrictions and environments; test the command arguments, guard and workflow conditions with local fakes only.
- [x] 2.4 Update the release guides and ADR with the overlap, failure recovery and measured-versus-hypothetical limits; review their wording against the implementation.

## 3. Integration verification

- [x] 3.1 Run `npm run check`, `npm test`, `npm run spec:check` and `npm run package`, and report actual results without claiming a real publication or platform acceptance.

## Real VS Code manual checklist

- No extension runtime or UI behavior is intentionally changed by this work.
  No manual VS Code scenario is claimed by local workflow tests. Any later
  installation or platform acceptance is a separate check, not a prerequisite
  for this local publication-workflow change.

## Workflow follow-up

- A release, branch transfer, commit, push and real-gallery timing evidence need
  separate authorization. Review both registries and environment restrictions
  before a future release.
- Archive or synchronize this change only after implementation and verification;
  reconcile it with the earlier unarchived `publish-platform-packages` delta.
