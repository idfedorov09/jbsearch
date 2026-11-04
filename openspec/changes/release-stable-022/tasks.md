# Tasks

## 1. Release identity and public documentation

- [x] 1.1 Set the main version to 0.2.2, update the Marketplace display name, and remove Preview metadata; verify package/lockfile agreement and preserved extension identity.
- [x] 1.2 Refresh README badges, icon, installation, Usage, and feedback copy, preserving source and VSIX development guidance in CONTRIBUTING; review links and packaged README.
- [x] 1.3 Record user-reported macOS/Linux acceptance and outstanding Windows/Remote checks in current validation/readiness documentation; verify no unperformed test is marked complete.
- [x] 1.4 Add the 0.2.2 changelog and stable release notes; review them against actual manifest, runtime boundaries, and platform evidence.

## 2. Integration verification

- [x] 2.1 Run check, all tests, strict OpenSpec validation, production dependency audit, and package verification; inspect the main/nested VSIX, version, display name, README, and absent Preview flag, and record actual outcomes.

## Real VS Code manual checklist

The user reported successful macOS and Linux use on November 4, 2026. Exact
builds, architectures, scenario coverage, and Remote topology were not supplied.
This release changes metadata and documentation only; no additional GUI run is
claimed. Windows acceptance, physical Remote between separate machines, WSL,
and Dev Containers remain unverified.

## Workflow follow-up

- Commit and push to `dev`; verify the normal Check on the exact commit.
- Fast-forward `master` only after the `dev` check succeeds, push it normally,
  and verify Check and Publish VS Code Extension without skip instructions.
- Publish and verify stable GitHub release `v0.2.2` with the VSIX and SHA-256
  checksum; verify that `latest` and the public version badge resolve to it.
- Check Marketplace version, display name, and absence of Preview metadata;
  distinguish public availability from workflow success.
