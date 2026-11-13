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

The original local checks above did not publish, push or test native-platform or
Remote acceptance. Subsequently, a separately authorized beta release of 0.4.6
was published through reviewed PR #10. GitHub Actions runs 43517394793
(Marketplace) and 43517394815 (Open VSX) succeeded. All seven exact records in
each registry were independently compared with the matching GitHub build
artifacts, including pre-release channel and SHA-256.

From the first publication message to confirmation of all seven targets, the
0.4.6 run took 13 minutes 1 second on Marketplace and 4 minutes 10 seconds on
Open VSX; the preceding 0.4.5 runs took about 45 minutes 10 seconds and 16 minutes
58 seconds respectively. These single runs do not isolate the effect of the
change from registry, network or other variability, and do not guarantee future
latency. Process completion and verification are now separately logged; in the
Marketplace 0.4.6 run, the universal process completed in 4.4 seconds and its
verification took 3 minutes 52 seconds, including repeated checks and delays.

Any real partial release must be investigated by exact registry identity,
version, target, channel and digest before a separately authorized retry. No
client-selection, native-platform or Remote acceptance is claimed by these
publication checks.
