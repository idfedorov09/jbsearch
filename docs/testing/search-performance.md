# Search performance: verification and native checklist

This document describes verification of the `optimize-search-performance`
change. Automated fixtures are synthetic and do not establish real workbench,
physical Remote, Windows, WSL, or macOS performance.

## Real VS Code checklist — NOT RUN

Use a disposable workspace and isolated Extension Development Host or VSIX
profile. Record the exact build, VS Code version, host OS, workspace size,
query, settings, process CPU/RSS and actual results. Never use production data
for replacement checks. Compare with the same source workspace on the baseline.

| Scenario | Expected observation | Actual result |
| --- | --- | --- |
| Streaming modal and native panel | First results appear promptly; intermediate updates may coalesce; final counts and results match the baseline. | NOT RUN |
| Reset and cancellation | Rapid query/mask changes clear prior results immediately; delayed old batches do not return. | NOT RUN |
| Selection and scrolling | Navigation and viewport behavior remain consistent for the existing contract while results arrive and after completion. | NOT RUN |
| Find to Replace | A completed Find can transition to Replace; actions bind only the displayed current replacement model. | NOT RUN |
| Stale actions | Changed, pending or invalid results and obsolete actions fail closed; no unapproved edit is submitted. | NOT RUN |
| Replace All | In a copied fixture, unchanged full scope replaces correctly; changed, partial, cancelled or unreadable scopes do not apply a stale edit. | NOT RUN |
| Saved sessions | Hide/reopen retains independent searches; close releases them and cancels scheduled work. | NOT RUN |
| Cross-platform and Remote | Repeat the relevant scenarios on Windows/WSL, macOS and a physical Remote setup; record each separately. | NOT RUN |

## Automated and synthetic measurements

On 2026-11-12, the benchmark compared the `dev` baseline at
`ced6a973b37e34f70f812297db249b1ca9543f57` with the uncommitted changes on
`feature/search-performance-optimizations`. It used Node.js 22.23.2 on
Linux/x64 and an AMD EPYC-Genoa processor. The baseline and feature runs were
sequential, not interleaved; these figures are indicative rather than a
statistical guarantee. Each run performed two warm-ups and five measured
iterations, with explicit GC outside timed intervals. The table shows medians.

The fixture contains 5,000 synthetic result rows across 100 files, with shared
200-character preview text and one shared disk-baseline object per file. The
streaming fixture sends 80-row batches with `setImmediate` and exercises the
real controller and tree-model code using a fake engine and fake VS Code API.
Approval and plan measurements use the same synthetic rows.

| Measurement | Baseline | Feature | Scope |
| --- | ---: | ---: | --- |
| Streaming wall time | 1,691.0 ms | 68.4 ms | Controller and in-process tree model only |
| Streaming process CPU | 2,153.3 ms | 157.0 ms | User plus system CPU for the Node process |
| Streaming notifications | 64 | 2 | One rapid-delivery workload; first and final included |
| Find approval wall time | 62.1 ms | 0.045 ms | Approval creation call; Find no longer creates an approval |
| Replace approval wall time | 71.2 ms | 57.3 ms | Creating and freezing one independent approval |
| Replace approval process CPU | 83.8 ms | 73.9 ms | User plus system CPU for the Node process |
| Replace approval retained heap delta | 3.59 MiB | 2.23 MiB | Post-GC heap delta while holding the approval |
| Plan comparison wall time | 118.0 ms | 62.6 ms | Comparing 5,000 synthetic plans |

In this fixture, sharing approval replicas reduced retained heap by approximately
38%. The Replace approval timing ranges overlap, so the measurements do not
establish a reliable time or CPU improvement for replacement. The fast copying
path is intended for ordinary data; an accessor, proxy, typed-array view, sparse
array, unusual prototype or customized traversal/freeze operation falls back to
the original copy, possibly after some extra inspection. Heap delta is not peak
memory or full extension-host RSS, and the shared fixture is not representative
of every project. Streaming is deliberately rapid: slower batches or a busy
event loop can produce more updates, and a 50 ms timer is not a real-time
responsiveness guarantee.

To repeat against this working tree and an archived baseline:

```sh
base=$(mktemp -d /tmp/jbsearch-baseline-XXXXXX)
git archive ced6a973b37e34f70f812297db249b1ca9543f57 src | tar -x -C "$base"
ln -s "$PWD/node_modules" "$base/node_modules"
node --expose-gc test/performance/search-performance.js "$base"
node --expose-gc test/performance/search-performance.js
```

The benchmark does **not** measure the real worker, ripgrep, filesystem,
workbench rendering, physical Remote, whole-editor RSS or native UI latency.
It therefore does not establish actual VS Code responsiveness or supported-OS
performance; the real VS Code checklist above remains NOT RUN.

## Automated integration checks

On the same date and Node.js version, a focused set covering streaming,
navigation, query resets, approval, preflight and replacement races passed
445/445 tests. `npm run check` passed, and the full `npm test` passed 928/928
tests. `npm run spec:check` passed 37/37 items.

An isolated copy of the working tree passed
`npm ci --prefer-offline --no-audit --no-fund` and `npm run package`. The
packaged controller, approval and preflight sources matched the working tree.
The existing VSIX in the working folder was not overwritten by these final
checks. These automated checks do not replace the real VS Code checklist above.
