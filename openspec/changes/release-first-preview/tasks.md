# Tasks

## 1. Release preparation

- [x] 1.1 Update the 0.2.1 changelog and readiness checklist to distinguish the GitHub preview from unperformed platform and Marketplace checks; review the documentation.
- [x] 1.2 Prepare English release notes with installation instructions, features, validation limits, and feedback links; review them against the current README and manifests.
- [x] 1.3 Set and verify the extension's Marketplace Preview flag without changing its version or publication workflow.

## 2. Validation

- [x] 2.1 Run checks, tests, strict OpenSpec validation, production dependency audit, and package verification; record actual outcomes and inspect the VSIX.
- [x] 2.2 Record that no new manual macOS, Windows, or physical Remote testing was performed.

## Workflow follow-up

- Push `dev`, verify its normal `Check`, then fast-forward `master` and observe both normal push-triggered workflows.
- Publish the authorized GitHub pre-release with the VSIX and SHA-256 checksum; verify the tag, assets, branch refs, and release metadata.
- Report whether the automatically triggered Marketplace publication actually succeeds.
