# Design

## Context

The current 0.2.2 manifest already contains the requested display name and
description. It has 11 distinct, relevant keywords, including `find in files`.

## Decisions

- Preserve existing relevant keywords and add the 14 missing requested phrases;
  this produces 25 distinct keywords, below the Marketplace limit of 30.
  The [manifest reference](https://code.visualstudio.com/api/references/extension-manifest)
  documents the keyword limit.
- Increase only the main version and matching lockfile fields to 0.2.3. The
  unchanged bundled client stays at 0.1.0. The ID and publisher are unchanged.
- Verify the packaged manifest and Marketplace tags, and compare packaged runtime
  resources against the previous release. Package checks are distinct from GUI
  acceptance and external Marketplace publication.
- Use the existing normal push workflows and [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md).
  Push verified changes to `dev`, fast-forward `master`, and create a stable
  GitHub release at the same commit. Do not wait for CI or Marketplace after
  the `master` push, as requested.

## Risks / Trade-offs

- Keywords improve discoverability only when Marketplace indexes them; no
  ranking or placement is guaranteed.
- A successful push does not establish publication; report the workflow as
  triggered, not successful, without waiting for it.
