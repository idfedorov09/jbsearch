# Tasks

## 1. Contract and delivery

- [x] 1.1 Update ADR/specs for confirmed Find/Replace and worker regex; run spec:check.
- [x] 1.2 Add bundled ripgrep/TextMate/Oniguruma and the commands/shortcuts/settings manifest; check npm ci and VSIX contents.

## 2. Search and session

- [x] 2.1 Implement cancellable worker search with scopes, masks, ignore, and dirty snapshots; test Unicode/CRLF/regex/limits/cancel.
- [x] 2.2 Implement SessionController and the guarded modal adapter; test generation, off/unsupported, and state lifecycle.
- [x] 2.3 Implement Replace/Replace All through WorkspaceEdit with captures and stale checks; test literal/captures/overlap/stale/partial.

## 3. UI and preview

- [x] 3.1 Implement the compact Find/Replace UI from the references, scopes, filters, keyboard/splitter; check with browser/VS Code automation.
- [x] 3.2 Implement TextMate preview from the active theme/grammars with match ranges; test escaping/theme/token ranges and real preview.
- [x] 3.3 Implement moving to a tab, reopening, and theme changes; document usage/limitations in README.

## 4. Integration and verification

- [x] 4.1 Run check/test/spec:check/package and test the installed VSIX in clean Linux VS Code: Find/Replace, Undo, themes, scopes, Esc/move/resize/tab.
- [ ] 4.2 Manually test macOS and Windows: shortcuts, focus/IME, themes, resize/tab/replace; keep a separate results matrix.
- [x] 4.3 Bump the installation package to 0.1.0, show the loaded version in Check Installation, and test upgrading the previous VSIX.
- [x] 4.4 Check native source registration and Reload Window on 1.143.1; show the actual folder in Check Installation.
- [x] 4.5 Register sources in the working Remote SSH profile and verify the active entry while preserving other extensions.
- [ ] 4.6 Implement correct syntax preview of client grammars/themes over Remote SSH and verify it between different machines; explicitly show fallback until then.

  The client channel is implemented: Linux Remote SSH loopback was tested from
  source and the installed main VSIX, including BL, the client JS grammar, and
  theme. Verification between different physical machines remains open; this item
  is not completed on loopback evidence alone. Resource unavailability is still
  reported explicitly.

## 5. Reference feedback

- [x] 5.1 Make the dialog and its controls more compact relative to the supplied reference; replace filter/settings icons and verify resizing behavior.
- [x] 5.2 Make Find/Replace shortcut customization accessible from extension settings through VS Code's native shortcut editor and verify it.
- [x] 5.3 Fix preview highlighting for the installed theme and Remote SSH; preserve match highlighting and explicitly document uncovered cases.
- [x] 5.4 Check and document remaining fixed dimensions, settings, and limitations; run appropriate automated and integration checks.
- [x] 5.5 As agreed, test an isolated native TextEditor preview prototype with the client theme over Remote SSH; record read-only behavior, unsaved text, input loss, and the move-to-tab limitation. This research does not complete implementation items 4.6/5.3.
- [x] 5.6 Implement the agreed client theme/grammar transfer through VS Code commands, local UI component delivery, and setup without manually installing the theme on the server.
- [x] 5.7 Test the finished Remote preview in the unified window and tab: client GitHub Dark Default, BL and client JS grammar, theme/customization changes, rapid typing, Replace/Undo, read-only behavior, and source registration/Reload Window.
- [x] 5.8 Fix match borders fragmented by TextMate tokens: one container per line range, preserving syntax styles, adjacent/multiline/zero-width matches, and tabs; check the DOM and real browser layout.
- [x] 5.9 Following user feedback, make match fills more transparent while preserving the theme color and original alpha, text, and border; test results, preview, and theme switching in the browser.

Checks and remaining platforms: [matrix](../../../docs/testing/find-replace.md).

## Workflow follow-up

- After platform verification and review, synchronize the baseline and archive the change.
