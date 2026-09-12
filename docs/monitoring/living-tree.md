# Living Tree execution monitor

## Delivered behavior

`/monitoring` uses one tree per persisted root agent run. Child runs form branches, including nested and repeated agent invocations. Solid paths mean ownership. Dotted arrows mean explicit prerequisites; SUCCESS and TERMINAL conditions remain distinct. External scheduler prerequisites stay references, never fabricated agent branches.

Running paths pulse cyan, succeeded paths remain green, waiting is amber, and failure is red. Cancelled, skipped, queued, and unknown states keep distinct labels. The root retains its own recorded state while the loaded-hierarchy summary exposes child failures.

Selecting any run is read-only and synchronizes steps, previous attempt snapshots, checkpoints, supervisor events, diagnostics, and explicit termination controls. Legacy `?run=childId` URLs resolve the root and retain the child. New URLs use `?run=rootId&branch=childId`. Project/status filters and paginated root summaries are retained. Zoom, collapse, expansion, keyboard selection, responsive layout, and reduced-motion presentation are supported.

The monitoring page no longer imports the legacy JobMonitor or JobHealth implementations. Tree and List use the same evidence and controller. The old queued-selection worker POST was also removed from the legacy component. Queue consumption remains owned by the existing `/api/jobs/worker` cron in `vercel.json`, not by viewing a job.

## Evidence and authorization

- Server-side queries reuse `agent.execute`, project authorization, and existing diagnostics/action boundaries. Branch diagnostics verify ancestry before reading evidence. There is no new privileged database function or authorization policy.
- Tree responses select safe run/step fields, safe plan metadata, explicit dependency IDs, and interrupt types. They do not include tool inputs, outputs, raw messages, checkpoint state, or artifact payloads other than the validated plan projection.
- Existing full diagnostic export remains an explicit, separately authorized operation.
- A versioned `MONITOR_PLAN` artifact records admitted plan steps and child bindings before execution. Native supervisor evidence is written only after the validated plan is pinned and its execution lease is acquired.
- Profiling archives sanitized `MONITOR_ATTEMPT` snapshots before resetting mutable step rows. Conditional attempt/status predicates prevent one competing restart from overwriting another restart. Archive failure rejects before reset. These two writes are not a database transaction; an archive can exist even when restart fails. It is therefore labeled a snapshot, not proof that a retry executed.
- Artifact versions include a deterministic digest, respecting the deployed unique `(agent_run_id, artifact_type, artifact_version)` constraint. Same evidence replay is idempotent. Different steps, attempts, and plan revisions coexist. This requires no migration.
- Completed recorded steps do not imply complete scope. A percentage needs a complete recorded plan and a non-truncated evidence window. Counts are shown for historical runs without manifests. Parent success remains a separate recorded fact.
- Historical overwritten attempt details are not reconstructed. Existing checkpoint and supervisor event history is displayed separately.

## Refresh and bounds

Selected active trees refresh every three seconds, summaries every fifteen seconds, and open branch details every five seconds. Each resource has one request in flight, an eight-second timeout, disposal/abort guards, exponential backoff capped at thirty seconds, and focus/visibility revalidation. Hidden pages do not initiate polls. Terminal resources stop frequent refreshes but remain refreshable manually and on focus. After nine seconds without a fresh active snapshot, animation stops and the last known state is labeled delayed. Fetch freshness is not a worker heartbeat.

Tree loading begins at 100 runs and expands in increments of 100 to a maximum of 1,000. Ancestry/traversal depth is bounded at 64. Step/plan/dependency queries have explicit evidence windows. Truncation produces warnings and suppresses percentages. Branch detail pages contain up to 100 items per evidence category; the next page advances each category together. Deep-linked details remain available even when the selected run is outside the tree window. No claim of complete unbounded graph retrieval is made.

Layout recalculates only when topology changes. State-only refreshes preserve branch positions. Collapsed branches retain their allocated positions. The component keeps zoom/collapse state when switching Tree/List. A newly selected execution starts a fresh layout.

## Verification

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm run verify:execution-monitor
pnpm build
pnpm exec playwright install --with-deps chromium
pnpm run verify:execution-monitor:browser
```

The browser suite serves the actual client components in an isolated synthetic harness. It does not bypass authentication on application routes. Every API is intercepted with labeled synthetic data, and any mutation request fails the test. It checks branch selection, retry details, dependency waits, evidence progress, failure, stable positions, Tree/List, zoom, collapse, legacy links, staleness/recovery, terminal freshness, mobile layout, reduced motion, and flag fallback. This is client acceptance, not a real authenticated end-to-end execution test.

The `Living Tree Job Monitor` workflow runs TypeScript, synthetic model/evidence checks, existing supervisor verification, and browser tests. Screenshots, reports, and failure traces are saved as CI artifacts.

Local verification during implementation:

| Check | Evidence |
| --- | --- |
| Production Next.js build | Passed, including monitoring page and three API routes |
| Pure state/layout tests | 20 passed |
| Synthetic authorized read-model tests | 18 passed |
| Synthetic evidence persistence tests | 7 passed, modeling both deployed unique constraints |
| Supervisor production and durable-resume checks | Passed |
| Profiling lifecycle contract check | Passed |
| Layout microbenchmark | 1,000 shallow synthetic nodes computed in approximately 14 ms on one run; not browser render latency |
| Browser execution in local session | Unavailable: browser startup denied and cloud browser cannot access localhost |
| Browser suite | Nine tests compile and are listed; CI execution is the release gate |

Live Supabase checks used the existing connector and performed schema/catalog reads. Required columns, RLS on runs/steps/artifacts, parent lookup index, and artifact uniqueness were confirmed. A historical root with one actual child and three recorded steps per run was queried; neither run had a monitor manifest. A rollback-only transaction verified two synthetic attempt versions and idempotent replay against the real artifact table; a follow-up query confirmed zero synthetic rows remained. These checks used the database administrator connection and do not establish authenticated RLS behavior for each application persona.

## Rollout and rollback

The tree is the default view when `JOB_MONITOR_TREE_ENABLED` is unset or `true`. Set the server environment variable to `false` and redeploy to use the shared safe List view without loading the tree canvas. Rollback never reintroduces selection-triggered execution or fabricated percentages. Evidence artifacts remain readable and no historical backfill or destructive migration is required.

Before production acceptance: pass CI browser checks, verify a signed-in user's authorized and unauthorized project paths on the deployment, run a controlled supervisor/profiling execution, inspect new manifests and retry snapshots, and measure API p95/payload size under representative load. Existing SQL checks and microbenchmarks do not replace those gates. No live application session or new production job was created during local verification.

## Native capability challenge

This implementation borrows the distinction between trace parentage and causal links described by OpenTelemetry, and the explicit durable history inspection pattern documented by LangGraph persistence. It retains the DataNexus runtime. References: https://opentelemetry.io/docs/concepts/signals/traces/ and https://docs.langchain.com/oss/javascript/langgraph/persistence .

| Capability | Assessment | Disposition |
| --- | --- | --- |
| Persisted ownership and causal-link inspection | PARTIAL: implemented projection; deployment acceptance pending | KEEP / BUILD_NOW |
| Prospective plan scope and profiling retry snapshots | PARTIAL: implemented; old history cannot be recovered | BUILD_NOW |
| Read-only correlated navigation | PARTIAL: implemented; browser CI gate pending | BUILD_NOW |
| Durable checkpoints, leases, approval and cancellation authority | PARTIAL: existing native mechanisms reused | KEEP |
| Streaming transport and high-viewer-count performance parity | GAP_DEFERRED: requires measured production need | BENCHMARK_LATER |
| Trace-parent versus dependency semantics | PARTIAL: explicit edge types/conditions retained | BORROW_PATTERN |
| Renderer or transport replacement | PARTIAL: contract/layout/polling modules separated | EXTENSION_POINT |
| New runtime, replay mutation, or agent decision architecture | NOT_APPLICABLE | NOT_APPLICABLE |

ADR-007 agent classification is unchanged. Identity, project scope, RLS, approval, lease, retry, cancellation, result-artifact authority, and governance remain DataNexus-owned. Snapshot failure cannot fabricate completeness. Objective parity requires correct recorded relationships, authorization tests, browser interactions, and measured latency/size under load; no production parity or universal performance claim is made.
