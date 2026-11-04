# Proposal

## Why

The user reported a disappearing Find in Files item, confusion with the built-in
Find in Folder, and broken double click on modal results. Fix context-menu search
availability and restore the intended navigation.

## What Changes

- An explicit **JB Search: Find in Files…** title, distinguishable next to the built-in item.
- Filesystem-folder visibility is independent of retained multiple selections in
  Explorer: the command uses the resource on which the menu was opened.
- Double click and Enter open the source in the central editor group at the
  required range, closing the modal after validating the result.
- Stable result rows survive selection and host state echoes between clicks;
  stale results cannot be activated.
- Patch version 0.2.1, validation, commit, and push to dev were requested by the user.

Confirmed scope: fix the three reported issues and deliver to dev. The built-in
Find in Folder remains; the user allowed a distinguishable title as one option.
Searching a union of selected folders, hiding built-in commands, client component
changes, and publication are outside the scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `search-entry-points`: a distinguishable folder item and use of the context
  target regardless of the number of selected resources. The 0.2.0 main
  specification was synchronized from the verified `add-explorer-find-in-files`
  before this delta.

Enter/double-click navigation is already covered by Requirement “Result preview
and navigation” in `design-floating-search/specs/search-window`; this fixes an
implementation defect in the existing contract without adding a duplicate capability.

## Impact

Manifest, modal renderer, result-opening controller, tests, and documentation.
The search worker, client protocol, and dependencies remain unchanged.
