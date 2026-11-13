# Platform publication preparation: local validation

On November 13, 2026, the target-aware publication change was validated on
Linux x64 with Node 22.23.2, `@vscode/vsce` 4.1.0 and `ovsx` 1.3.0. The tested
source was an uncommitted `dev` worktree based on commit
`3c715f8576dcee1d410d3ae53ae1eb4af0860d06`; these test builds do not represent
an authorized release and must not be confused with the existing published
0.4.4 artifacts.

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | Passed: 988 tests |
| `npm run spec:check` | Passed: 39 items |
| `npm run package` in a temporary source copy | Passed; universal VSIX and nested client verified |
| Stable and pre-release `npm run package:matrix` in two independently installed temporary source copies | Passed: seven artifacts per channel and copy |
| Compare SHA-256 files from both copies with the same `SOURCE_DATE_EPOCH=1794592930` | All seven stable and all seven pre-release digests matched between copies |
| Real VSIX preflight for Marketplace beta, Open VSX stable token and trusted modes, with simulated uploads and verification | Passed: seven files per route; no real upload |
| Mock CLI and registry tests, including actual pinned `ovsx` against a local mock and synthetic token | Passed; no real upload |
| Read-only public metadata and digest verification of the existing universal 0.4.4 | Passed on Marketplace and Open VSX; this does not establish platform publication |

Both temporary copies ran `npm ci --ignore-scripts --prefer-offline --no-audit
--no-fund`; they did not reuse `node_modules` or the generated client cache.
The commit timestamp was used for the reproducibility experiment even though
the source included local changes. This result is limited to these inputs and
this environment; a future run must compare its own files, not assume the hashes.

The pre-release test build produced these sizes:

| Target | VSIX bytes |
| --- | ---: |
| `win32-x64` | 2,596,414 |
| `win32-arm64` | 2,458,617 |
| `darwin-x64` | 2,465,772 |
| `darwin-arm64` | 2,406,705 |
| `linux-x64` | 2,836,703 |
| `linux-arm64` | 2,578,489 |
| universal | 24,416,497 |

No platform package was published during this work. GitHub Actions execution,
actual platform-specific registry publication, gallery and client selection,
Windows/macOS native runtime checks, and mixed-platform Remote checks remain
separate and unverified. In particular, whether an existing universal
installation switches to a target-specific artifact at the same version has not
been established. The previously published 0.4.4 pre-release remains
universal-only. The local workflow changes are not permission to commit, push,
merge, rerun a publishing job, or otherwise release them.
