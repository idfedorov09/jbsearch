# Beta publication preparation checks

Date: **November 12, 2026** (Europe/Moscow). These are local preparation checks,
not publication or real-editor acceptance. The pre-release candidate uses outer
extension `idfedorov09.jbsearch` 0.4.0 and the bundled client 0.1.0. The earlier
unpublished `0.3.3` draft was renumbered under the
[versioning policy](../versioning.md); no published package was replaced.

## Local checks

Environment: Linux x64, Node **22.23.2**, npm **12.0.2**, installed pinned
`@vscode/vsce` **4.1.0** and `ovsx` **1.3.0**.

| Check | Result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 871 passed; 0 failed, skipped, or cancelled |
| `npm run spec:check` | 35 passed; 0 failed |
| `npm run package` | Passed; 90 main and 31 nested-client entries verified |
| `npm run package:pre-release` | Passed; 90 main and 31 nested entries verified; one true outer prerelease marker |
| `git diff --check` | Passed |

These commands were rerun on the final `0.4.0` version/policy tree, after the
earlier CI-preparation draft passed 871 tests and 34 spec validations. The lock
change is limited to the root numeric version; runtime dependencies, `src/`,
`media/`, and `client/` are unchanged by the version/policy revision.

The stable-channel and pre-release packages were built locally for verification
only and are not release evidence. The local prerelease build used the then-HEAD
commit timestamp for `SOURCE_DATE_EPOCH`; the eventual beta commit will have its
own timestamp. The locally reused nested client was checked for the expected ID,
version, and absence of a prerelease marker.

For the earlier unpublished `0.3.3` draft, two separate clean-like temporary
directories reused the same installed pinned
dependencies and fixed `SOURCE_DATE_EPOCH=1700000000`. Their full pre-release
packages matched byte-for-byte (SHA-256
`d6bfe9717ba8912c073600dea61221c707edd163de6e0cc155dd771cd08436c1`), and their
independently rebuilt nested clients matched byte-for-byte (SHA-256
`fb812a814473aa87ec6d1021ad7c3922f096226dbf68d0f1a4e1ec360ca2377b`). This is
not proof of byte reproducibility across different runners or future toolchains.

## Safety and routing tests

Workflow-guard tests evaluate the actual checked-in job expressions over stable,
beta, dev, manual, pull-request, tag, foreign-repository, deletion, and forced
push cases. The normal validation workflow includes pull requests targeting
`beta` and checks the marked beta package; it also runs on beta pushes.
Publication workflows do not run on those PR events.
Timestamp regression tests execute all five checked-in workflow shell blocks
under `bash -e -o pipefail`: invalid commit IDs, failed Git calls, and empty or
malformed timestamps leave `GITHUB_ENV` unchanged and stop before packaging;
valid commits write their numeric timestamp and allow packaging to proceed. Matching and conflicting duplicate hashes are checked independently
of the publishing CLI's success. Fixtures reject missing, false, duplicate, split
Properties, multiple Metadata, and multiple Identity pre-release manifests.

The Open VSX test harness runs the actual pinned CLI against loopback mock
registries using a synthetic token. It covers header-only success with the exact
VSIX bytes; unavailable, malformed, absent, and old registry-version responses;
same-origin and unsafe redirects; unsupported request forms; and sanitized errors.
Unsafe query/userinfo requests are rejected before a forbidden mock request. No
actual PAT, public write, or production publication was used in these tests.
The unchanged stable trusted Open VSX route is not covered by the token guard.

## Remaining evidence

An external v4 native-check attempt stopped before its runner started because of
a supervisor ownership-monitoring error; cleanup was verified and no survivors
were reported. This establishes neither native acceptance nor a product failure;
the later v6 repair passed independent review. Its separately approved normal-
sandbox attempt verified the private display/bus, but Electron exited 133 before
the runner because the SUID `chrome-sandbox` helper was not configured correctly.
Both readiness receipts, cleanup, unchanged source, and absence of all six known
PID/start identities were checked. No extension activation or real edit was established;
there was no privileged-helper change or `--no-sandbox` retry. This is an
environment limitation, not native acceptance or a product failure.
Windows, WSL, macOS, and physical
Remote acceptance of issue #3 remain open. CI execution, both public registry results, installation behavior, and the
reporter's feedback must be recorded separately when actually observed. The
source integration record is [issue-3-dev-beta-validation.md](issue-3-dev-beta-validation.md).
