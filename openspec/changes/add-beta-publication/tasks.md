# Tasks

## 1. Beta package and registry verification

- [x] 1.1 Prepare and validate the outer prerelease marker without changing the client; verify fixture channel tests.
- [x] 1.2 Check exact remote identity, version, marker and SHA-256; verify matching and mismatched duplicate fixtures.
- [x] 1.3 Document numeric versions, registry behavior, and package checks in the publishing guides and ADR 0015.

## 2. Workflow routing and security

- [x] 2.1 Route beta pushes and existing stable events through the current workflows; verify the event/ref/authentication matrix.
- [x] 2.2 Restrict beta credentials and set reproducible build timestamps before packaging; verify ordering and permissions in tests.
- [x] 2.3 Document branch/environment authority and update historical stable publication requirements with the explicit beta exception.
- [x] 2.4 Add beta-targeted PR checks and document reviewed, issue-linked `dev` to `beta` delivery; verify the PR trigger without auto-closing the issue.

## 3. Integration and external evidence

- [x] 3.1 Run `npm run check`, `npm test`, `npm run spec:check`, and stable plus prerelease packaging; record actual outcomes.
- [ ] 3.2 Record the authorized beta publication and exact registry results separately after the GitHub runs complete.
- [ ] 3.3 Record real-editor acceptance and Windows/WSL, macOS, and physical Remote results only when actually performed.
