# ADR 0005: Trusted extension publishing to Marketplace

> ADR 0015 records the later, explicitly authorized beta-push exception. The
> stable publication routes described here remain unchanged.

- Status: Accepted
- Date: 2026-11-03

## Context

The user approved preparing CI that publishes new versions from `master`.
Access to the `idfedorov09` publisher requires separating ordinary code validation
from publication. External service setup and the actual release are performed
separately; a workflow in the working tree does not confirm that they have happened.

## Decision

GitHub Actions uses Marketplace Trusted Publishing: a separate job obtains
short-lived OIDC credentials and runs `vsce publish --oidc`. The publisher policy
is restricted to the repository, workflow file, and `marketplace` Environment.
The Environment in GitHub is separately restricted to the `master` branch.
The workflow itself also checks the repository and ref.

After successful checks, the version from `package.json` is published;
`--skip-duplicate` skips an already published version without replacing it.
The publishing job has a separate runner and, after `npm ci --ignore-scripts`, runs
`npm run package`: it prepares the nested client VSIX, builds the main package,
and verifies it through `scripts/verify-package.js`. The finished VSIX is published
with `--packagePath ./*.vsix`, without repackaging sources inside `vsce publish`.
On a clean runner, this glob selects one main package in the root; the nested
client package is in `bundled/`. The build from the validation job is not
transferred automatically; rebuilding on the publishing runner retains explicit
verification of runtime resources and the client component without an artifact
transfer mechanism between jobs. Versions, files, commits, and tags are not
changed automatically. Release runs are serialized; queue limits and actual
Marketplace behavior depend on external services.

## Alternatives

A PAT in GitHub Secrets would follow the example of another extension, but is a
long-lived secret that must be created and rotated; global Azure DevOps PATs are
being retired. Manual VSIX upload requires a separate step for each release.
The user rejected both approaches in favor of OIDC.

## Consequences

The publisher must configure a restricted Environment and trust policy once.
After activation, pushing a new version to `master` may trigger a public release;
authorization to transfer changes must account for this consequence. A local
workflow alone does not verify integration with GitHub and Marketplace.

## Sources

- [VS Code: Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing)
- [GitHub: deployment branches and tags](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags)
- [GitHub: workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
