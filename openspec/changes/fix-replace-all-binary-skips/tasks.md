# Tasks

## 1. Search eligibility and completeness

- [x] 1.1 Implement bounded, conservative ZIP recognition before the text size guard; verify ZIP/DOCX, large archives, and arbitrary-extension archives are excluded without extraction, and ordinary text named `.zip`/`.docx` remains searchable.
- [x] 1.2 Separate intentional exclusions from blocking skips and preserve worker cancellation/resource limits; verify mixed and large input searches report correct completeness and counts.
- [x] 1.3 Preserve fail-closed handling of UTF-16 with and without BOM, invalid UTF-8, unknown oversized files, read/enumeration errors, timeout, and result limit; verify each with focused automated tests.
- [x] 1.4 Update README and implementation limits to distinguish supported text completeness from excluded archive contents; verify settings and text-search boundaries agree with implemented behavior.

## 2. Diagnostics and replacement guards

- [x] 2.1 Collect bounded skip/exclusion path-and-reason details, root identity where needed, total counts and an omitted count; verify mixed categories, multiple roots, and overflow with automated tests.
- [x] 2.2 Present distinct safe exclusions and blockers in the modal and Find Panel without interpreting file paths as markup; verify messages, truncation and retained state with UI/controller tests.
- [x] 2.3 Preserve controller-side and snapshot validation guards while allowing a complete search with only confirmed containers to use Replace All; verify actual edits, unchanged archives, Undo-related edit semantics, and blocking/error/stale cases in automated tests.

## 3. Integration and real-editor checks

- [x] 3.1 Run relevant `npm run check`, `npm test`, `npm run spec:check`, `npm run package`, and `git diff --check`; report the actual outcomes separately from real-editor checks.
- [x] 3.2 In a real VS Code Extension Development Host, search/replace text next to a genuine DOCX and a blocking unsupported input; inspect path/reason notices in the modal and Find Panel, then verify Replace All availability, unchanged DOCX, unsaved edits, and Undo. Record the actual platform/remote environment and any unrun checks; do not infer other platform coverage.

## 4. User clarification: exclude binary inputs generally

- [x] 4.1 Exclude recognized binary signatures and generic NUL-containing binary input without blocking Replace All, while retaining Unicode BOM/likely BOM-less UTF-16/32 encoding blockers and bounded reads for large files.
- [x] 4.2 Update diagnostics, user-facing documentation, and architectural rationale to describe binary exclusions, blocking errors, and classification limits.
- [x] 4.3 Add worker, controller, UI, and workspace-edit tests for binary formats, dirty text snapshots, unsupported encoding, read errors, size limits, and unchanged binary contents.
- [x] 4.4 Rerun checks, tests, OpenSpec validation, isolated package verification, and a real VS Code GUI check; record actual platform coverage and unrun manual checks.
