# GitHub community standards

## Result — 2026-11-04

Added a Contributor Covenant 3.0 code of conduct, a security policy, issue
forms and chooser configuration, a pull request template, and links from the
contribution documentation. Both policies use the email published on the
maintainer's GitHub profile; no test email was sent and delivery was not checked.

The GitHub About description and private vulnerability reporting setting were
not changed. GitHub's default branch remains `master`, so the policies and
templates in `dev` are not yet active there. The proposed description and
post-transfer checks are documented in the design and task list.

## Verification

- Bug and feature forms and the chooser configuration parsed successfully and
  validated against SchemaStore's GitHub issue form and chooser schemas.
- Confirmed the security-policy route is reachable, reviewed the form and PR
  contents, and checked the new repository-relative documentation links.
- `npm run check` passed; `npm test` passed 195/195 without skips;
  `npm run spec:check` passed 21/21.
- `npm run package` passed and verified the main VSIX and bundled client;
  generated VSIX packages are excluded from Git. `git diff --check` passed.
- No manual VS Code editor check was performed: this change only adds GitHub
  files and documentation and does not change extension behavior. GitHub's live
  chooser, policy discovery, PR template, and Community Standards checks have
  not been verified with the files on the default branch.
