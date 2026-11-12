# Modal diagnostic-summary correction: validation record

Date prepared: **November 12, 2026**. This checklist concerns the intended
0.4.1 correction on the final integrated checkout, not the earlier published
0.4.0 or the historical editor runs for 0.3.2.

## Execution status and boundaries

**Real VS Code manual checks: NOT RUN.** Every scenario below is pending; these
are expected observations, not claims about a completed run. Record the exact
checkout/VSIX, VS Code version, OS, display, workspace, and observed results
when a suitably isolated run is separately arranged. Do not use personal files
or an ordinary user profile.

The previous isolated application attempt exited before its runner because
Electron's SUID `chrome-sandbox` helper was not configured for that environment;
see [the 0.4.0 integration record](issue-3-dev-beta-validation.md). That boundary
was **not rerun** for this correction. No native activation, manual acceptance,
or platform result follows from that earlier attempt, and no privileged-helper
change or `--no-sandbox` workaround is authorized here. Windows, WSL, macOS,
and physical Remote acceptance of this change remain open.

## Suggested isolated fixtures

Use a disposable filesystem workspace with two UTF-8 text files containing a
known query, e.g. `needle`, and at least 21 distinct ZIP files. Make one ZIP a
DOCX-shaped container if desired. Include one unsupported UTF-16 text file only
for the mixed-input case. Record expected counts and ensure the search scope and
file mask include these inputs. More than 20 skips exercise the bounded-detail
overflow case; use harmless synthetic content and never operate on production
data. Keep a byte-for-byte copy of all binary fixtures if exercising Replace All.

Use the source checkout in an isolated Extension Development Host or a separately
built 0.4.1 VSIX in a dedicated disposable profile. The modal must use Replace
mode where a replacement action is being checked. Wait for search completion
unless a step explicitly tests pending behavior.

## Manual VS Code checklist — all pending

| Scenario | Steps and expected observations | Actual result |
| --- | --- | --- |
| Only intentional exclusions | Search the UTF-8 files and ZIP fixtures without the UTF-16 input. The modal reports the binary-exclusion count, shows matches, and enables Replace All when its other conditions are satisfied. No skipped path, per-file reason, or omitted-path line appears in the modal diagnostics. Apply only in the disposable workspace: eligible text changes, ZIP bytes do not; verify Undo. | NOT RUN |
| Mixed blocking inputs | Add the unsupported UTF-16 input and rerun the same search. The modal distinguishes binary exclusions from inputs that could not be searched; it shows no individual paths, per-file reasons, or omitted-path line even when details overflow. Results are incomplete and Replace All is blocked. | NOT RUN |
| Existing detail route | From each completed search use **Open in Find Panel**. Its diagnostics retain representative skipped paths and reasons, and the bounded-detail/omitted indication when applicable. The incomplete state and replacement admission must match the originating search. Representative details are bounded, not a complete list of all inputs. | NOT RUN |
| Error, stale state, and Rerun | Trigger an invalid regular expression and confirm its ordinary error is visible. Restore a valid completed search and induce a reproducible stale state in the isolated workspace. Confirm the stale notice and **Rerun Search** remain visible and actionable. After rerunning, inspect the new summary and results rather than assuming old results were updated automatically. If a source change is revalidated without becoming stale, do not count it as a pass for this step. | NOT RUN |
| Query reset while pending | Start with a completed search that shows a warning. Edit the query or mask and observe that its previous summary clears immediately, before host acknowledgment or completion; edit it again while the next search is pending. Only the current generation's summary may appear. To verify rejection of a late old completion, use a separately approved controlled-delay harness; if no such harness is available, record that portion as not run rather than infer it from a fast search. | NOT RUN |
| Transfer and rollback | Confirm normal transfer retains the current summary's corresponding detailed diagnostics. For an existing saved search, use **Edit Search**, form a different draft, and, only with an approved controlled failure in an isolated test harness, fail its transfer: the restored saved search must retain its original details and corresponding modal summary, with no cross-search leakage. If failure cannot be induced safely, record rollback as not run. | NOT RUN |

## Automated integration record

The following checks ran on the prepared 0.4.1 checkout on Linux x64 with
Node 22.23.2 and npm 12.0.2. They do not replace the manual checklist above.

| Check | Actual result |
| --- | --- |
| Focused formatter, controller lifecycle, modal UI, and Find Panel regressions | 420 passed; none failed, skipped, or cancelled |
| `npm run check` and `npm test` | Passed; 888 tests passed, none failed, skipped, or cancelled |
| `npm run spec:check` | 36 passed, none failed; strict validation |
| Stable and marked pre-release packaging | Both passed; main 0.4.1, client 0.1.0, 90 main and 31 nested-client entries; both channel checks passed |
| Diff and metadata checks | Passed; only the three main package/lock version fields changed; client and dependencies unchanged |
| Independent core review | Passed within scope; 426 focused tests, 35 replacement/scope tests, and 5,000 deterministic diagnostic-parity cases passed |
| Independent final documentation/metadata review and GitHub PR checks | PENDING |

Runtime hashes were unchanged through local checks. Production changes are
limited to the diagnostic formatter, controller summary lifecycle, and modal
display; worker classification, replacement code, client, and publication
workflows are unchanged. Detailed diagnostics are still included in internal
snapshots; hiding them in the modal is a presentation change, not a new privacy
boundary.

Packages were built locally for validation only and were not published. Their
timestamps use the pre-commit checkout's `SOURCE_DATE_EPOCH`; no equality with a
future beta-merge build is claimed. GitHub checks and any later publication must
identify their own commit and artifacts. Local command logs, package reports,
and review evidence are retained outside the repository under
`/home/codex/jbsearch-overnight-2026-11-12/follow-up-0.4.1/`.
