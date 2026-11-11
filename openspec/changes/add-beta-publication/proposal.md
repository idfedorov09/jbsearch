# Proposal

## Why

The issue #3 fixes need an opt-in pre-release for external feedback without
transferring unverified changes to `master` or publishing them as stable.

## What Changes

- Land beta changes only through a reviewed `dev` → `beta` pull request linked
  to the relevant issue without automatically closing it.
- Publish a verified pre-release of the existing extension ID on the resulting
  `beta` push to both registries, retaining the stable routes from `master`.
- Prepare and verify the pre-release marker in the outer VSIX, then verify the
  exact remotely published version, channel, and SHA-256, including retries.
- Protect publication using the existing environments and narrowly scoped
  credentials, with explicit `master` and `beta` branch restrictions.
- Document Open VSX's unversioned `latest` behavior, numeric version ordering,
  and the separately pending Windows/WSL, physical Remote, and native checks.

## Capabilities

### New Capabilities

- `beta-publication`: Controlled push-only publication and verification of a
  pre-release to both extension registries.

### Modified Capabilities

None in the baseline. Earlier publishing change deltas are clarified as stable
routes; this change adds the explicit beta exception.

## Impact

The workflows, package scripts, tests, release documentation, and publishing
requirements change; the runtime and bundled client do not. Implementation and
the public beta were explicitly requested; publishing, real-editor acceptance,
and stable release results remain distinct and must not be inferred from a plan
or local checks. This does not authorize an additional stable publication.
