# Design

## Context

See the proposal for motivation and the delta specification for normative
behavior. `SearchController.request` currently resolves a named scope's filters,
then passes all workspace roots to the search worker. The worker applies filters
relative to each root and treats an explicit Folder scope specially: it enumerates
only the selected folder and uses that folder's settings and relative paths even
for a nested workspace root. Dirty snapshots are substituted only for enumerated,
eligible disk files. The controller's saved Find Panel sessions retain completed
results and `replace` validates results/documents before `WorkspaceEdit`.

These decisions extend the worker/session architecture in
[ADR 0003](../../../docs/adr/0003-search-engine-and-session.md) and preserve the
snapshot and replacement guarantees in
[ADR 0007](../../../docs/adr/0007-find-window-and-native-editor.md), as refined by
[ADR 0008](../../../docs/adr/0008-native-find-panel.md).

## Goals / Non-Goals

**Goals:**

- Resolve a configured name once per search against the current VS Code workspace
  and carry a safe, reproducible folder identity into replacement validation.
- Reuse existing filesystem enumeration, filters, dirty-document handling, and
  native Find Panel behavior instead of creating a second search path.

**Non-Goals:**

- Introduce a new selection UI, multi-folder syntax, directory selector, or
  filesystem path interpretation for the configured `root` value.
- Redefine Folder scope behavior for nested roots, change general configuration
  precedence, or rework historical snapshots unrelated to rooted named scopes.

## Decisions

### Resolve the exact workspace folder name, fail closed

Add an optional string `root` to the configuration contribution and use the
stable [`workspace.workspaceFolders`](https://code.visualstudio.com/api/references/vscode-api#workspace.workspaceFolders)
array and [`WorkspaceFolder.name`](https://code.visualstudio.com/api/references/vscode-api#WorkspaceFolder)
for resolution. `name` is the workbench-facing folder name and supports an alias
from a workspace file; it is not a path or the directory basename. Match the
configured string exactly and case-sensitively. Check property presence, not
truthiness: missing means legacy behavior; present but null, non-string, empty,
or whitespace-only is an error. Do not trim a nonempty name before matching.
Zero or multiple name matches are errors, shown through the existing search
error mechanism with enough context to fix the setting or workspace.

Alternatives: choosing the first matching name is ambiguous; interpreting
`root` as a path or choosing a default root can silently widen or redirect the
search, and would not honor workspace aliases. Root-index selection changes when
folder order changes. Existing configuration lookup precedence remains unchanged.

### Reuse the explicit Folder search policy

Keep the user-facing session scope as the named custom scope so saved sessions,
the dialog, and the Find Panel retain their existing identity. For the worker
request, apply the resolved root as an explicit Folder boundary while preserving
the custom include/exclude filters and the other existing request settings.
Implement this with the existing Folder request form or an equivalent narrowly
scoped representation whose observable behavior is identical. In particular,
parent Folder selection intentionally uses the selected parent's path and
settings for nested contents; do not silently switch to all-roots ownership or
alter the policy for an unrooted search.

Alternatives: filtering final matches would still search unintended files and
risk leakage in intermediate batches. Replacing Folder behavior with a new
nested-root policy would introduce an unrelated compatibility change. Existing
worker-side path-boundary and symlink safeguards remain mandatory.

### Validate rooted snapshot identity before edits

Remember the resolved selected folder identity associated with the completed
search rather than infer safety from the results' display labels. Before a
replacement of rooted results, resolve the current named scope again and require
the same folder identity; missing, malformed, ambiguous, removed, or retargeted
configuration blocks the edit and asks for a rerun. Check again after awaited
file validation and immediately before submitting a `WorkspaceEdit`, so a
workspace/configuration change during preflight does not silently use stale
results. Use a stable folder URI identity, not a display name alone. Existing
range, content, partial-result, INVALID, pending, and generation checks still
apply. Do not send text or queries to another process or extension as part of
root selection.

Alternatives: invalidating every saved snapshot whenever any configuration
changes would disrupt the existing saved-search contract, while resolving only
at search start leaves a stale snapshot replaceable after its folder is removed
or retargeted. The scoped identity check avoids both.

## Risks / Trade-offs

- A workspace can change during asynchronous search or replace preparation →
  bind results to a resolved identity and check it before submitting edits.
- Nested root policies are subtle → compare rooted named scope results against
  the current explicit Folder scope for parent and child selections, both root
  orders, dirty files, and exclusions.
- A same-named folder can be ambiguous → reject rather than pick one silently.
- Older extension versions do not understand `root` and can search all roots →
  document that rollback requires disabling/removing rooted scope entries or
  using Folder scope; do not rely on old versions to enforce the boundary.
- CI or Linux-only results cannot establish desktop behavior on other operating
  systems or physical Remote SSH → maintain a separate, honest manual checklist.

## Migration Plan

Existing entries need no migration because omission retains their current
behavior. After implementing and testing, document an example rooted entry.
For rollback, do not use a configuration containing `root` with an older version:
remove or disable that named scope, or use the explicit Folder scope instead,
so the earlier version cannot silently perform an all-roots search.
