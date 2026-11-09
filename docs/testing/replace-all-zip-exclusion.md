# Replace All with an excluded ZIP container

## Environment

- Date: 2026-11-09.
- Extension: source checkout, loaded in an Extension Development Host; no release
  or version change.
- VS Code 1.144.1, Linux x64, X11/Xvfb.
- Separate temporary workspace, user-data directory, extension directory, and
  HOME. The workspace contained two synthetic UTF-8 files, a minimal OOXML DOCX,
  and, for the blocking case, an unsupported UTF-16 file. The `file` utility
  identified the fixture as a Microsoft Word 2007+ document.
- Playwright interacted with the actual VS Code workbench and modal; a test-only
  extension observed session state and editor contents. This was an automated
  real-editor check, not a hands-on manual acceptance or a Remote SSH test.

## Results

| Scenario | Result |
| --- | --- |
| Search with a DOCX and three matches in two text files | Complete; the modal identified the DOCX as excluded and enabled Replace All |
| Replace All | Both text documents changed as unsaved edits; their disk files and the DOCX were unchanged |
| One VS Code Undo | Both text documents returned to their original contents |
| Open in Find Panel | The panel retained the DOCX path and exclusion reason |
| Add UTF-16 input and rerun | Modal and panel identified its path and encoding; Replace All was disabled and a direct request was rejected |

The test did not exercise macOS, Windows, a physical Remote SSH connection,
other archive formats, or a human-operated manual session. Do not infer those
results from this Linux run. The worker was separately run read-only against
the actual DOCX involved in the reported project; no replacement was applied
to that project.

## Expanded binary check

After the user clarified that identified binary data in general should be
excluded, a second isolated Extension Development Host run used the same VS Code
version and Linux/X11/Xvfb setup. Alongside the minimal DOCX and two text files,
the synthetic workspace contained PNG-header, PDF-header, and NUL-containing
binary fixtures, each containing the search string.

The modal showed all four binary exclusions and only three text matches; Replace
All was enabled. The actual edit changed the two text documents without saving,
left all four binary fixtures byte-for-byte unchanged, and one VS Code Undo
restored both text documents. The Find Panel retained the exclusion details.
Adding an unsupported UTF-16 input and rerunning showed its path and blocked
Replace All in both views. This is automated real-editor coverage, not human
manual acceptance or evidence for macOS, Windows, or physical Remote SSH.

The expanded check was repeated after strengthening the BOM-less encoding
heuristic. Its blocking fixture was mixed CJK/ASCII UTF-16LE without a BOM; it
was reported as an unsupported encoding, and Replace All stayed disabled in
both views. The binary exclusions, unchanged binary files, unsaved workspace
edits, and single Undo all passed again in the same isolated Linux setup.
