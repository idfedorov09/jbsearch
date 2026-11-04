# Proposal

## Why

The user requested a GitHub Sponsor button using the existing Tribute link,
with the configuration committed to `dev` before any transfer to `master`.

## What Changes

- Add `.github/FUNDING.yml` with the exact user-provided custom URL.
- Verify the file and record the current repository sponsorship setting.
- Commit the change locally on `dev`; leave `master` unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is GitHub repository metadata and opts out of product spec deltas.

## Impact

Only GitHub funding configuration and this OpenSpec change are affected.
Repository sponsorships are already enabled. The Sponsor button requires the
file on the default branch, currently `master`; transfer and push are outside
the user's present request.
