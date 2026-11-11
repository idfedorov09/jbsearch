# Tasks

## 1. Controller regression coverage

- [x] 1.1 Add independent tests for immediate reset on query, mask, scope and other search input, and for replacement-only patches; run the new tests.
- [x] 1.2 Add controlled stale batch, completion, failure and preview tests across generations; run the new tests.

## 2. Webview regression coverage

- [x] 2.1 Add webview regressions for optimistic clearing, selection and scroll, rapid input/ACK and stale preview; run the new tests.
- [x] 2.2 Run the production webview in real Chromium against a synthetic messaging boundary and document the environment, scenarios and limitations.

## 3. Cross-cutting verification

- [x] 3.1 Run `npm run check`, `npm test`, `npm run spec:check`, and `npm run package`; record actual results without claiming cross-branch integration.
- [x] 3.2 Document the independent real VS Code and Windows/WSL manual follow-up; record whether an Extension Development Host was available.

## Workflow follow-up

- Do not archive, sync baseline specifications, merge branches, or publish without a separate request.

## 4. Authorized continuation: production safety and local verification

- [x] 4.1 Fix accessibility selection references and request/generation/revision-bound previews; verify keyboard selection, same-ID delivery, stale opens and stale failures with focused tests.
- [x] 4.2 Cover invalid current regex, nonempty zero-result queries, rapid parameter edits and explicit Rerun, and convert browser diagnostics into assertions; run the isolated Chromium harness.
- [x] 4.3 Inspect pinned JetBrains popup source, document the intentional immediate-clear difference, and publish a concise joint regression/acceptance matrix with shared ownership and pending combined/manual checks.
- [x] 4.4 Run current local check, test, spec validation, package and diff checks; record exact local results, limitations, file map and hashes, then freeze the checkout for controlled integration.

Combined candidate note (2026-11-11): the later single-writer composition retains
immediate reset and strict preview/ARIA behavior with the shared physical opener,
row identity, viewport anchor, full action binding and one Rerun control. Its
automated evidence and pending independent/native acceptance are recorded in
[the combined report](../../../docs/testing/issue-3-integrated-regressions.md);
this local change's completed tasks alone do not close issue #3.
