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

Each route validates, prepares the nested client, builds the main VSIX and checks
its contents on the publishing runner. The beta route first fixes
`SOURCE_DATE_EPOCH` to the triggering commit timestamp, then builds the outer
package with `vsce package --pre-release` and verifies its ID, numeric version,
and pre-release XML marker. A failed commit lookup or an empty or nonnumeric
timestamp stops the job before packaging. `ovsx` ignores `--pre-release` for an already
packaged VSIX, so adding the flag at upload time cannot repair an unmarked file.

The token routes run the pinned `ovsx` CLI through a process-local HTTP/HTTPS
credential guard. The CLI can otherwise fall back to sending a token in the URL
query when its registry-version request fails. The guard accepts only the
expected request form, the fixed `https://open-vsx.org` origin, and the safe
size-limit query; it rejects token/userinfo URLs, cross-origin redirects, and
unknown forms before sending. CLI messages are suppressed because registry
responses can echo credentials. An outage or protocol change can therefore
produce a generic failure: investigate without logging the token and do not
bypass the guard. Synthetic-token local tests are not proof of a real upload.
The `master` trusted job remains separate and does not read `OVSX_PAT`. It is
unchanged by this beta work and is not covered by the token-route guard; the
pinned CLI's version-failure URL fallback can also affect an exchanged temporary
publishing token. Do not infer that this separate route was hardened or tested.

The beta job verifies the exact public version, `preRelease` flag, and VSIX
SHA-256 after publication or a duplicate skip. A skipped duplicate alone is not
success. Bounded retries address propagation; on mismatch or timeout the job
fails even though the upload may have occurred. Preserve the artifact and run
record and investigate instead of unpublishing, overwriting, or using a different
publisher. Stable token/trusted jobs retain their prior duplicate-error behavior.

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
