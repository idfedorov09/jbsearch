# Tasks

## 1. Source events and snapshot safety

- [x] 1.1 Route watcher, document, tab, configuration, and root events without restarting a search; verify relevant, unrelated, and scoped events in controller tests.
- [x] 1.2 Track bounded initial-search invalidations and fail closed for uncertain identities; verify late batches, deletes, and event bursts in controller tests.
- [x] 1.3 Preserve per-session stale status and monotonic scope revision, including replacement races; verify snapshots and independent sessions in controller tests.
- [x] 1.4 Bound per-file validation openings and fail closed on timeout without treating a non-cancellable physical open as finished; test queue fairness, cancellation, late responses, and recovery.
- [x] 1.5 Share one reusable physical-open gate across controller-owned initial, validation, preview, navigation, and replacement preparation paths; bound the total validation backlog across sessions and document ownership/defaults.
- [x] 1.6 Pin and inspect JetBrains initial-enumeration handling, distinguish conservative initial partial from completed scope staleness, and document false-positive Rerun costs and host limitations.

## 2. Explicit refresh and UI

- [x] 2.1 Add a context-only modal Rerun action without changing query reset behavior or virtualization; verify in UI tests and real Chromium.
- [x] 2.2 Document integration boundaries for occurrence identity, scroll, and Replace All preflight; verify ADR and change artifacts with spec validation.

## 3. Integration checks

- [x] 3.1 Run check, test, spec:check, and package on the final stable local code; record freshly reproduced outcomes and generated artifact boundaries without attributing inherited results.
- [x] 3.2 Record real VS Code manual checklist and actual execution or exact environment blocker separately from browser tests.

## 4. Controlled integration (not claimed by this local branch)

- [x] 4.1 Integrate the independent identity/Save authority, immutable action/full-scope preflight, query reset, and targeted presentation changes under one writer, and run their joint lifecycle/resource/action tests.
- [ ] 4.2 Run the native VS Code checklist only after an explicitly isolated launch is authorized; record actual platform/host coverage without inferring it from synthetic or Chromium checks.

Combined candidate note (2026-11-11): the single-writer composition and its
automated lifecycle/identity/action/resource/preview/viewport matrix now run on
one checkout. Candidate-1 passed 652 Node tests before review requested nine
repairs; candidate-2 passed 757 Node tests and four isolated Chromium harnesses.
The
controlled-integration task remains open for the designated frozen-source
independent review/native acceptance stage; native tasks are not checked from
provider or Chromium mocks. See
[the combined report](../../../docs/testing/issue-3-integrated-regressions.md).

## Candidate-1 review implementation repairs (candidate-2)

- [x] 5.1 Bind transfer/rollback to exact owners, generations, lifetimes and parameters; preserve delivered events and acknowledged edits; cover static/event failures and close/reset/dispose with controller regressions.
- [x] 5.2 Match busy Rerun refusals to their client request without releasing accepted duplicate guards; verify actual controller admission and production webview VM.

These checkboxes record implementation and 757 passing combined Node tests, not
independent re-review or native/platform acceptance. Existing designated
review/native tasks remain open; see the candidate-2 regression report.

## Candidate-2 independent-review repair (candidate-3)

- [x] 6.1 Retain exact-source event/validation coverage through admitted close, final focus and actual rollback reopen; bound late provider admission to its original lifetime; test known edits, Save, Close, zero-match epochs, pending deadlines, reopen failures and accepted new generations using composed host and real worker/raw-file authority controls.

Candidate-2's three independent reviews completed; A2-C2-R1 and A3-C2-R1
describe this one remaining root cause, not two new policy choices. The new
implementation task does not close designated independent/native acceptance
tasks. Candidate-1/candidate-2 reports and test counts remain historical; see
[the candidate-3 record](../../../docs/testing/issue-3-candidate3-rollback-repair.md).

Dev follow-up (November 12, 2026): final candidate-3 source review passed in
all three assigned scopes; transfer integrity and fresh 837-test dev verification
close task 4.1. Task 4.2 remains separate and is not inferred from these checks.
See the dev/beta validation record for actual application execution or blocker.
