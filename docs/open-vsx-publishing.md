# Publishing JB Search to Open VSX

The repository contains a separate, manually dispatched
`.github/workflows/publish-open-vsx.yml`. It prepares an Open VSX release; it
does not publish by itself and does not change the Microsoft Marketplace
workflow. GitHub must receive the workflow and the user must configure the
required external access before a real publication can run.

## Protect the GitHub Environment first

1. In the `idfedorov09/jbsearch` repository, open **Settings → Environments →
   New environment**, and create `open-vsx`.
2. Under **Deployment branches and tags**, choose **Selected branches and
   tags**, add a **Branch** rule for `master`, and confirm there are no other
   allowing rules. Add required reviewers if the repository plan supports them
   and an additional approval is desired.
3. Verify the restriction before storing a token or granting trusted publisher
   access. An `if` condition in a workflow is not a security boundary: a
   different branch could contain a modified workflow. GitHub can also create
   a missing Environment automatically without the intended protections.

## Prepare the first Action release

Open VSX trusted publishing requires an existing active version of the extension.
For the first Action release, use an Open VSX personal access token:

1. Sign in to Open VSX, sign its Publisher Agreement, and obtain ownership of
   the `idfedorov09` namespace. The namespace owner and extension publisher must
   match the values in `package.json`.
2. In Open VSX **Settings → Access Tokens**, generate a token with a recognizable
   description such as `JB Search GitHub Actions bootstrap`. Copy it immediately;
   Open VSX displays it only once. Never put it in source, issue comments, chat,
   command arguments, logs, or screenshots.
3. In GitHub **Settings → Environments → open-vsx → Environment secrets**, add
   `OVSX_PAT` with that token as its value. This is an Open VSX token, not a
   GitHub or Microsoft Marketplace token. Do not store it as a repository-wide
   secret for this workflow.
4. Separately authorize and complete the required Git operations. A workflow
   must exist on GitHub's default branch before it can be manually dispatched.
   This repository uses `master` as its stable/default branch, and both the
   workflow and Environment restrict publication to `master`.
5. Only when the intended commit and version are approved for **public
   publication**, open **Actions → Publish to Open VSX → Run workflow**, select
   `master`, choose authentication **token**, and start the run. Missing
   `OVSX_PAT` fails the token job; it does not fall back to another credential.

The validation job runs `npm ci --ignore-scripts`, `npm run check`, `npm test`,
`npm run spec:check`, and `npm run package`. The selected publication job runs
on a separate runner, installs from the lockfile, and rebuilds and verifies the
package before passing the main VSIX to `ovsx`. `npm run package` prepares and
checks the nested client VSIX and runtime resources. Only the selected job can
publish; the other authentication job is skipped.

The version comes from `package.json` on the chosen `master` commit. A duplicate
version is an error, not an update or silent replacement. The workflow does not
change the version, create commits or tags, or create a GitHub release. Release
runs share a concurrency group; GitHub can replace an already pending run with
a newer pending run, while an in-progress run is not canceled.

## Switch to Trusted Publishing

After the first version is **active** in Open VSX:

1. Open Open VSX **Settings → Trusted Publishers** and register a GitHub
   publisher for extension `jbsearch` in namespace `idfedorov09`:

   | Field | Value |
   | --- | --- |
   | Organization or User name | `idfedorov09` |
   | Repository name | `jbsearch` |
   | Workflow filename | `publish-open-vsx.yml` |
   | Environment name | `open-vsx` |

2. Confirm that GitHub's `open-vsx` Environment remains restricted to `master`.
   The Open VSX registration identifies the workflow and Environment, but is
   not itself a branch restriction.
3. Delete the `OVSX_PAT` Environment secret and revoke the bootstrap token in
   Open VSX. If bootstrap authentication is needed again, create a new token
   deliberately rather than keeping an unused token indefinitely.
4. For an approved **new** version, run the workflow with authentication
   **trusted**. This job receives a short-lived OIDC token and does not read
   `OVSX_PAT`. An OIDC or trust failure is reported; it does not fall back to a
   PAT or publish by another route.

## External checks after separately authorized publication

- [ ] The expected manual run completed successfully for the intended commit
  and authentication mode.
- [ ] `idfedorov09.jbsearch` is active in Open VSX and its metadata is correct.
- [ ] Installation and relevant Find/Replace behavior were exercised in each
  claimed editor/platform; results are recorded separately from local checks.
- [ ] Once trusted publishing is configured, the bootstrap secret was deleted
  and its Open VSX token was revoked.

No compatibility with Open VSX clients is established by a successful package
build, mock-registry test, or listing alone.

## References

- [Open VSX: Publishing Extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)
- [Open VSX: Trusted Publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)
- [GitHub: Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [GitHub: Manually running a workflow](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/manually-running-a-workflow)
