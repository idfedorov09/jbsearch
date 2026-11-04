# Tasks

## 1. VS Code contract and capabilities

- [x] 1.1 Check the public groups/Secondary Side Bar API and editor decorations in the installed desktop VS Code; record primary sources and ADR 0007 with the explicit sidebar limitation.

## 2. Snapshot and live ranges

- [x] 2.1 Implement deterministic ordering and range tracking without reordering the tree; add unit checks for insert/delete/replace/multiline/UTF-16/CRLF/Undo.
- [x] 2.2 Connect changed-document validation through the worker, INVALID/pending states, and stale-response guards; add unit checks for errors, deletion, and prevention of stale Replace.

## 3. Find Window and editing

- [x] 3.1 Build a dedicated virtualized tree UI with a toolbar, collapsing, and keyboard support, without the modal form/Open in Find Window button; check the DOM and browser layout, and document controls.
- [x] 3.2 Connect a real right editor and decorations with preserveFocus and protection against fast result switching; add group unit checks and a separate GUI smoke with editing/Undo.
- [x] 3.3 Implement gear → draft modal → original tab update, Esc, and New Tab; check isolation of multiple sessions and preservation of query/options/scope.

## 4. Integration and distribution

- [x] 4.1 Run check/test/spec:check/package, inspect both VSIX files; record the report and align the earlier transfer scenario in OpenSpec/README.
- [x] 4.2 Check Find/Replace → tree, deterministic ordering, editable preview/Undo/INVALID, rerun, gear/Cancel/Confirm/New Tab, and the theme in isolated regular VS Code; record the exact environment, screenshots, and limitations.

## Workflow follow-up

- Exact native editor placement inside the Secondary Side Bar remains a request
  limited by stock VS Code capabilities; a regular right editor group does not
  count as such a sidebar tab. macOS/Windows and a physical Remote client are
  checked separately, without inheriting Linux status.
- Agree on baseline synchronization and archiving after validation and review.
