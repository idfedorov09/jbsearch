# Publishing JB Search to Open VSX

The existing `.github/workflows/publish-open-vsx.yml` publishes the same
`idfedorov09.jbsearch` ID used by Marketplace. Its stable and prerelease routes
are deliberately different:

- **Stable:** manually dispatch on `master` and explicitly select `token` or
  `trusted`. A `master` push does not automatically publish to Open VSX.
- **Pre-release:** a non-deletion, non-force `beta` push uses the explicitly
  selected token route after validation. Manual `beta` dispatch, `dev` pushes,
  pull requests, tags, and foreign repositories do not publish a beta.

A beta push is a public action after the external access rules are configured.
All changes must reach `beta` via a reviewed `dev` → `beta` pull request linked
to the relevant issue without automatically closing it. Do not make or push
direct beta commits; review sources, version, limitations, checks, and release
authorization before merging. The workflow reacts to beta pushes but does not
itself prove pull-request provenance; enforce that rule separately.
Neither route creates a commit, tag, or GitHub release.

## Protect the Environment

In **Settings → Environments → open-vsx**, restrict deployment to the exact
branch names `master` and `beta`. Do not use wildcard or unrestricted rules.
The Environment must exist and be protected before storing a secret or granting
trusted publisher access. A workflow guard is not a security boundary for a
modified file on an allowed branch: protect branch write access separately.
The beta token job reads only the Environment secret `OVSX_PAT` and has no
`id-token: write`; a missing token fails without a fallback. Never put the token
in source, command arguments, logs, screenshots, or issue comments.

## Package and publication checks

The target-aware workflow prepared on `dev` validates a complete matrix, then
rebuilds and verifies all seven packages on the publishing runner. Before
preparing either the nested client or outer files, both channels set
`SOURCE_DATE_EPOCH` from the checked-out commit; a failed or malformed lookup
stops the build, and the nested client cache is rebuilt if its epoch differs.
Bytewise reproduction also depends on the same clean inputs,
Node and pinned tools. `ovsx` ignores `--pre-release` for a prebuilt VSIX: the
marker must already be present and checked in the archive.

Each eligible route preflights all files, publishes universal and verifies its
exact record, then uploads the six platform files sequentially. Exact checks
for the platform files may overlap later uploads; at most three verification
attempts are in flight, including response consumption, and a retry sleep does
not occupy a slot. Every record must match the registry identity, version,
target, channel and SHA-256. A universal fallback cannot satisfy a platform
check. Bounded retries allow for propagation, and the matrix succeeds only
after every target is confirmed.

Matrix uploads do not use `--skip-duplicate`: a duplicate or another failed or
inconclusive upload blocks the next write until its exact record is confirmed.
The 0.4.6 beta loop ran in about 4 minutes 10 seconds versus about 17 minutes
for the preceding 0.4.5 run. These individual observations do not guarantee
future latency or imply that gallery processing itself was accelerated.

The token routes run pinned `ovsx` through a process-local HTTP/HTTPS credential
guard. The CLI can otherwise fall back to a token-bearing URL query when its
registry-version request fails. The guard permits only the expected request
form, the fixed `https://open-vsx.org` origin and safe size-limit query, and
rejects token/userinfo URLs, cross-origin redirects and unknown forms. CLI
messages are suppressed because a registry response could echo credentials.
An outage or protocol change may therefore give a generic failure: investigate
without logging the token and never bypass the guard. Synthetic-token local
tests are not real publication evidence. The separate master trusted route does
not read `OVSX_PAT` and remains outside this guard; the pinned CLI's fallback can
also affect its exchanged temporary token, so that route is not represented as
hardened.

### Partial failure and retry

The matrix is not atomic. A failure discovered during a later upload cannot
safely cancel it, and multiple targets may be uncertain. The run drains started
checks and reports confirmed, uncertain and unattempted targets. Publisher
completion and verification times are distinct; neither isolates registry-only
processing. Preserve the exact commit, package digests
and logs, inspect each target on both registries and allow for propagation before
choosing a recovery. A retry must rebuild identical bytes and verify each
duplicate's target, channel and hash. A mismatch or timeout is a failure, not
permission to overwrite, unpublish, change publisher, or hide a conflict. A new
release number and any rerun capable of publication require separate approval.

## Registry `latest` and version ordering

Use a distinct numeric version, not a SemVer prerelease suffix, so the same
package also meets Marketplace requirements. A later stable version must be
different and higher. Open VSX's unversioned `latest` can resolve to a higher
pre-release even while an earlier stable version remains available by its exact
version. Do not infer every editor's update behavior from the registry alias;
test each claimed client separately.

## Access and follow-up

Open VSX trusted publishing requires an active extension and a registration for
this repository, `publish-open-vsx.yml`, and `open-vsx` Environment. Once trust
is registered, `master` manual runs can explicitly select `trusted`; a failure
never silently falls back to a token. The beta route intentionally uses the
protected token until a separately authorized change selects another route.

Record successful Actions runs, commit, exact beta and stable registry metadata,
artifact hashes, and any partial failure after an authorized publication. Test
installation and Find/Replace in each claimed editor/platform separately; a
mock registry, listing, or local package is not a real-editor acceptance.

Sources: [Open VSX Publishing Extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions),
[Open VSX Trusted Publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing),
[GitHub deployment rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags),
and [ADR 0015](adr/0015-beta-push-publication.md).
