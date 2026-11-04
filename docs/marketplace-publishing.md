# Publishing JB Search to VS Code Marketplace

The repository includes a prepared `.github/workflows/publish.yml`. Its presence
in the working tree or `dev` does not itself activate releases: GitHub Actions
uses committed files, while trust and restrictions are configured separately.

## One-time user setup

Configure the restricted environment first, then publisher trust. You need GitHub
repository owner permissions and access to Marketplace publisher `idfedorov09`.

### 1. Restrict the GitHub Environment

1. On GitHub, open `idfedorov09/jbsearch` → **Settings** → **Environments** →
   **New environment**. Create `marketplace`.
2. Under **Deployment branches and tags**, choose **Selected branches and tags**.
3. Select **Add deployment branch or tag rule**, choose **Branch**, enter
   `master`, and save. Confirm there are no other allowing rules.
4. Do not add required reviewers if releases should be fully automatic.
   Environment secrets are not needed for OIDC.

Checking `master` in YAML alone is insufficient: an untrusted branch can contain
its own version of that file. Configure the Environment restriction **before**
granting the workflow Marketplace trust. GitHub can automatically create a
missing Environment without protection, so a pre-created, verified rule matters.

### 2. Configure Marketplace trust

1. Sign into the [publisher dashboard](https://marketplace.visualstudio.com/manage)
   with an account authorized for `idfedorov09`.
2. Select publisher **idfedorov09** → **Trusted Publishing** → **Create**.
3. Enter:

   | Field | Value |
   | --- | --- |
   | Policy name | For example, `jbsearch-publish` |
   | Repository owner | `idfedorov09` |
   | Repository | `jbsearch` |
   | Workflow | `publish.yml` |
   | Environment | `marketplace` |

4. Save the policy. Names must match GitHub and the workflow file.
   A personal token, GitHub Secret `VSCE_PAT`, and Azure DevOps PAT are not needed.

If publisher access or the required settings are unavailable, stop and resolve
permissions; do not silently create another publisher.

## Release process

Once the workflow is in `master` and both settings above exist, a push to `master`
runs validation and, on success, publishes the version from `package.json`.
The publication job uses a separate runner: after `npm ci --ignore-scripts`, it
runs `npm run package`. That command builds the nested client VSIX, packages the
main extension, and checks package contents with `scripts/verify-package.js`,
including the client component and runtime resources. The verified VSIX is passed
to `vsce publish` through `--packagePath ./*.vsix`; publication does not repackage
sources. The validation job's build is not automatically transferred between
runners. The clean publication runner has one main VSIX in the root; the client
package is in `bundled/`.

Manual GitHub Actions dispatch is also restricted to `master`. An existing
version is skipped: it **does not update** that version's contents. For a new
release, first update `package.json` and the matching `package-lock.json`.
The workflow creates neither commits nor tags.

**After trust is activated, pushing a new version to `master` can automatically
publish it publicly.** Before transferring, confirm that sources, description,
and supported platforms are ready; explicitly agree on the transfer and
publication. CI builds the package, so no manual VSIX upload is needed.
Local workflow and packaging checks do not confirm trust setup or a successful
real release; record those outcomes separately after authorized publication.

## Checks after the separately authorized first release

- [ ] GitHub Actions validation and publication jobs passed for the intended commit/version.
- [ ] The `idfedorov09.jbsearch` listing is available and its description matches the package.
- [ ] The extension installs from Marketplace and starts in clean VS Code.
- [ ] Manual Find/Replace and platform checks are recorded separately in the
  [testing matrix](testing/find-replace.md).

To stop future releases, the user can disable the workflow or revoke its trust
policy. These external actions are not performed automatically.

Sources: [Microsoft Trusted Publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing),
[GitHub Environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
