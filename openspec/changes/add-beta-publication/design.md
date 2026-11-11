# Design

## Context

The existing Marketplace workflow publishes stable versions on `master` pushes
or dispatches; Open VSX stable publication is manually dispatched from `master`.
The two registries have independent authentication and protected environments.
See ADR 0015 for the explicit beta exception to ADRs 0005 and 0009.

## Goals / Non-Goals

**Goals:** Prepare the same extension ID for beta-only push publication without
changing the stable trigger semantics; fail closed on incorrect package or remote
metadata, and document the external effects.

**Non-Goals:** Stable publication, editor/platform acceptance, automatic beta
publication from `dev` or manual dispatch, changing the bundled client, or a
separate beta extension ID.

## Decisions

1. Reuse the existing workflow filenames and environments. A non-deletion,
   non-force `beta` push runs a prerelease; `master` retains its existing stable
   paths. Environment rules independently allow exactly the required branches;
   YAML guards are not a branch-security boundary. All beta changes arrive via
   a reviewed `dev` → `beta` pull request linked to the relevant issue without
   automatic closure. Such pull requests run checks but do not publish. The
   workflow does not prove push provenance; enforce that separately.
2. Package the outer VSIX with the pre-release marker before passing it to
   either pinned CLI. The existing package check remains in place, and an
   additional channel check rejects incorrect or ambiguous metadata.
3. Set `SOURCE_DATE_EPOCH` from the triggering commit before preparing the nested
   client and outer VSIX. After a publish or duplicate skip, require the exact
   public identity, numeric version, pre-release marker, and VSIX hash. A retry
   with different bytes fails, rather than implicitly accepting a duplicate.
4. Keep Marketplace OIDC and use the existing Open VSX token route for beta;
   trusted Open VSX publishing remains an explicit stable manual choice. Token
   jobs run the pinned CLI under a fail-closed HTTP/HTTPS request guard to prevent
   query-string credentials; unknown request forms and unsafe redirects are
   rejected. There is no credential fallback. A separate beta extension ID or
   new dependency is unnecessary.

## Risks / Trade-offs

- [Beta workflow can access publisher credentials] → Restrict both environment
  deployment rules and branch write access; guard checks alone do not protect a
  modified workflow on an allowed branch.
- [Open VSX `latest` can resolve to a beta] → Document the behavior and check
  exact stable and prerelease versions independently. Client update behavior is
  not inferred without a client test.
- [Registry propagation or mismatched bytes] → Retry bounded reads; if still
  inconsistent, fail and investigate because an upload may already have happened.
- [Beta and stable versions share numeric order] → Require distinct versions;
  a later stable version must exceed the beta for update ordering.

## Migration Plan

Validate the sources, workflows, metadata, and tests; verify environment rules
before an authorized beta push. If publication partially succeeds, retain and
investigate the immutable version and job/artifact evidence; do not unpublish or
switch publisher. Stable transfer remains a separate decision.
