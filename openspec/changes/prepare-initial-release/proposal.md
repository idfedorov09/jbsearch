# Proposal

## Why

On 2026-11-04, the user authorized release preparation, commits, and push to `dev`.
The implemented product is not yet in Git history; before delivery, align the
documentation with the code and check that the distribution is reproducible.

## What Changes

- Keep the current first-release version `0.1.0` in main/client manifests and lockfiles.
- Add a changelog and candidate checklist, separating completed checks from
  remaining macOS/Windows/physical Remote acceptance.
- Fix the prepared publish job: build and verify the nested client on its own
  runner, then pass the resulting VSIX to `vsce publish`.
- Align the limitations with native Find Panel; update the OpenSpec overview and
  synchronize only verified installation-command and new-panel requirements.
- Check a clean dependency installation, code, tests, specs, and package contents;
  create related commits, push only to `origin/dev`, and check CI.

Confirmed scope is preparation and `dev`. Publication, Marketplace
Environment/trust, transfer to `master`, Git tags, artwork, and a new version
number are outside the scope. Linux checks do not close open platform items.

## Capabilities

### New Capabilities

No new user-facing capabilities.

### Modified Capabilities

Product requirements remain unchanged: this fixes the build of the existing
publication process and documents behavior already verified. `skip_specs: true`;
synchronizing existing deltas introduces no new contract.

## Impact

Publication workflow and its regression test, changelog, README/limitations,
release checklist, OpenSpec overview, and verified baseline specs. Runtime code,
client protocol, and dependencies remain unchanged. Pushing `dev` runs ordinary CI.
