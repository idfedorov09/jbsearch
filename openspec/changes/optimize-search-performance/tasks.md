# Tasks

## 1. Streaming presentation

- [x] 1.1 Coalesce intermediate worker-result notifications and test first/final delivery, bounded scheduling, and no result loss.
- [x] 1.2 Test pending coalesced notifications across reset, cancellation, error, safety changes, close, transfer, and disposal.

## 2. Find and approval copies

- [x] 2.1 Avoid Find-only replacement approval and test Find/Replace transitions, selection and stale binding rejection.
- [x] 2.2 Memoize safe shared immutable approval-copy subobjects and test independence, nested mutation, arrays and special keys.

## 3. Preflight comparison

- [x] 3.1 Cache plan sort keys while preserving normalized deep equality and test duplicate keys, special scalars and randomized parity with the previous comparator.

## 4. Integration and evidence

- [x] 4.1 Add a repeatable synthetic benchmark for streaming updates, Find approval, plan comparison and approval copy; record workload and limitations.
- [x] 4.2 Run focused race/navigation/replacement tests, `npm run check`, `npm test`, `npm run spec:check`, and packaging without overwriting existing workspace VSIX files.
- [x] 4.3 Write a separate real VS Code manual checklist with explicit NOT RUN results and identify untested platform/Remote boundaries.
