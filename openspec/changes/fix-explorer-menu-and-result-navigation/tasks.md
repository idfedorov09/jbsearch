# Tasks

## 1. Explorer menu

- [x] 1.1 Update the menu title/guard and test the manifest and context URI forwarding, including multiple selected resources; document the distinguishable title and scope.

## 2. Result activation

- [x] 2.1 Preserve rows across selection/host echoes and restore double click and Enter; check UI regression tests and virtualization.
- [x] 2.2 Validate freshness before closing the modal and open the source at the match in the central group; test controller success/stale/error cases.

## 3. Validation and delivery

- [x] 3.1 Bump main to 0.2.1 and update the changelog; run check, test, spec:check, and package on an isolated snapshot and save the main/client VSIX report.
- [x] 3.2 Run the real VS Code GUI checks: menu with multiselect/compact folders, distinguishable title, double click on selected and other results, Enter, exact URI/range, and modal closure; record the tested platforms.
- [x] 3.3 Review the diff, commit/push to dev, and verify the remote SHA and CI.

## Workflow follow-up

- Main spec `search-entry-points` is synchronized with verified 0.2.1 behavior.
  Changes remain until separately archived; deltas already transferred do not
  need to be reapplied during archiving.
- Do not present macOS, Windows, or physical Remote as verified by a Linux run.
