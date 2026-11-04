# GitHub Social Preview

## Result — 2026-11-04

- `.github/social-preview.html` is the editable HTML/CSS composition. It uses
  `media/icon.png` and a crop of `images/screenshots/floating-search.png`.
- `.github/social-preview.png` is the upload-ready image: 1280 × 640, opaque
  RGB PNG, 226,458 bytes, SHA-256
  `c563fc77b84630c3dbe94512183a79a895e06a12d27f3f4d047fc31ac42c3bf9`.
- The final image and a 640 × 320 rendering were visually inspected. The existing
  logo and the real search dialog are visible; no generated mock interface was used.
- The screenshot was enlarged from 566 × 442 to 624 × 486 pixels after user
  feedback, while retaining the logo, title, tagline, and complete dialog frame.

## Rendering

From the repository root, use a Chromium-compatible browser with the Inter font
available. Replace `chromium` with the executable path if necessary:

```sh
chromium --headless --disable-gpu --disable-dev-shm-usage \
  --allow-file-access-from-files --hide-scrollbars \
  --force-device-scale-factor=1 --run-all-compositor-stages-before-draw \
  --screenshot="$PWD/.github/social-preview.png" --window-size=1280,640 \
  "file://$PWD/.github/social-preview.html"
```

Local verification used Chromium 141.0.7390.37 and additionally passed
`--no-sandbox`. Rendering the source a second time produced an identical PNG.
Different fonts or browser versions may change rasterization.

## Verification

- Image dimensions, opaque PNG format, size, source links, and matching output
  hashes were checked.
- `npm run check` passed; `npm test` passed 195/195; `npm run spec:check`
  passed 18/18; `git diff --check` passed.
- `vsce ls` confirmed that `.github/` artwork is excluded from the extension
  package. No VSIX was built for this artwork-only change.

## GitHub setup

Download the PNG to the computer with the GitHub browser session, open the
repository's **Settings → General → Social preview**, select **Edit**, and
upload the PNG. Merely adding the file to Git does not configure GitHub's
repository setting. No GitHub setting was changed or social platform preview
verified as part of this local artwork task.
