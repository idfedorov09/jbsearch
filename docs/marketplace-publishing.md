# Publishing JB Search to VS Code Marketplace

The existing `.github/workflows/publish.yml` uses Marketplace Trusted Publishing
for the single extension ID `idfedorov09.jbsearch`. Committing a workflow does
not itself verify the external policy, a successful release, or editor behavior.

## Branches and authorization

- A `master` push or manual `master` dispatch follows the existing **stable**
  route after validation. A new version on a `master` push can publish publicly.
- A non-deletion, non-force `beta` push follows the **pre-release** route after
  validation. Manual `beta` dispatch does not publish. A `dev` push, pull
  request, tag, and foreign repository do not publish either route.
- The `beta` branch is an explicitly authorized publication channel, not an
  ordinary development branch. All changes must reach it through a reviewed
  `dev` → `beta` pull request, linked to the relevant issue without automatically
  closing it; do not commit or push directly to `beta`. PR checks run before merge.
  Publishing and transferring to `master` require applicable authorization.

A prerelease uses the same extension ID and a distinct numeric `major.minor.patch`
version. Marketplace does not accept SemVer suffixes such as `-beta.1`. A later
stable version must have a different and higher number; VS Code can update an
opted-in prerelease user to a numerically higher stable version. See
[Microsoft's prerelease guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions).

## Protect the GitHub Environment and publisher trust

In repository **Settings → Environments → marketplace**, use **Selected branches
and tags** and permit the exact branch names `master` and `beta`; do not allow
other branches or tags. Review branch write restrictions: a contributor able to
modify an allowed branch's workflow can use its publishing authority. YAML `if`
conditions are not a security boundary. The publication workflow itself does
not prove that a beta push came from a pull request; enforce that separately.
Confirm the Environment exists and is protected before granting trust; GitHub
can otherwise create it without the intended restrictions.

The Marketplace trusted-publisher policy must identify repository owner
`idfedorov09`, repository `jbsearch`, workflow `publish.yml`, and Environment
`marketplace`. The publishing job alone receives `id-token: write`; a stored PAT
is not needed. Do not substitute another publisher on an access failure.

## Package and verify

The target-aware workflow prepared on `dev` validates source, tests, strict
OpenSpec, and a complete package matrix before publication. The separate
publishing runner rebuilds the same seven verified artifacts. Both stable and
beta routes set `SOURCE_DATE_EPOCH` from the checked-out commit before preparing
the nested client and outer VSIX files. The nested client cache is rebuilt when
the epoch changes. A failed lookup or an empty or nonnumeric timestamp stops
packaging. This assumes clean build inputs, identical pinned
dependencies, Node and tooling; the timestamp alone cannot guarantee equality.

For either channel, publication preflights every file and uses OIDC to publish
universal first. It must verify that exact universal record before uploading
`win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, and
`linux-arm64`, one upload at a time. Their exact checks can overlap later
uploads; the shared limit is three simultaneous verification attempts, including
response consumption, and does not occupy a slot during retry delays. Every
target must match the Marketplace ID, version, target, channel, validated flag
and SHA-256 before the matrix succeeds. Bounded retries allow for propagation.

Matrix uploads do not use `--skip-duplicate`: a duplicate or any other failed
or inconclusive upload blocks the next write until the exact record is confirmed.
The pinned `vsce` CLI can report a cancellation with exit code zero, so the
Marketplace publisher uses its public `publishVSIX` API in a child process and
requires an explicit acknowledgement after the API resolves. A process exit
alone never proves the final registry record. In the 0.4.6 beta, this loop ran
in about 13 minutes versus about 45 minutes for the prior 0.4.5 run. These are
individual observations, not a guarantee of future latency; the gallery controls
its own processing.

### Partial failure and retry

Publishing seven files is not atomic. A failed job may already have published
multiple uncertain targets as well as confirmed targets. A failure discovered
during an upload cannot cancel it safely; started checks are drained and the
log lists confirmed, uncertain and not-attempted targets. Publisher completion
and verification times are separate; neither is a measurement of registry-only
processing. Preserve the commit, package digests and
run output, inspect each exact target in both registries, and allow for metadata
propagation before deciding whether to retry. A retry must rebuild the same
bytes and verify every duplicate's hash and channel; a mismatch stops the run.
Do not overwrite, unpublish, force, switch publisher or silently reuse a
published version as a shortcut. A new release number and any rerun capable of
publication require separate authorization. Existing event guards and protected
environments still apply, and no commits, tags or releases are created.

## External checks

After an authorized publication, separately record the Actions run and commit,
exact registry version/channel/hash, and whether the intended stable version
remains available. Real VS Code installation, native rendering, and each platform
require their own recorded checks; a registry listing or CI success is not a
substitute. Stopping future releases requires a separately authorized workflow or
trust-policy change.

Sources: [Microsoft Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing),
[GitHub Environment restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags),
and [ADR 0015](adr/0015-beta-push-publication.md).
