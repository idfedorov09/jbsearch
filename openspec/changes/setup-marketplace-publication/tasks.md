# Tasks

## 1. Workflow and agreements

- [x] 1.1 Add an OIDC publication workflow after validation and an automated test
  for its restrictions; test the `master`-only rule, validation order,
  duplicate versions, and minimum permissions.
- [x] 1.2 Document the decision and GitHub Environment / Marketplace setup in an
  ADR and documentation; verify that local preparation is not called publication.

## 2. Integration validation

- [x] 2.1 Run `npm run check`, `npm test`, `npm run spec:check`, and
  `npm run package`; separately check workflow correctness and report findings.
- [ ] 2.2 After separately authorized external service setup and publication,
  check GitHub Actions, the Marketplace listing, and installation in real VS Code;
  record the result separately from local automated checks.

## Workflow follow-up

- Do not transfer to `master`, publish, or archive the change without a separate
  user request.
