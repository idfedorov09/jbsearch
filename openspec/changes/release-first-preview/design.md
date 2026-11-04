# Design

## Context

The checked-in `publish.yml` runs on every `master` push and its `marketplace`
environment permits `master` without a required reviewer. Publisher trust is
not confirmed, so a regular push could publish the extension. The separate
`Check` workflow supports manual dispatch.

## Goals / Non-Goals

**Goals:** Release the exact verified 0.2.1 sources and VSIX on GitHub, record
the incomplete platform acceptance, and transfer `dev` to `master` safely.

**Non-Goals:** Modifying the Marketplace workflow or its settings, changing
extension functionality, or claiming unperformed GUI acceptance.

## Decisions

- The existing package version is 0.2.1 in both the main manifest and lockfile;
  the unchanged nested client is 0.1.0. Use `v0.2.1` rather than inventing a
  new version.
- Mark the GitHub release as a pre-release, consistent with the README's preview
  status and incomplete macOS, Windows, and physical Remote checks.
- Set the extension manifest's `preview` flag so its Marketplace page is also
  labeled Preview if the normal publishing job succeeds. This label is distinct
  from a Marketplace pre-release version; the existing workflow publishes to the
  regular channel. See the [extension manifest reference](https://code.visualstudio.com/api/references/extension-manifest).
- Do not skip or alter push-triggered workflows. Wait for `Check` on the exact
  release commit before transferring it, and observe both normal workflows on
  `master`, including the Marketplace job. Publisher trust is unconfirmed.
- Fast-forward the remote `master` only if it is an ancestor of the verified
  `dev` commit. Create the GitHub release tag from that commit and attach the
  generated VSIX and its SHA-256 checksum; generated packages remain outside Git.

## Risks / Trade-offs

- Marketplace publication can fail if trusted publishing has not been configured
  → report the actual job outcome without changing repository or publisher settings.
- The release has platform-validation gaps → make the pre-release status and
  known limitations prominent in the notes.
- GitHub or Marketplace state can change concurrently → recheck remote branches,
  existing tags, and workflow runs before publishing.

## Migration Plan

Commit and push the verified release preparation to `dev`, verify its normal
`Check`, fast-forward `master`, and observe its normal workflows. Publish the
GitHub release once source and package checks succeed; report any independent
Marketplace authentication failure rather than presenting it as a successful
publication.
