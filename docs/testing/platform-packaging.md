# Platform packaging validation

## Automated local evidence: 2026-11-13

These are build and archive checks, not a release or a real-editor acceptance.
They ran on Linux x86-64 with Node.js 22.23.2, npm 12.0.2, and source manifest
`idfedorov09.jbsearch` version `0.4.2` on `dev`. Stable and pre-release matrix
artifacts were generated separately from the same source version solely for
testing; publishing both channels requires the distinct versions described by
the release policy.

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 949 tests passed |
| `npm run spec:check` | 38 items passed |
| `npm run package` | Passed; universal `jbsearch-0.4.2.vsix`, 12 ripgrep binaries |
| `npm run package:pre-release` | Passed; same legacy filename, universal inventory and pre-release marker |
| `npm run package:matrix` | Passed; seven stable packages |
| `npm run package:matrix -- --pre-release` | Passed; seven pre-release packages |
| `node scripts/verify-release-channel.js stable` | Passed for the final legacy universal package |
| Clean temporary copy: `npm ci --ignore-scripts` followed by `SOURCE_DATE_EPOCH=<commit timestamp> npm run package:matrix -- --target linux-x64 --pre-release` | Passed; exercises a beta-style CI build from installed dependencies |

For each matrix entry, the build checks the outer identity and target,
requested channel, binary inventory and hashes against the installed pinned
dependency, Unix executable bits, runtime resources, icon, nested client, and
README illustration references. The six targeted archives contain one native
binary each; universal has all 12. No `images/` files are included. Both sets
retained the same extension ID and version, and every targeted artifact was
smaller than its universal counterpart.

| VSIX target | Stable size (bytes) | Pre-release size (bytes) |
| --- | ---: | ---: |
| `win32-x64` | 2,595,883 | 2,595,893 |
| `win32-arm64` | 2,458,086 | 2,458,096 |
| `darwin-x64` | 2,465,241 | 2,465,252 |
| `darwin-arm64` | 2,406,174 | 2,406,185 |
| `linux-x64` | 2,836,172 | 2,836,182 |
| `linux-arm64` | 2,577,958 | 2,577,968 |
| universal | 24,415,965 | 24,415,976 |

The build reports package paths and SHA-256 digests as well as sizes. Values
above are observations for this source and build, not size guarantees.
Generated VSIX files are not tracked in Git.

After dependencies were installed, a separate Linux x64 build was traced with
`strace -f -e trace=network`; it succeeded without an Internet socket or
connection. The observed network-family calls only queried local interfaces
through netlink. This is local evidence for this build, not a guarantee that
dependency installation works offline. Archive verification inspects README
HTTPS links and existing source illustrations locally without fetching them.

The clean install reported three moderate `npm audit` findings in development
tooling (`@vscode/vsce`, `ovsx`, and their `minimatch` chain); a separate
`npm audit --omit=dev` reported zero production findings on this date. No
dependency versions were changed as part of this packaging work.

## CI and publication boundary

The new GitHub Actions workflow is configured to build each target in a separate matrix job and
uploads the verified VSIX as a run artifact. Automated tests exercise its
branch/channel selection and isolation, but this workflow has not been run on
GitHub as part of this local verification. Its results are not a publication
gate. At the time of these checks, the publication workflows were unchanged and
published only the universal package. The later target-aware workflow is a
separate change documented in [ADR 0018](../adr/0018-platform-gallery-publication.md).
No package was published to Marketplace or Open VSX by these local checks.

## Installed VSIX checks: Linux x64, 2026-11-13

Stock VS Code **1.144.1** ran in normal windows on **Linux x64, X11/Xvfb**,
using separate temporary user-data and extensions directories and synthetic
workspaces. The `linux-x64` VSIX was installed through the VS Code CLI, not
loaded from the source folder. Playwright controlled the actual VS Code window.
The following checks passed:

- The extension activated and found two matches in a JavaScript file while a
  matching `.ignore`-excluded file remained excluded.
- The modal preview showed the source, and clicking a Find Panel result opened
  the source editor.
- Replace All changed both matches, left changes unsaved until explicitly saved,
  and did not modify the ignored file. The resulting snapshot became INVALID,
  as designed. The first test-harness attempt incorrectly expected the old live
  result count to fall to zero; the retry checked the actual replacement message
  and snapshot state instead.

The separately installed universal VSIX also activated and found the same two
matches in an isolated Linux workspace. The VS Code CLI accepted a Windows x64
VSIX in a third, separate Linux profile without a wrong-platform install error.
Its search then reported `spawn .../bin/linux-x64/rg ENOENT`, because that
archive contained only the Windows executable. This is evidence for this local
CLI/editor version, not for other editors or gallery selection. Choose the
VSIX for the workspace host, or the universal fallback, rather than relying on
an incompatible manual installation being rejected. All three checks used
local artifacts; none published or contacted a gallery for installation.

The later target-aware workflow preparation and its independent local build
checks are recorded in [platform publication validation](platform-publication.md).
Those checks did not publish the matrix.

## Manual and external checks still pending

- Windows and macOS x64/ARM64 runtime and editor checks, separately per host.
- A mixed-platform Remote check, recording the actual host topology and the
  bundled local UI client's theme and grammar preview. Package the workspace
  host's target; `npm_config_arch`, when set, changes the architecture resolved
  by the ripgrep dependency. Archive inspection alone does not prove execution.
- Gallery preference and fallback selection, other editor/client behavior,
  and published artifact verification on both registries.
- README rendering in each gallery and offline. Packaged illustrations are
  HTTPS links to the source repository's mutable `HEAD`, so access to GitHub is
  required to fetch them and their eventual availability is not established by
  checking the archive. The source illustrations remain in the repository.

For historical platform evidence unrelated to these new VSIX files, see
[platform acceptance](platform-acceptance.md). Do not infer physical SSH,
additional architectures, Alpine, or gallery support from the checks above.
