# Design

## Context

The short description is extension metadata in the root `package.json`.

## Decision

Use the exact owner-provided text without changing the version or runtime code.
The packaged manifest is checked using a temporary output outside the workspace.
