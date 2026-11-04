# Design

## Context

See proposal.md for motivation and authorization. SearchController already keeps
independent sessions and snapshot tracking; FindPreview creates a right editor
group, while a central custom editor tab holds the HTML tree. Presentation and
source navigation change; the worker, replacements, and modal preview retain
their existing contracts.

## Goals / Non-Goals

**Goals:** native client rendering of all file icons, a tree in Panel, an ordinary
central editor, and preservation of snapshots and multiple searches.

**Non-Goals:** a central native TreeView, DOM injection, transferring the client
icon theme, custom styles for native tree rows, or a new application. Modal
preview continues to use the existing client theme/grammar bridge.

## Decisions

1. Register a viewsContainer in `panel` and a TreeView with one active search.
   FindTree caches snapshots by id, shows root/directory/file/occurrence nodes,
   and provides `resourceUri` and explicit `ThemeIcon.File` even for a collapsible
   file node. A native QuickPick switches saved sessions without another tree
   level. Opaque ids and ordering are retained during document validation.
2. In the controller, separate the existence of a saved Find session from
   `panels.size`. Hiding the native view does not close sessions. Close Search
   cancels workers and validation; New Search copies parameters independently.
   Toolbar/context commands pass the session/result identifier and current
   generation to the existing message handler. A command wrapper displays errors
   without hiding replacement refusals.
3. FindPreview opens source in the active editor group through showTextDocument.
   No newGroupRight/Beside or owned split groups. The last explicit selection wins
   races; edits and theme changes only update decorations. Automatic result
   selection during search does not open a document. Click preserves tree focus;
   a separate Open and Focus Editor action transfers it to the editor.
4. Use `TreeItemLabel.highlights`, INVALID/pending counts, a tooltip with the path,
   position, text, and INVALID reason, and native actions in the tree. The query
   and scope appear in the title/summary; replacement is shown in Edit Search.
   This is standard VS Code list highlighting; the editor find decorations with
   70% fill remain in the source. Following the user's clarification, INVALID
   precedes the snippet and receives
   `ThemeIcon('error', ThemeColor('errorForeground'))`. No arbitrary native label
   text color is introduced; validity/Undo remove both error markers. The selected
   row retains the workbench's native contrast rules, including icon color
   overrides; the prefix and error shape remain visible.
5. New Find searches do not use CustomEditorProvider. Old restored
   `?view=findWindow` resources are redirected to the native panel without an
   HTML tree; query/results are not persisted to disk, as before. The old tree's
   HTML/CSS resources are removed from runtime and VSIX validation.

API evidence:
- https://code.visualstudio.com/api/extension-guides/tree-view
- https://code.visualstudio.com/api/references/vscode-api#TreeItem
- https://code.visualstudio.com/api/references/vscode-api#window.showTextDocument
- https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/viewsExtensionPoint.ts

Architectural rationale is recorded in ADR 0008, superseding ADR 0007's placement.

## Risks / Trade-offs

- One native view instead of multiple editor tabs → a saved-search switcher.
- Users can move Panel using VS Code controls → `panel` defines the default
  placement; the extension does not rearrange the user's entire layout.
- No CSS for individual native rows → use native highlight styling.
- Remote and platforms → check available environments separately; do not infer
  physical SSH/macOS/Windows validation from a local Linux probe.
- Background snapshot validation → retain sessions independently of visibility,
  but explicitly release them through Close Search and dispose; do not open
  source files from background notifications.

## Migration Plan

After source changes, Developer: Reload Window is sufficient; the client package
is unchanged. Old editor tabs with a findWindow URI are redirected to an empty
native panel. The version, user profile, commits, and Marketplace remain unchanged.
