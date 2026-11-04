# Extension description

Updated the extension manifest with the owner-provided description.

Verification: `npm run check`, `npm test` (195 passed), and `npm run spec:check`
passed. A VSIX was built outside the workspace and verified with
`scripts/verify-package.js`; both packaged metadata files contain the exact
requested text. No manual VS Code test was needed for this metadata-only change.
