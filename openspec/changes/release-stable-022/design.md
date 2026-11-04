# Design

## Context

The main extension and both branches are at 0.2.1. Normal `master` pushes run
checks and publish the regular Marketplace channel through the existing OIDC
workflow. Version 0.2.1 is a GitHub pre-release and has Marketplace Preview
metadata. See `proposal.md` for the requested presentation changes.

## Goals / Non-Goals

**Goals:** Ship consistent 0.2.2 metadata, Marketplace-first documentation, and
stable release assets from the verified development commit.

**Non-Goals:** Changing the extension ID, command titles, runtime UI, bundled
client version, platform support code, or workflow configuration.

## Decisions

- Keep `name` and `publisher` unchanged and update only the top-level display
  name. This preserves installed-extension identity and update delivery.
- Remove `preview` rather than setting it to true in any manifest; inspect
  both the packaged JSON and VSIX XML to confirm the Preview flag is absent.
  The [manifest reference](https://code.visualstudio.com/api/references/extension-manifest)
  defines `displayName`, identity, and Preview metadata. Marketplace Preview is
  separate from the pre-release publication channel.
- Point the README version badge at the latest non-prerelease GitHub release.
  A package-version badge on `dev` can advertise an unpublished version.
- Put basic Marketplace installation and the two main shortcuts near the top;
  preserve source registration and VSIX development instructions in CONTRIBUTING.
- Attribute macOS/Linux acceptance to the user's November 4, 2026 report.
  Do not convert expected Windows compatibility into a completed Windows test.
  Preserve historical reports, adding a current platform-acceptance record.
- Use the existing publication architecture and security restrictions recorded
  in [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md);
  no architectural decision changes are needed.
- Keep normal push-triggered workflows enabled. Inspect the `dev` result before
  a fast-forward to `master`, then verify both validation and publication there.
  Use the same verified commit for the stable GitHub tag and release assets.

## Risks / Trade-offs

- A public badge needs a published stable GitHub release → verify the actual
  `latest` release after publication and keep historical 0.2.1 unchanged.
- Marketplace caches can lag a successful workflow → distinguish job success
  from verified gallery/listing metadata and recheck the public endpoint.
- Windows or cross-machine Remote issues may remain → describe only the
  platform checks actually performed or reported.
- Concurrent branch changes → fetch and verify ancestry immediately before
  transferring the tested history; never force-push or rewrite it.

## Migration Plan

Commit verified changes on `dev`, push normally, wait for its checks, then
fast-forward `master` and push normally. Observe the existing Marketplace job.
Publish stable 0.2.2 notes and the verified VSIX with its checksum, and confirm
the tag, release, branch refs, package identity, and gallery metadata.
