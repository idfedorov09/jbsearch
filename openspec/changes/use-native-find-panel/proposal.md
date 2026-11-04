# Proposal

## Why

Find Window's custom HTML tree draws fixed icons that differ from the client's
Explorer. On 2026-11-04, the user explicitly approved a native tree in the bottom
panel and opening the selected result in the central editor.

## What Changes

- **BREAKING UI**: replace Find Window with a Find panel using a native TreeView;
  the separate central tree tab and dedicated right editor group are no longer needed.
- Tree data and ordering remain under our control; the VS Code workbench renders
  file/folder icons, expansion, row selection, context menus, and actions.
- Selecting a result opens the real file in the active central editor group,
  without a split; opening/refreshing the panel does not switch documents by itself.
- Retain snapshot/INVALID behavior, replacement validation, and the isolated Edit
  Search draft. INVALID becomes more visible: a prefix before the snippet and a
  native error icon in the active theme's color, following the user's additional
  request. Independent searches are selected through a native QuickPick in one
  panel; New Search creates a separate session, and Close Search releases it.
- Update modal labels to Open in Find Panel / Keep as a new search.

The scope was authorized by a direct request. Platform checks are recorded
separately; the public API is not proof of a physical Remote/macOS/Windows run.
The new renderer must not copy the client's icon theme or inject into the DOM.

## Capabilities

### New Capabilities

- `find-results-panel`: a native search tree in Panel, a central editor,
  actions, and saved-search switching.

### Modified Capabilities

None: the baseline contains only installation-check. The new change replaces
placement from the unarchived implement-find-window change while retaining its
results snapshot logic.

## Impact

SearchController, a new FindTree/TreeDataProvider, FindPreview, contributions for
views/commands/menus, and modal labels. Remove the obsolete HTML tree. ADR 0008
will supersede ADR 0007's placement decision. No new dependencies or changes to
the client UI helper are needed. Unit tests, GUI in isolated VS Code, and VSIX checks.
