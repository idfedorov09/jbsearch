# Find in Files from Explorer — 0.2.0

Validation date: **November 4, 2026**. Main extension **0.2.0**,
nested UI client **0.1.0**, with unchanged client code and protocol.

## Behavior

Right-clicking one Explorer folder → **Find in Files…** opens the existing Find
dialog. Directory is selected with the exact folder path; search includes
subfolders and retains query, masks, and options. Workspace roots and a folder
in the second root are supported. The item is hidden on files and with multiselect.

Saved Find searches and their gear drafts are not overwritten: context invocation
creates an independent search. URI/stat errors or an ongoing replacement do not
change the current search scope. Late results and a later-completing check for
the previous folder cannot override the latest request.

![Explorer folder menu](assets/explorer-folder-menu.png)

![Dialog with Directory selected](assets/explorer-directory-modal.png)

## Automated checks

Isolated snapshot of this task's staged changes:
`9a6d76aa30e844efb57822ddb9736861257a8d42`. Separate temporary directory,
Node.js **22.23.2**, npm **12.0.2**, Linux x64. Concurrent uncommitted README
presentation changes were excluded from the snapshot and VSIX.

- `npm ci` passed; the nested client was prepared from source.
- `npm run check` passed.
- `npm test`: **180/180**, including **17** nested subtests;
  no failures, skips, or cancellations.
- `npm run spec:check`: **10/10** snapshot items.
- `npm run package` passed. The main VSIX contains **73** files and the nested
  client **31**; the verifier checked identity, versions, client build, runtime
  dependencies, PNG, and ripgrep for all distributed platforms.

Package: **24,345,772 bytes**, SHA-256
`8e8243367abdc6dcfd10cb451ae05739b25f6adf8565eed3c374ffb40d9a3ffd`.
Full report: [explorer-find-package-results.json](explorer-find-package-results.json).
The VSIX is generated locally and excluded from Git.

## Actual VS Code: sources

**VS Code 1.143.1, Linux x64 / X11 / Xvfb**, separate profile and
Extension Development Host. Automated GUI run: **8/8**.

- Normal Find opens the existing modal with Project; baseline search gives six
  matches across two roots with Match Case, Whole Words, regex, and `*.js`.
- An actual action click in nested `scope dir` opens Directory with two matches;
  `scope dir-extra` and the second root are excluded.
- Query and options are retained; the original Find snapshot is unchanged after
  opening a new search and pressing Esc.
- The workspace root action gives four matches from that root only.
- Transferring a Directory search to Find Panel creates an independent saved session.
- The action is absent from a file's menu and when two folders are selected.
- Normal Ctrl+Shift+F preserves the previous scope even if Explorer is focused
  on another folder; cancelling a gear draft leaves the original snapshot unchanged.

Details and actual states:
[explorer-find-source-results.json](explorer-find-source-results.json).
Screenshots were reviewed separately and contain only test fixtures.

## Actual VS Code: installed VSIX

The same verified VSIX was installed in a separate **VS Code 1.144.1** profile
on Linux x64/X11/Xvfb. All **8/8** scenarios passed again. Main loaded from the
test profile's `extensions/idfedorov09.jbsearch-0.2.0`; the project source folder
was not connected as a development extension. A development helper only controlled
the test and read the installed controller's state.

Checks covered the actual Explorer menu, Directory, result counts 2/4/6, retained
query/options, independent snapshots, file/multiselect guards, and normal Find
shortcut. Report: [explorer-find-installed-results.json](explorer-find-installed-results.json).
The test's own VS Code/Xvfb processes from both runs were stopped.

## Boundaries and manual acceptance

This is actual VS Code controlled with Playwright, not manual acceptance of all
platforms. macOS, Windows, and physical Remote between separate machines were not
covered. The `vscode-remote` menu guard and workspace host filesystem URI checks
are covered by code and unit tests; they do not confirm physical Remote SSH.

- [ ] On macOS and Windows: right-click a folder/root → Find in Files… → correct
  Directory, focus, and results; check Esc and normal Find/Replace shortcuts.
- [ ] In physical Remote: invoke from Explorer; search must run on the workspace
  host rather than a same-named local path. Check client theme/preview.

Public publication and transfer to master are outside this delivery.

## Git and CI

Implementation: `ec9a84b258214324b499eea38ade8934aa881d51`
(`feat: add folder-scoped Find in Files from Explorer`), sent to `origin/dev`
with a normal push. Remote and local SHAs matched.

[GitHub Check #41820252916](https://github.com/idfedorov09/jbsearch/actions/runs/41820252916)
passed for this commit on **November 4, 2026, 11:22:10 UTC**: clean install,
check, test, spec:check, and package. Installed GUI validation and this note were
added in a subsequent documentation commit without changing runtime or VSIX.
