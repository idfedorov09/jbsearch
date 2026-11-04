# Marketplace keyword optimization and 0.2.3

Prepared on November 4, 2026. All 15 requested search phrases are present
among 25 distinct keywords, including the 11 existing relevant keywords.
The display name, concise description, extension ID, publisher, and runtime
remain unchanged. The main package and lockfile use 0.2.3; the bundled client
remains 0.1.0.

## Local validation

- `npm ci` and `npm run check` passed on Node.js 22.23.2 and npm 12.0.2.
- `npm test` passed **195/195**; strict `npm run spec:check` passed **25/25**.
- `npm audit --omit=dev` found no known production vulnerabilities.
- `npm run package` verified **77** main and **31** nested client entries.
- The VSIX JSON and XML contain version 0.2.3, the unchanged identity and
  requested display name/description, 25 unique keywords, and 27 generated
  Marketplace tags including the two automatically added by `vsce`.
- All 65 packaged source, media, and runtime dependency files and the bundled
  client VSIX match the previously released 0.2.2 package byte for byte.
- The verified local `jbsearch-0.2.3.vsix` SHA-256 is
  `87dbc774e7ead3b3cb4a8c562984583540c87c886129edd67254d1d08b7240ca`.

No new manual GUI or platform acceptance run is claimed. Marketplace publication
is handled by the existing master push workflow; its result is not verified by
these local checks. The user requested not to wait for it after the push.
