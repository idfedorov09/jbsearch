# Proposal

## Why

In a multi-root workspace, named scopes currently apply their patterns to every
root. Users cannot name a scope for one particular workspace folder without
relying on other search controls, which makes repeated project-specific searches
and replacements less convenient.

## What Changes

### Confirmed scope

- Allow a named `jbsearch.scopes` entry to specify an optional `root`: the exact
  name of one VS Code workspace folder, including a configured folder alias.
- Restrict a rooted named scope to the selected folder using the existing Folder
  scope's search behavior, while still applying the named include/exclude
  patterns and the current search settings.
- Reject malformed, missing, or ambiguous specified roots with an actionable
  error instead of silently broadening the search or permitting unsafe replacement.
- Preserve the existing all-roots behavior when `root` is omitted, and document
  the new option with a multi-root configuration example.

### Recommendation and boundaries

Use the existing workspace-folder API and Folder search path rather than add a
new selector or a new search engine. Scope management UI, absolute-path or glob
selectors for `root`, changes to multi-root nesting policy, publishing a release,
and posting a public issue response are outside this code change. The user
separately asked to respond to the issue only after the feature is published. The
selection names one VS Code workspace folder, not an arbitrary directory.

### Approval and platform limits

Implementation in `dev` was requested; this proposal describes intended behavior,
not proof that it is implemented or tested. A version change, commit, push,
release, or Marketplace publication is not authorized. Automated checks and
real VS Code manual checks are separate. Existing support boundaries remain: no new claim of
Windows, macOS, or physical Remote SSH verification follows from Linux tests.

### Open questions

No blocking product questions are assumed for the narrow behavior above. Further
workspace-selection UI and more expressive root selection may be considered
separately if users request them.

## Capabilities

### New Capabilities

- `named-search-scopes`: root selection, safety, and backwards compatibility for
  reusable named search scopes.

### Modified Capabilities

None.

## Impact

The configuration schema and description, search request construction and worker
scope behavior, replacement safety checks, unit/integration tests, README, and
manual test checklist are affected. No new dependency or client UI component is
expected. Existing replacement validation and native Find Panel snapshot behavior
remain in force.
