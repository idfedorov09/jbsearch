# Design

## Context

The root README is already in English and contains the agreed sections. The
existing icon is media/icon.png. Explorer menu changes belong to an independent
task. The user clarified the personal Tribute link for Telegram:
`https://t.me/tribute/app?startapp=dTvL`.

## Goals / Non-Goals

Make the header and actions visually prominent while preserving readability and
README compatibility with GitHub and VSIX. Do not change product structure,
search code, or release status.

## Decisions

1. Use the existing PNG and HTML align without custom CSS. Preserve the JB Search
   Markdown heading, 11 main sections, and four GIF slots.
2. The CI badge reads the actual workflow status for dev. The preview badge reads
   package.json from remote dev through Shields, without a manual number on every
   bump; it shows that branch's state, rather than a published release. Check the
   VS Code minimum and MIT against the manifest. Concurrent work bumped the
   version to 0.2.0; preserve this change's links and instructions.
3. Use Shields.io flat-square for metadata and for-the-badge for buttons.
   These are external HTTPS images; do not embed custom SVGs in README. Local
   vsce accepts Shields and the GitHub workflow badge; verify this through packaging.
4. Install leads to the existing Installation section; GitHub and bug lead to
   this repository. Donate via Tribute in the header and Support development
   lead exactly to the user-supplied `https://t.me/tribute/app?startapp=dTvL`.
   Check both exact URLs, including startapp; financial transactions and data
   entry are unnecessary for validation.
5. Validate VSIX using a separate file in /tmp without overwriting the working
   installation package or historical package reports.
6. Apply an antialiased transparent 256×256 rounded-rectangle mask with a 32 px
   radius (12.5%) to media/icon.png. Preserve colors and opacity inside the mask.
   Change the PNG itself so rounding works in README and the extension card
   without CSS. docs/artwork/icon.svg remains the original supplied artwork;
   the PNG is a derived export with rounded corners. No new dependencies are
   needed: the local Chromium Canvas supports roundRect and PNG export.

## Risks / Trade-offs

- External badges depend on their providers → check HTTP and provide clear alt text.
- A Tribute URL error → use the exact supplied address in both buttons and check
  navigation without making a payment.
- Concurrent changes → edit only README, media/icon.png, and this change; do not
  stage/commit other files or change their tasks.
- Transparent edges → check the four corners, opaque center, unchanged interior
  pixels, light/dark backgrounds, and PNG equality in a separate VSIX.
