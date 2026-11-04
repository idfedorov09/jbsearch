# JB Search release readiness

## 0.2.3 release preparation — November 4, 2026

Main version **0.2.3** updates Marketplace keywords and the short description;
the extension ID, runtime, and bundled client 0.1.0 are unchanged. See
[release notes](releases/v0.2.3.md) and the
[OpenSpec validation record](../openspec/changes/optimize-marketplace-keywords/README.md).
The existing `master` push workflow handles publication. Local verification does
not establish its outcome or add new GUI or platform acceptance evidence.

## 0.2.2 stable release preparation — November 4, 2026

The main extension was **0.2.2**, displayed as **JB Search — JetBrains-style Find
& Replace**, with the Marketplace Preview flag removed. Its extension ID remains
`idfedorov09.jbsearch`; the unchanged bundled UI client remains **0.1.0**.
README installation now starts with Marketplace and Extensions, and contributor
installation instructions live in [CONTRIBUTING](../CONTRIBUTING.md).

The user confirmed successful macOS and Linux use. That report is recorded
separately from automated Linux/X11 GUI checks in
[platform acceptance](testing/platform-acceptance.md). Windows execution has not
been reported; a universal package with Windows binaries is not an acceptance run.
Physical Remote between separate machines, WSL, and Dev Containers remain open.

Release notes: [v0.2.2](releases/v0.2.2.md). Local validation and package evidence:
[release-stable-022](../openspec/changes/release-stable-022/README.md).

The delivery sequence is a normal `dev` push and successful Check, then a
fast-forward to `master` and both normal push workflows, including Marketplace
publication. No workflow is skipped or reconfigured. Actual remote publication
must be verified separately from local preparation.

## 0.2.1 GitHub preview history

The main extension version was **0.2.1**, selected for the first GitHub
preview release: Explorer item visibility/title and modal result activation are
fixed. The nested UI client remains **0.1.0**, with unchanged code and protocol.
Validation is recorded in
[Explorer and result navigation](testing/explorer-navigation-fixes.md).
Checks for the 0.2.0 Directory addition: [Explorer Find in Files](testing/explorer-find-in-files.md).

## 0.1.0 preparation history

Preparation date: **November 4, 2026**. Branch: **dev**.

This historical preparation covered sources and an installation package. At
that time, public release and transfer to `master` had not happened. Version
`0.1.0` was consistent across main/client manifests and lockfiles; the initial
Git scaffold used `0.0.1`.

## Contents

- Find/Replace modal and native Find Panel are described in the [changelog](../CHANGELOG.md).
- Technical boundaries are in [implementation-limits](implementation-limits.md).
- Nested `idfedorov09.jbsearch-client` is included in the main VSIX and supplies
  client theme/grammar resources for Remote preview; no separate application is needed.
- VSIX, `bundled/`, `.client-build/`, node_modules, and temporary test profiles
  stay out of Git. Release artifacts are built from sources.

## Preparation checks

- [x] Clean dependency installation with `npm ci` on Node.js 22.
- [x] Main/client versions and lockfiles agree on `0.1.0`.
- [x] `npm audit --omit=dev`: distributed runtime dependencies had no known
  vulnerabilities according to npm at preparation time.
- [x] `npm run check`; `npm test` **146/146**; `npm run spec:check` **7/7**;
  `npm run package` passed on Node.js **22.23.2** / npm **12.0.2**, Linux x64.
- [x] Initial main/nested VSIX contents verified: **72** and **31** files,
  main/client version `0.1.0`, client build matches metadata. README and changelog
  included; dev dependencies, tests, and research documents excluded.
- [x] Git staging reviewed: generated bundles/VSIX excluded; text scanning and
  OCR of **22** test PNGs found no credentials or personal information.
- [x] Sources pushed to `origin/dev`; GitHub Check passed for commit
  `e4d78278d146d96358b9816320b5764a748a3d26`.

Initial packaging results and SHA-256:
[release-candidate-package-results.json](testing/release-candidate-package-results.json).
Initial VSIX size: **24,329,409 bytes**. Ripgrep presence for all platforms was
checked in the archive; this does not replace running the extension on each OS.

## Earlier checks in actual VS Code

- Sources, VS Code 1.143.1 on Linux/X11: **13/13** native Find Panel scenarios.
- Installed VSIX, VS Code 1.144.1 on Linux/X11: the same **13/13** scenarios.
- Find/Explorer icons: **10/10** comparisons in each run, including BL,
  JS/JSON, folders, and icon theme changes.
- GUI confirmed INVALID/Undo, guarded replacement, gear drafts, independent
  searches, and source opening in the central group.

These are automated GUI runs in actual windows, not manual acceptance of all
platforms. Exact package versions and conditions: [native Find Panel](testing/native-find-panel.md),
[modal/Remote preview](testing/find-replace.md). Release preparation does not
change search runtime or UI; new packaging checks are recorded separately.

## Open release checks recorded during 0.1.0 preparation

These boxes preserve the original preparation status. The current platform
evidence is recorded above rather than inferred from these historical checks.

- [ ] Complete manual macOS and Windows acceptance: shortcuts, focus/IME, Esc,
  move/resize, Find/Replace, central editor, INVALID, and Undo.
- [ ] Check physical Remote between separate machines: client theme/grammars,
  file icons in Panel, theme changes, Replace/Undo, and client bundle installation.
- [ ] Confirm installation and basic use of the GitHub preview in clean VS Code.
- [ ] Verify the Marketplace publishing job and Trusted Publishing configuration
  using the [guide](marketplace-publishing.md) when the normal workflow runs.
- [ ] After any Marketplace publication, check GitHub Actions, the listing, and
  installation in clean VS Code.

The main extension icon was added at the user's separate request:
[256×256 PNG](../media/icon.png) from the [source SVG](artwork/icon.svg).
The new VSIX with the icon contains **73** files; the nested client has **31**.
Check, **146/146** tests, **8/8** OpenSpec checks, and package passed; results
are recorded separately from the initial candidate in
[extension-icon-package-results.json](testing/extension-icon-package-results.json).
The PNG was reviewed; the extension listing in actual VS Code was not manually
checked. Unfinished platform/external checks remain in their OpenSpec changes;
preparing `dev` does not automatically complete them.

## Git and CI

First functional commit: `e4d78278d146d96358b9816320b5764a748a3d26`
(`feat: implement floating Find/Replace and native Find panel`). It was sent by
normal push to `origin/dev`; remote and local HEAD matched. The first push request
received GitHub Internal Server Error; retry succeeded without force.

[GitHub Check #41810967859](https://github.com/idfedorov09/jbsearch/actions/runs/41810967859)
passed on **November 4, 2026, 09:57:50 UTC** for that commit: clean
`npm ci --ignore-scripts`, check, **146/146** tests, **7/7** OpenSpec checks,
build, and main/nested VSIX verifier. This report and the final OpenSpec mark
are recorded in a separate subsequent documentation commit without runtime or
distribution changes.

`master` remained at `b88978d771a59fbacd2492128ff3d865dc6e8ff4`.
`dev` runs ordinary checks. Publication is restricted to `master`; after trust
setup, pushing to that branch can publish a version publicly.
