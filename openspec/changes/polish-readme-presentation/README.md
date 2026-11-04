# polish-readme-presentation

Style README with a logo, status badges, action buttons, and support through Tribute.

Historical scope note: this change preserved the English README. The repository-wide
English policy in adopt-english-project-language now governs all repository content.

## Results — 2026-11-04

- A header with the PNG icon, tagline, CI/VS Code/MIT/preview badges, and
  Install/GitHub/Report a bug/Donate via Tribute buttons.
- CI shows the dev workflow; the preview version is automatically read from
  package.json on remote dev. Until the new version is pushed, the badge shows
  the previous version on that branch.
- Blue Donate via Tribute badges with the Telegram logo in the header and
  Support development link exactly to the user-clarified
  `https://t.me/tribute/app?startapp=dTvL`.
  The previous text describing an unconnected mockup was removed.
- The 256×256 PNG icon has 32 px rounded corners with transparent antialiased edges.
  Interior pixels and the supplied SVG are preserved; the rounded PNG is used by
  both README and the main extension manifest.
- English, the order of 11 sections, and four future GIF slots are preserved.

## Validation

- Nine unique external badge images: HTTP 200, SVG received without an error badge.
- Local browser render using the existing Chromium: light/dark themes,
  10/10 images loaded; no horizontal overflow at 390×844.
  This is a local Markdown preview, not a check of the published GitHub page.
- Local targets/anchors and README structure checked.
- During the initial integration, the web address `https://web.tribute.tg/d/TvL`
  returned HTTP 200 without a redirect. No login, payment details, or financial
  transactions were used.
- All four outermost PNG pixels have alpha 0; the center has alpha 255;
  63,696 pixels in the safe interior area are byte-for-byte identical to the
  original icon. The edge is antialiased; the SVG SHA-256 remains
  `5e5af6647e285de8911f7dfd43e1ae6831e78be893446243b10a2955d616535d`.
- `npm run check` passed; `npm test`: 180/180 in the working tree at execution time.
  This change does not separately accept the concurrent Explorer changes.
- `vsce package --out /tmp/jbsearch-rounded-icon-check.vsix` and the package
  verifier passed after Tribute integration: 73 main entries and 31 in the
  nested client. The packaged PNG matches media/icon.png byte for byte; the
  working VSIX was not overwritten.
- `npm run spec:check`: 11/11; `git diff --check` passed.

## Link clarification — 2026-11-04

At the user's request, both buttons now use the Telegram link
`https://t.me/tribute/app?startapp=dTvL`. Exact equality of both addresses, the
startapp=dTvL parameter value, and absence of the previous web address in the root
README were checked. Strict validation of this change and `git diff --check`
passed. Telegram was not launched manually, and no payment was made; earlier
check/test/package results apply to the presentation before the link clarification.
Concurrent main README changes were preserved.

## Validation boundaries

All five tasks are implemented. A local render does not replace viewing the
GitHub page after Git delivery or the extension card in real VS Code.
The user will add GIFs. After checking the result, the user separately authorized
commit and push to dev. Extension publication was not requested.
