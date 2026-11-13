# Tasks

> Implementation is in progress on `dev` following the user's request.
> Publication and changes to automatic publication remain outside this
> change's authorized implementation scope.

## 1. Universal package and illustration filtering

- [x] 1.1 Exclude the repository's `images/` illustrations from packaged VSIX files while retaining the source files, icon, webview assets, and bundled client; verify this in the default universal archive and add a regression test.
- [x] 1.2 Verify that the packaged README retains HTTPS illustration links without requiring network access to build or test; document separately that actual gallery and offline display are not established by an archive check.
- [x] 1.3 Preserve the existing stable and pre-release universal commands and expected output filename; verify the existing workflow and channel tests still pass and the universal package retains all 12 executable binaries.

## 2. Platform-specific matrix construction

- [x] 2.1 Add an explicit mapping for the six approved targets and unique output paths plus the full universal fallback; test the exact mapping, unknown-target failure, and absence of output collisions.
- [x] 2.2 Build each target using temporary ignore rules derived from the canonical rules and explicit exclusions for the other 11 ripgrep directories; test target arguments, temporary-file cleanup, failure handling, and source dependency/ignore-file integrity.
- [x] 2.3 Support consistent local stable and pre-release matrix modes while retaining the same source extension ID, version, and bundled UI client; test both channel markers and ensure neither mode publishes.
- [x] 2.4 Report the compressed byte size and verification result for each of the seven outputs; test the report and confirm that each target artifact is smaller than its universal counterpart.
- [x] 2.5 Place matrix outputs outside any existing publication glob, document the local build commands and their non-publication boundary, and test that existing automatic publication routes are not changed or accidentally given matrix files.
- [x] 2.6 Record the implemented architectural decision and alternatives in an English ADR linked to ADRs 0003 and 0006; review that it describes local packaging rather than claiming gallery publication or new platform acceptance.
- [x] 2.7 Add a separate, non-publishing GitHub Actions matrix for all seven artifacts with stable metadata for master/dev and pre-release metadata for beta or beta-targeted pull requests; test its branch/channel guards, job matrix, read-only permissions, and lack of registry credentials.
- [x] 2.8 Upload each verified CI package as a distinct run artifact with a pinned action; test artifact paths and names, and document that the build workflow neither publishes nor gates the existing publication routes.

## 3. Target-aware package verification

- [x] 3.1 Extend verification to compare the expected target to the outer VSIX identity and to require exactly the corresponding packaged executable; test correct targets, mismatched metadata, missing files, foreign binaries, and executable modes.
- [x] 3.2 Preserve no-argument universal verification and require its exact 12-binary inventory; test missing and extra fallback binaries while keeping existing callers and release-channel checks passing.
- [x] 3.3 Verify every artifact retains runtime dependencies, source entry point, worker, UI resources, icon, preview assets, and matching nested client; add negative tests for missing or inconsistent resources.
- [x] 3.4 Test that target resolution remains consistent with the dependency's host-platform and `npm_config_arch` behavior, and document the latter's effect without claiming untested cross-architecture execution.

## 4. Integration and real-editor acceptance

- [x] 4.1 Run `npm run check`, `npm test`, `npm run spec:check`, `npm run package`, and the stable and pre-release matrix builds; record commands, results, package identities, contents, and measured sizes.
- [x] 4.2 On an available Linux x64 host, install or register the matching artifact in a real VS Code window and check activation, Find/Replace, ignore rules, preview, and results navigation; record the exact versions and outcome.
- [ ] 4.3 On available Windows and macOS x64/ARM64 hosts, verify the matching package's activation, search, replacement, and preview; record each actual host separately and leave unavailable combinations unverified.
- [ ] 4.4 In an available mixed-platform Remote setup, verify workspace-host target choice and the bundled local UI client, including theme/grammar preview; record whether SSH is physical, loopback, WSL, or a container and do not generalize the result.
- [x] 4.5 Verify the documented choice of a target-specific VSIX versus the universal fallback in a real supported editor, including any wrong-host error actually observed; record unavailable editor/client checks as pending.

## Workflow follow-up

- Only after separate authorization, design and review target-aware publication
  for both registries, including per-target digest/channel checks, safe retries,
  partial failures, target/fallback selection, and protected environments.
- Before that release, reconcile the versioning policy with immutable artifacts
  distinguished by extension ID, version, and target; choose a new version only
  under the separate release process.
- Gallery image rendering, actual registry installation/updates, additional
  Alpine targets, and archive/sync of this change require their own evidence
  and approvals; a plan or local matrix does not authorize publication.
