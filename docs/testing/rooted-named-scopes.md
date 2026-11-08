# Rooted named scopes validation

Date: **November 8, 2026**. Change:
[add-rooted-named-scopes](../../openspec/changes/add-rooted-named-scopes/proposal.md).

## Actual VS Code GUI automation

Five scenarios passed in an **Extension Development Host**, running the source
extension in VS Code **1.143.1** on Linux x64 / X11 using Xvfb and Playwright.
This was automated interaction with a real VS Code workbench, not a manual human
acceptance test. A synthetic multi-root `.code-workspace` used isolated user data
and extensions, a separate temporary home, and these folder aliases: `Web`,
`API Alias`, and `Nested Alias` (inside the API folder). A test helper observed
controller state, created dirty documents, changed workspace settings, and
inspected document contents; the helper is not part of the extension package.

| Scenario | Result |
| --- | --- |
| An unrooted named scope finds eligible files in both roots, including dirty buffers | Pass |
| The named scope rooted at `API Alias` excludes `vendor`, uses the API folder's relative paths for its nested root, and includes its dirty document | Pass |
| A nonexistent configured root displays an error and yields no results | Pass |
| Replace All changes only eligible API documents, including a nested file and a dirty buffer; the other root and excluded file remain unchanged | Pass |
| A saved Find Panel snapshot blocks replacement after its configured root is changed to an invalid name | Pass |

Search selection, query, replacement and Replace All used the real modal UI.
The stale-snapshot replacement was invoked by the helper against the controller
after the Find Panel was opened; its document content was checked afterward.
The test did not save the synthetic documents. It does not establish macOS,
Windows, Wayland, or physical Remote SSH behavior. The separate human manual
checklist in the OpenSpec tasks remains open.

## Automated coverage

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 206 tests passed; none failed or skipped |
| `npm run spec:check` | 26 items passed strict validation |
| `npm run package` | Main and bundled client VSIX verified in a disposable copy |

`test/rooted-scopes.test.js` covers the schema, exact aliases and invalid values,
legacy all-root behavior, real worker filtering, dirty snapshots, nested-root
policy, symlink traversal on non-Windows systems, and replacement safeguards.
`test/controller-find-window.test.js` checks binding transfer/rollback and
cancellation of in-flight searches on configuration and workspace changes.
