# Tasks

## 1. Command and search scope

- [x] 1.1 Add the Explorer command, folder/scheme/multiselect guards, and URI forwarding; test the manifest and activation.
- [x] 1.2 Implement folder validation, Directory scope, cancellation of previous results, and saved/draft session isolation; test the controller and existing directory worker cases.
- [x] 1.3 Document the Explorer entry point in README, bump main to 0.2.0, and update the changelog; check manifest/lock consistency and confirm that the UI client is unchanged.

## 2. Validation and delivery

- [x] 2.1 Run check, test, spec:check, and package; inspect the main and bundled VSIX contents and save the results.
- [x] 2.2 Check real VS Code on Linux: folder/file menu, Directory and results for nested/multi-root folders, preserved Find snapshots, and ordinary Find; save a GUI report with platform boundaries.
- [x] 2.3 Review the diff, commit and push to dev, and verify the remote SHA and CI result.

## Workflow follow-up

- Archive and synchronize the baseline after a separate review.
- macOS, Windows, and physical Remote remain in the overall acceptance matrix;
  Linux and unit checks do not confirm them.
