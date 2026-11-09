# ADR 0003: Search engine, replacement, and preview highlighting

- Status: Accepted
- Date: 2026-11-03

## Context

Find/Replace must match files on disk and unsaved documents consistently, avoid
blocking the extension host, and provide captures/UTF-16 ranges for replacement.
The user requires syntax highlighting from the current theme and match decorations
in the preview.

## Decision

@vscode/ripgrep-universal ships with the extension for file enumeration/ignore
handling. The ECMAScript matcher itself runs in a disposable worker thread,
identically for snapshots and files; termination provides cancellation and a
deadline even for pathological regex. The earlier PCRE2 proposal was revised
because it complicated consistent capture replacement.

SessionController belongs to the extension host; the UI sends intents and receives
snapshots/batches. Generation and preview revision discard stale responses.
Replace uses captures and checks the full content/version before WorkspaceEdit;
incomplete results do not allow Replace All. Changes are not saved automatically.

The preview tokenizes with vscode-textmate/vscode-oniguruma, taking grammar/theme
resources from the public contributions of installed extensions, including theme
includes and user customizations. This is not DOM injection. TextMate tokens are
supported; LSP semantic highlighting is not reproduced. Without a grammar, the
preview uses plaintext with an explanation.

## Consequences

The VSIX needs native ripgrep for desktop platforms, onig.wasm, and the packages'
JS runtime; packaging is verified separately. Windows/macOS runtime verification
is still required. The regex dialect is documented as ECMAScript, not Java/PCRE2.
Encoding is UTF-8; binary/unsupported inputs originally appeared in partial status.
The treatment of binary inputs was later revised in [ADR 0010](0010-binary-search-exclusion.md). Remote/web
support is not promised on the basis of Linux desktop testing. Content/queries
are not sent to external services.

## Sources

- [TextMate tokenizer](https://github.com/microsoft/vscode-textmate)
- [Oniguruma](https://github.com/microsoft/vscode-oniguruma)
- [Bundled ripgrep](https://github.com/microsoft/vscode-ripgrep)
- [WorkspaceEdit](https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit)
