# GitHub funding configuration

## Result — 2026-11-04

Added `.github/FUNDING.yml` with the user-provided custom Tribute URL. GitHub
reported sponsorships already enabled and no current funding links. The default
branch remained `master`, so the Sponsor button was not yet activated by this
`dev` change.

## Verification

- Parsed the YAML and verified its exact URL matches `package.json` and both
  README donation links.
- `npm run check` passed; `npm test` passed 195/195 without skips.
- `npm run spec:check` passed 20/20; `git diff --check` passed.
- No payment, repository settings change, publication, push, or transfer to
  `master` was performed. The live Sponsor button was not checked after a
  default-branch transfer.
