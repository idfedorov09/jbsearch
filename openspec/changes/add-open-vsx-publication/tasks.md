# Tasks

## 1. Workflow and documentation

- [x] 1.1 Add the pinned CLI and manually dispatched workflow, then verify the
  repository/ref guards, exclusive authentication jobs, and package checks.
- [x] 1.2 Document Environment protection, bootstrap, trusted publishing, and
  limitations in an ADR and the Open VSX guide; validate the OpenSpec change.
- [x] 1.3 Add workflow security tests and exercise token/OIDC CLI publication
  against a local mock registry without external publication.

## 2. Integration validation

- [x] 2.1 Run `npm ci`, `npm run check`, `npm test`, `npm run spec:check`, and
  `npm run package`; validate the workflow with an Actions-aware linter.
- [ ] 2.2 After separately authorized setup and publication, record the real
  GitHub Actions result, Open VSX listing, and installation in tested editors.

## Workflow follow-up

- Do not commit, push, transfer to `master`, publish, or archive this change
  without a separate user request.
