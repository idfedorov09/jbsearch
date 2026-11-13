# Overlapping publication verification: local checks

On November 14, 2026, the change was checked on Linux x64 with Node 22.23.2,
`@vscode/vsce` 4.1.0 and `ovsx` 1.3.0, in an uncommitted `dev` worktree based
on `e86872d`. These checks did not perform a gallery publication or exercise a
real VS Code installation.

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | Passed: 1,004 tests |
| `npm run spec:check` | Passed: 40 items |
| `npm run package` in a temporary source copy after `npm ci --ignore-scripts` | Passed; universal VSIX and nested client verified |
| Simulated publication scheduling | Passed: universal gate, one writer, overlapping exact checks, late checks, failures and partial result reporting |
| Verification request limiting | Passed with slow bodies, redirects and retry sleeps using local fakes |
| Marketplace child process using a stubbed public API | Passed: OIDC options, explicit acknowledgement, cancellation and sensitive errors |
| Pinned Open VSX CLI against a local mock with synthetic token | Passed: guarded requests and duplicate failure without skip |
| Branch/event, protected-environment and token-guard tests | Passed as part of `npm test`; workflow configuration was not changed |

The Marketplace 0.4.5 run measured before this change spent roughly 45 minutes
between our first publication log and final confirmation. The available logs do
not distinguish time taken by publisher process shutdown from verification and
do not prove that gallery processing alone caused the delay. The overlap may
reduce total time on a later release if checks dominate and registry processing
permits it, but these offline tests cannot measure or guarantee such a gain.

No publication, push, branch transfer, release, native-platform acceptance or
Remote acceptance was performed for this change. A real measurement and release
require separate authorization. Any real partial release must be investigated by
exact registry identity, version, target, channel and digest before a retry.
