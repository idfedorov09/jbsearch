# Tasks

## 1. Search verification

- [x] 1.1 Reject uncertain dirty-buffer eligibility and conditional exclusion errors; cover missing files, ignores and untitled buffers in worker tests.
- [ ] 1.2 Bind the separate complete scope search to the user's approved full snapshot, including captures and replacement semantics; cover unchanged, added, removed and changed matches, and delayed native rendering.
- [x] 1.3 Reject incomplete, cancelled, timed-out or late preflight output without replacing or mutating the shown list; verify with controller tests.

## 2. Replacement races and presentation

- [x] 2.1 Capture text and version consistently and reject concurrent changes for single and bulk replace; reproduce the asynchronous metadata race in a regression test.
- [x] 2.2 Guard scope, configuration, document and available event revisions across preflight and edit submission; test detected conflicts and late answers.
- [x] 2.3 Expose minimal checking and rerun diagnostics in both existing views; verify UI state without changing ordinary presentation.
- [x] 2.4 Document the verified behavior and remaining cross-agent identity/event integration boundaries in project documentation.
- [x] 2.5 Integrate the shared range/identity guard and disk provenance, preserving dirty and untitled buffer semantics; decide the handling of missing, unverified, unsupported and previously dirty backing files.
- [x] 2.6 Separate the cumulative replacement-preparation deadline from the worker search deadline; test timeout, cancellation, delayed completion and a submitted edit's lock.

## 3. Integration verification

- [x] 3.1 Run `npm run check`, `npm test`, `npm run spec:check`, and `npm run package`; record their outcomes.
- [x] 3.2 Exercise affected webview behavior in real Chromium and report the environment separately from VS Code.
- [ ] 3.3 Check the native TreeView and replacement in a real Extension Development Host when available; record blockers and do not infer WSL or Remote support.
- [ ] 3.4 Integrate and test confirmed full-snapshot binding, delayed native delivery, session switches, rerun and the shared modal Rerun control across the separate changes.

Local completion note (2026-11-11): 2.5 uses the frozen shared helpers plus the
controller/worker recorded-origin/URI/policy admission and real-file/worker
regressions. Task 1.2's binding and complete-comparison implementation has local
controller/provider and Chromium coverage, but its delayed native-rendering
verification remains unchecked together with 3.3/3.4. The later combined candidate composes the unified lifecycle and validation
budget and verifies task 2.2 with before/after-dispatch event, zero-match, Save,
Close, deadline and late-settlement regressions. Tasks 1.2/3.3/3.4 remain open
for designated independent/native-delivery acceptance; combined Node/provider
and Chromium subcoverage is recorded in
[the joint report](../../../docs/testing/issue-3-integrated-regressions.md), not
substituted for real EDH or physical rendering.

## Candidate-1 review implementation repairs (candidate-2)

- [x] 4.1 Distinguish harmless clean cache admission from effective in-scope authority and preserve all final guards; verify unloaded/preloaded multi-file success and new/changed zero-match dirty refusals.
- [x] 4.2 Route both registered global Find/Replace commands away from frozen review, including retained/opening panels, and refuse direct review discovery; verify semantic model/token immutability.
- [x] 4.3 Isolate false/rejected/success late apply through real modal/native message adapters across reset/reopen/close while retaining the submitted lock; verify current status is unchanged.

These checkboxes record implementation and 757 passing combined Node tests, not
independent re-review or native/platform acceptance. Existing designated
review/native tasks remain open; see the candidate-2 regression report.
