# Proposal

## Why

The user requested README styling based on an example with badges and an
attractive Tribute donation button, then selected the existing repository README.

## What Changes

- Style the header with the existing icon, name, tagline, and compact badges.
- Add Install, GitHub, Report a bug, and support buttons; preserve English, the
  section order, and four slots for future GIFs.
- Connect Donate via Tribute buttons to the personal link supplied by the user
  and subsequently clarified for Telegram:
  `https://t.me/tribute/app?startapp=dTvL`. Do not substitute a generic bot or another recipient.
- Check actual badge URLs, local links, and the packager's handling of README.
- At the user's additional request, round the PNG icon's corners: 32 px radius
  at 256×256, transparent antialiased edges, with no changes to the interior artwork.

Scope: README, media/icon.png, and this change. The source SVG remains unchanged.
Concurrent Explorer changes, runtime, dependencies, financial transactions,
publication, and Git delivery are outside this request.

## Capabilities

### New Capabilities

No new extension capabilities.

### Modified Capabilities

No runtime contract changes; `skip_specs: true`.

## Impact

README.md, the extension PNG icon, and an OpenSpec record. Preserve the English
README and existing structure. The same PNG is used in the header and extension manifest.
