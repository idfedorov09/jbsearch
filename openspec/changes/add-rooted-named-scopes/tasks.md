# Tasks

## 1. Configuration and root selection

- [x] 1.1 Add the optional named-scope `root` setting and descriptive schema; verify the contribution accepts a string and existing entries without it remain valid.
- [x] 1.2 Resolve a specified root by exact case-sensitive `WorkspaceFolder.name` before starting a search; cover an alias, a non-first folder, missing property, empty/whitespace, non-string, missing name, and duplicate names in controller tests, including assertions that errors do not start the worker.
- [x] 1.3 Retain the custom scope identity in the UI and saved sessions while passing its folder boundary and include/exclude filters into the worker; test rooted and legacy all-root requests and saved-search reruns.
- [x] 1.4 Document `root`, exact folder names and aliases, root-relative patterns, invalid/ambiguous names, legacy omitted behavior, and the older-version rollback caveat in README; check the JSON example is valid.

## 2. Search and replacement safety

- [x] 2.1 Exercise real worker searches across two independent roots: rooted and unrooted scopes, includes/excludes and query masks, ignore settings on/off, dirty snapshots, and boundary/symlink safety; assert no out-of-scope results and preserved exclusion behavior.
- [x] 2.2 Exercise selected parent and child nested-root scopes in both root orders against the existing Folder policy, including selected-root settings and dirty snapshots; verify unrelated workspace and Directory semantics are unchanged.
- [x] 2.3 Bind rooted results to the search's resolved folder identity and revalidate it before replacement and immediately before submitting edits; test removed/renamed/ambiguous roots, retargeted scope, and a configuration or workspace change during asynchronous preflight without file modification.
- [x] 2.4 Verify existing INVALID/pending, incomplete Replace All, changed-document, and isolated Find Panel snapshot safeguards remain effective for rooted results with automated tests.

## 3. Integration checks

- [x] 3.1 Run `npm run spec:check`, `npm run check`, `npm test`, and `npm run package`; record their actual outcomes and confirm generated VSIX artifacts are not added to Git.

## 4. Real VS Code manual checklist

- [ ] 4.1 In an actual VS Code Extension Development Host, create a multi-root workspace with a custom alias, choose a rooted named scope, and verify that matching and replacement affect only the selected folder; record VS Code version, OS, configuration, and observations.
- [ ] 4.2 In that host, check an unrooted scope, nested parent/child behavior, dirty buffers, filters, and a removed or renamed configured root; verify no unintended replacement and record results separately from automated tests.

Leave any unperformed manual item unchecked. Tests on one platform do not imply
coverage on another platform or on a physical Remote SSH host.
