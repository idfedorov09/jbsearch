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

Both routes run install, code checks, tests, strict OpenSpec validation, and
packaging before publication. The separate publishing runner rebuilds and checks
its own main VSIX, including its nested UI client and runtime resources. Stable
packaging uses `npm run package`. The beta route sets `SOURCE_DATE_EPOCH` from
the triggering commit before running `npm run package:pre-release`; this builds
the outer VSIX with the pre-release marker, checks its contents and identity,
and verifies the marker before passing the finished file to `vsce`. A failed
commit lookup or an empty or nonnumeric timestamp stops the job before packaging.

The beta job uses the prebuilt file and verifies the registry's exact ID,
version, pre-release marker, and SHA-256 after publication or a duplicate skip.
A `--skip-duplicate` result alone does not establish that the existing version
contains the intended bytes. Bounded retries account for propagation. A mismatch
or unavailable response fails the job, and publication may already have
occurred; investigate the immutable artifact and run before retrying. Do not
replace, unpublish, force, or change publisher as a recovery shortcut. Bytewise
reproducibility assumes the same source, pinned tools, and clean build inputs.

The stable route retains its previous duplicate-skip behavior and does not gain
a new stable publishing trigger. Neither route creates commits, tags, or releases.

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
