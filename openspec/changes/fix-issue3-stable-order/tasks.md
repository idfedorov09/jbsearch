# Tasks

## 1. Design and ordering evidence

- [x] 1.1 Compare candidate enumeration and ordering alternatives using isolated measurements, and record their scope and limits in the change design.
- [x] 1.2 Record the accepted streaming versus deterministic-order trade-off in ADR 0013 and verify its links and native viewport limitation.

## 2. Modal viewport

- [x] 2.1 Preserve the same-generation modal viewport anchor without changing search reset or navigation; verify with focused UI unit tests.
- [x] 2.2 Exercise the affected modal content in real Chromium and record viewport, selection, reset, and environment evidence separately from VS Code GUI checks.

## 3. Native tree

- [x] 3.1 Localize same-structure tree notifications and verify row, ancestor count, selection, and unchanged-state behavior with provider tests.
- [x] 3.2 Preserve structural refresh and completed deterministic ordering, including a streaming `z,a` to completed `a,z` regression, and run focused tests.

## 4. Integration verification

- [x] 4.1 Run `npm run check`, `npm test`, `npm run spec:check`, and `npm run package`; report real results without adding generated packages to Git.
- [x] 4.2 Check the native TreeView in a real VS Code Extension Development Host when available, or record the exact availability blocker and unverified scenarios.
- [x] 4.3 Document cross-branch integration dependencies and the remaining native viewport and platform limitations.

## 5. Authorized continuation: immutable native actions and shared UX

- [x] 5.1 Inspect a pinned JetBrains popup and Usage View implementation, distinguish paging/ordering/action binding, and document the compatible adaptation and VS Code handle-resolution evidence.
- [x] 5.2 Implement immutable native action descriptors and non-reused revision-bound match handles; reject delayed stale commands/context elements and ambiguous result IDs before and after waits, without a paint acknowledgement assumption.
- [x] 5.3 Preserve status-only targeted updates, logical selection, and full-snapshot action forwarding; leave unknown toolbar approval to the backend frozen-review protocol and add focused provider/controller regressions.
- [x] 5.4 Add a single guarded modal Rerun action for scopeStale or needsRerun and verify same-generation anchoring through status/revalidation changes without duplicating the query/preview owner.
- [x] 5.5 Measure unchanged, status-only, action-relevant, and structural 50,000-row provider paths and retained memory, recording the synthetic fixture and native GUI/platform limitations.
- [x] 5.6 Run final local check, test, spec:check, package, diff whitespace and isolated Chromium checks; export the integration API/file map and local evidence.
- [ ] 5.7 Integrate all peer branches under the designated integration owner and verify the combined query reset, identity, lifecycle, full preflight/frozen review, accessible selection, and native presentation contracts.

Combined candidate note (2026-11-11): the single-writer composition and its
automated lifecycle/identity/action/resource/preview/viewport matrix now run on
one checkout. Candidate-1 passed 652 Node tests before review requested nine
repairs; candidate-2 passed 757 Node tests and four isolated Chromium harnesses.
The
controlled-integration task remains open for the designated frozen-source
independent review/native acceptance stage; native tasks are not checked from
provider or Chromium mocks. See
[the combined report](../../../docs/testing/issue-3-integrated-regressions.md).
