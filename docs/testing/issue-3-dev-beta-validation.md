# Issue #3: verified dev integration and beta preparation

Date: **November 12, 2026** (Europe/Moscow).

This record distinguishes source integration, isolated automation, application
execution, and public beta acceptance. A prerelease is not platform acceptance
or proof that the original Windows/WSL issue has been reproduced and fixed.

## Source and independent review

The complete five-part candidate was transferred into `dev` from the reviewed
candidate-3 patch, without changing the frozen peer worktrees or snapshots.
The source inventory contained 388 files; all 388 SHA-256 values matched before
and after transfer. The initial local and remote `dev` and `master` heads were
`c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c`.

Candidate-3 manifest SHA-256:
`dc058f4833b53ec8d1d79927b458b8c224bd2eb9ec3d1daaf7c80dfc7937ce9f`.
Transferred patch SHA-256:
`dedd2bd0b5713f3f84cada463cdf4920d25f77c12297edbdc336ca5c2324ba8c`.

All three assigned independent source reviews passed their final scopes.
The earlier candidate-1 composition defects and the one remaining candidate-2
rollback/event-coverage defect were repaired and re-reviewed. The final API
review found two external test-adapter precondition/assertion defects, not new
production regressions: known-edit scenarios must wait for actual document
binding, and modal-to-native handoff must use the native canonical order rather
than assume raw worker order. Those adapter findings do not weaken occurrence
identity or the product's ordering policy.

## Fresh checks on dev

Environment: Linux x64, Node **22.23.2**, npm **12.0.2**.

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed; existing blocked signing-helper install script retained |
| `npm run check` | Passed |
| `npm test` | **837 passed; 0 failed, skipped or cancelled** |
| `npm run spec:check` | **33 passed; 0 failed**, strict validation |
| `npm run package` | Passed; verified 90 main entries and 31 bundled-client entries |
| `git diff --check` | Passed |
| Four isolated Chromium checks | All four exited 0 on the transferred dev source |
| `npm audit --omit=dev --json` | No reported runtime dependency vulnerabilities |

The browser checks executed `test/query-reset-browser.js`,
`scripts/check-stable-snapshot-browser.js`,
`scripts/check-replace-approval-browser.js`, and
`test/browser/modal-viewport.js`. They used Chromium **141.0.7390.37**,
Playwright Core **1.56.1**, disposable HOME/XDG/profiles, production webview
assets, and a synthetic VS Code messaging bridge. Chromium's existing headless
`--no-sandbox` configuration is not a VS Code launch or an OS sandbox.

The complete dependency install reported three moderate development-tool
findings. Dependencies were not silently upgraded or force-fixed during the
release. Generated VSIX files remain ignored and are not committed.

## Isolated application check

The corrected v4 external adapter passed independent compatibility review, but
its exact-source-bound, normal-sandbox-only attempt stopped before the runner
started because of a supervisor receipt/ownership-monitoring error. Cleanup and
unchanged source were verified. Review of the v5 supervisor repair then found
pending-receipt mutation and already-exited identity admission defects. Both were
repaired in v6 and independently re-reviewed. A fresh one-attempt approval bound
v6 to the unchanged complete frozen staging inventory and pinned VS Code 1.144.1
(commit `261c84cb1eddf11235f9e2c921425e9663fbe556`). The staging manifest remains
0.3.2 with the integrated runtime code; this was not an installed 0.4.0 VSIX test.

The actual v6 attempt verified private Xvfb and D-Bus readiness, then Electron
exited 133 before the runner because its SUID `chrome-sandbox` helper was not
configured correctly. `runner-started` and `suite-finished` were absent. Cleanup
and unchanged source were verified, and an independent read-only audit found
none of the six exact known PID/start identities alive. No extension activation,
real `WorkspaceEdit`, scenario outcome or native acceptance is established.
The approval remains consumed; neither the lifecycle pack nor another app
attempt was run. No privileged sandbox helper change, binary substitution, or
`--no-sandbox` retry was performed. The environment failure is not a product
success or failure, and beta publication does not close this acceptance gap.

No ordinary
VS Code profile, environment, extension installation or user document may be
used. A failed sandbox/prerequisite check must be recorded as an environment
limitation, not replaced with an unapproved `--no-sandbox` application launch.

## Acceptance boundaries

- Real frontend clicks, paint, focus, native pixel scroll position and delayed
  TreeView handle delivery are not established by Node/provider/browser tests.
- Windows, WSL, macOS and physical Remote acceptance of this change remain open.
- No global filesystem/workspace transaction, writer provenance, physical-open
  cancellation, or guarantee of zero edits after a failed host apply is claimed.
- Normal query edits still clear immediately. Completed results remain a stable
  snapshot; new matches require an explicit Rerun. Replace All performs a fresh
  full-scope equality check instead of silently adopting a different result set.
- Issue closure and stable release acceptance are separate from publishing a
  beta for the reporter to test.

External command logs and immutable review reports are retained under
`/tmp/jbsearch-issue3-finish-j7aS19/overnight-20261112` and its parent handoff
directory. They are local evidence, not dependencies required to run the
extension. The final beta publication record will identify its own version,
commit, Actions runs, registry metadata and remaining limitations.
