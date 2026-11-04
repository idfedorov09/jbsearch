# Tasks

## 1. Candidate documentation

- [x] 1.1 Prepare CHANGELOG 0.1.0 and a release checklist with links to completed GUI checks and separate open manual macOS/Windows/Remote items; check relative links and main/client version consistency.
- [x] 1.2 Update implementation-limits and the OpenSpec overview for the current panel; synchronize only verified installation-check/find-results-panel requirements, validate specs, and leave unfinished changes open.

## 2. Distribution

- [x] 2.1 Fix the publish job: build/verify the nested client and publish the prepared VSIX; add a regression test, update publication documentation, and check the master-only guards.
- [x] 2.2 Run clean npm ci/check/test/spec:check/package, inspect VSIX contents and Git staging without generated bundles/secrets, and record candidate results.

## 3. Git and CI

- [x] 3.1 Create related commits in dev and push to origin/dev without force; verify that the remote HEAD matches and the GitHub Check passes for the pushed sources, and save the result in the release checklist.

## Workflow follow-up

- Perform release/transfer to master, tags, and publication as separately and explicitly authorized actions after platform acceptance.
- Archive the change after review; do not close other platform or external publication items to make the candidate appear ready.
