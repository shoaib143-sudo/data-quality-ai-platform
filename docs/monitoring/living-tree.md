# Living Tree execution monitor

## Delivered behavior

`/monitoring` uses one tree per persisted root agent run. Child runs form branches, including nested and repeated agent invocations. Solid paths mean ownership. Dotted arrows mean explicit prerequisites; SUCCESS and TERMINAL conditions remain distinct. External scheduler prerequisites stay references, never fabricated agent branches.

Running paths pulse cyan, succeeded paths remain green, waiting is amber, and failure is red. Cancelled, skipped, queued, and unknown states keep distinct labels. The root retains its own recorded state while the loaded-hierarchy summary exposes child failures.

Selecting any run is read-only and synchronizes steps, previous attempt snapshots, checkpoints, supervisor events, diagnostics, and explicit termination controls. Legacy `?run=childId` URLs resolve the root and retain the child. New URLs use `?run=rootId&branch=childId`. Project/status filters and paginated root summaries are retained. Zoom, collapse, expansion, keyboard selection, responsive layout, and reduced-motion presentation are supported.

The monitoring page no longer imports the legacy JobMonitor or JobHealth implementations. Tree and List use the same evidence and controller. The old queued-selection worker POST was also removed from the legacy component. Queue consumption remains owned by the existing `/api/jobs/worker` cron in `vercel.json`, not by viewing a job.

## Evidence and authorization

- Monitor reads use `observability.read` project authorization. Project discovery may use the server-side admin client to cross table RLS, but every project is filtered through explicit project authorization before presentation. Retry, cancel, terminate, recovery, and execution remain separately authorized and are not granted by monitor visibility.
- Branch diagnostics verify ancestry before reading evidence. There is no new privileged database function or authorization policy.
- Tree responses select safe run/step fields, safe plan metadata, explicit dependency IDs, and interrupt types. They do not include tool inputs, outputs, raw messages, checkpoint state, or artifact payloads other than the validated plan projection.
- Existing full diagnostic export remains an explicit, separately authorized operation.
- A versioned `MONITOR_PLAN` artifact records admitted plan steps and child bindings before execution. Native supervisor evidence is written only after the validated plan is pinned and its execution lease is acquired.
- Profiling archives sanitized `MONITOR_ATTEMPT` snapshots before resetting mutable step rows. Conditional attempt/status predicates prevent one competing restart from overwriting another restart. Archive failure rejects before reset. These two writes are not a database transaction; an archive can exist even when restart fails. It is therefore labeled a snapshot, not proof that a retry executed.
- Artifact versions include a deterministic digest, respecting the deployed unique `(agent_run_id, artifact_type, artifact_version)` constraint. Same evidence replay is idempotent. Different steps, attempts, and plan revisions coexist. This requires no migration.
- Completed recorded steps do not imply complete scope. A percentage needs a complete recorded plan and a non-truncated evidence window. Counts are shown for historical runs without manifests. Parent success remains a separate recorded fact.
- Historical overwritten attempt details are not reconstructed. Existing checkpoint and supervisor event history is displayed separately.
- The execution snapshot API exposes schema version `1`. Server-rendered initial snapshots and client refreshes use the same versioning helper so Tree and List remain on one canonical execution contract.

## Refresh and bounds

Selected active trees refresh every three seconds, summaries every fifteen seconds, and open branch details every five seconds. Each resource has one request in flight, an eight-second timeout, disposal/abort guards, exponential backoff capped at thirty seconds, and focus/visibility revalidation. Hidden pages do not initiate polls. Terminal resources stop frequent refreshes but remain refreshable manually and on focus. After nine seconds without a fresh active snapshot, animation stops and the last known state is labeled delayed. Fetch freshness is not a worker heartbeat.

Tree loading begins at 100 runs and expands in increments of 100 to a maximum of 1,000. Ancestry/traversal depth is bounded at 64. Step/plan/dependency queries have explicit evidence windows. Truncation produces warnings and suppresses percentages. Branch detail pages contain up to 100 items per evidence category; the next page advances each category together. Deep-linked details remain available even when the selected run is outside the tree window. No claim of complete unbounded graph retrieval is made.

Layout recalculates only when topology changes. State-only refreshes preserve branch positions. Collapsed branches retain their allocated positions. The component keeps zoom/collapse state when switching Tree/List. A newly selected execution starts a fresh layout. Fit tree removes the minimum canvas width so the complete tree fits narrow viewports; zoom then scales from that fitted width. On phones, fit provides an overview, while zoom/pan and the full-size branch details or List view support reading individual jobs.

Execution semantics are normalized through a presentation layer before tree rendering. That layer emits presentation nodes, recorded ownership relationships, and recorded prerequisites. Layout remains responsible only for geometry, and the renderer does not invent workflow relationships or authorization semantics.

A terminal branch-diagnostic failure stops the branch-detail loading state, shows a retryable error, and labels attempt evidence unavailable until diagnostics recover. It no longer shows error and loading messages simultaneously.

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
| Synthetic authorized read-model tests | 21 cases after explicit `observability.read` assertions for execution, root-summary, and branch reads |
| Synthetic evidence persistence tests | 7 passed, modeling both deployed unique constraints |
| Supervisor production and durable-resume checks | Passed |
| Profiling lifecycle contract check | Passed |
| Layout microbenchmark | 1,000 shallow synthetic nodes computed in 2.56 ms in the September 13 local rerun; not browser render latency |
| Browser execution in local session | September 13: 9/9 passed after installing Chromium; includes mobile fit bounds, reduced motion, and mutation/error guards |
| Browser suite | 9/9 passed in CI run `34741515050` on `dfa35dfffbb7070e987de79f8cc5f48f0ea08f26`; artifact `10312379915` |

Live Supabase checks used the existing connector and performed schema/catalog reads. Required columns, RLS on runs/steps/artifacts, parent lookup index, and artifact uniqueness were confirmed. A historical root with one actual child and three recorded steps per run was queried; neither run had a monitor manifest. A rollback-only transaction verified two synthetic attempt versions and idempotent replay against the real artifact table; a follow-up query confirmed zero synthetic rows remained. These checks used the database administrator connection and do not establish authenticated RLS behavior for each application persona.

## September 13 verification follow-up

The original nine browser failures came from `next/link` routing helpers imported by `JobTermination`. The isolated esbuild bundle defined only `NODE_ENV` and omitted the routing constants that Next.js normally inlines. The fixture now defines the six relevant routing defaults explicitly. It does not install a blanket `process` shim, replace the production components, or relax error/mutation assertions. This was a fixture defect; it is not evidence of the same defect in the Next.js deployment.

The fixture now compiles `app/globals.css` with the existing PostCSS/Tailwind plugin, so screenshot review includes real theme and utility styles in the diagnostics and execution-action sections. Local screenshot inspection covered desktop selection, dependency paths, cyan/green/amber states, mobile reduced motion, collapsed branches, and List fallback. The mobile review revealed that Fit tree merely reset zoom while preserving a 960px minimum width. The control now fits the viewport, and the browser test asserts no canvas overflow and an in-bounds root after fitting. The nine tests still pass with these stronger checks. Mobile fit is an overview with small labels; zoom and the full-size details/List remain available.

Fresh local verification passed frozen-lockfile installation, TypeScript, all 45 synthetic checks, supervisor production and durable-resume checks, profiling lifecycle contracts, and the production build. The browser installation with OS dependencies was denied by this session's package-manager permissions; installing the browser binaries alone succeeded and all nine tests subsequently ran successfully.

CI run `34741760070` also passed all nine strengthened browser tests on `2cfcf0c`. CodeQL review thread `PRRT_kwDOUCzvOc6hzRDc` identified request-derived filesystem access in the fixture asset server. Although the original code restricted URL values, the server now preloads exactly two fixed build outputs into a Map and uses the request only as an in-memory lookup key. No request input reaches a filesystem path.

Signed-in preview validation subsequently moved beyond the Vercel sign-in gate. Senior Leadership renders `Job Monitor` in its persona workspace, and the navigation definition plus workspace policy expose Job Monitor across all 13 personas without granting execution authority. Preview environment compatibility was corrected for the deployed Supabase server-secret naming.

The monitor project registry is `app.projects`, not `catalog.projects`. The monitoring page now discovers projects through the server-side boundary and filters each project with `observability.read`. This fixed the signed-in preview failure that previously reported `Unable to load monitoring projects`.

A real recorded failed Data Quality execution was loaded through the signed-in preview. Its snapshot exposed the recorded failed run, three actual execution steps, explicit error evidence, and branch diagnostics including a recorded checkpoint. A separate historical two-agent execution was also validated: the root is a `Profiling Agent`, the child is a recorded `Data Quality Agent`, both contain three recorded steps, and the snapshot contains an explicit satisfied `SUCCESS` scheduler dependency from the profiling job to the data-quality job. The Living Tree renders both ownership and prerequisite semantics from this evidence rather than fabricating relationships.

The execution endpoint briefly appeared to leave the client on `Loading execution hierarchy…` while an older preview was being exercised. Direct signed-in inspection of the current branch confirmed the current endpoint returns the full snapshot and the current UI hydrates it. Terminal branch-detail failures are now explicitly retryable and do not continue to claim that evidence is loading.

Current-head acceptance still requires a controlled new E2E supervisor/profiling execution, representative API latency/payload measurements, deployed feature-flag verification, final read-only persona negative testing, and production commit/UI acceptance. PR #363 stays draft until these gates are satisfied.

## Rollout and rollback

The tree is the default view when `JOB_MONITOR_TREE_ENABLED` is unset or `true`. Set the server environment variable to `false` and redeploy to use the shared safe List view without loading the tree canvas. Rollback never reintroduces selection-triggered execution or fabricated percentages. Evidence artifacts remain readable and no historical backfill or destructive migration is required.

Before production acceptance: pass current-head CI browser checks, verify signed-in authorized and unauthorized project paths, run a controlled supervisor/profiling execution, inspect new manifests and retry snapshots, measure API p50/p95 and payload size under representative load, verify the deployed server flag, and complete production smoke testing. Existing SQL checks and microbenchmarks do not replace those gates.

## Native capability challenge

This implementation borrows the distinction between trace parentage and causal links described by OpenTelemetry, and the explicit durable history inspection pattern documented by LangGraph persistence. It retains the DataNexus runtime. References: https://opentelemetry.io/docs/concepts/signals/traces/ and https://docs.langchain.com/oss/javascript/langgraph/persistence .

| Capability | Assessment | Disposition |
| --- | --- | --- |
| Persisted ownership and causal-link inspection | PARTIAL: implemented projection; production acceptance pending | KEEP / BUILD_NOW |
| Prospective plan scope and profiling retry snapshots | PARTIAL: implemented; old history cannot be recovered | BUILD_NOW |
| Read-only correlated navigation | PARTIAL: signed-in preview validated; production acceptance pending | BUILD_NOW |
| Durable checkpoints, leases, approval and cancellation authority | PARTIAL: existing native mechanisms reused | KEEP |
| Streaming transport and high-viewer-count performance parity | GAP_DEFERRED: requires measured production need | BENCHMARK_LATER |
| Trace-parent versus dependency semantics | PARTIAL: explicit edge types/conditions retained | BORROW_PATTERN |
| Renderer or transport replacement | PARTIAL: contract, presentation, layout, and polling modules separated | EXTENSION_POINT |
| New runtime, replay mutation, or agent decision architecture | NOT_APPLICABLE | NOT_APPLICABLE |

ADR-007 documents the Living Tree execution architecture and transition invariants. Identity, project scope, RLS, approval, lease, retry, cancellation, result-artifact authority, and governance remain DataNexus-owned. Snapshot failure cannot fabricate completeness. Objective parity requires correct recorded relationships, authorization tests, browser interactions, and measured latency/size under load; no production parity or universal performance claim is made.


### Preview rollback validation

The Preview environment was set to `JOB_MONITOR_TREE_ENABLED=false` for deployed rollback verification. This documentation-only commit intentionally triggers a fresh PR #363 preview so the server-rendered flag can be validated against the shared safe List fallback. After validation, the Preview flag must be restored to its normal value before final production acceptance.

### Preview rollback restoration

After rollback validation, `JOB_MONITOR_TREE_ENABLED` was removed from the Preview environment, restoring the default Tree-enabled behavior. This commit triggers a fresh Preview deployment so the restored default can be verified before final acceptance.


### Final release-candidate validation — 2026-09-13

Exact head `80a356a5759ddd24e21e1429edd02d25d99b9721` is deployed and READY on Vercel preview `dpl_FfZjMoEqUqJATQAtvGRE1niuL2Ni`.

All exact-head automated gates are green, including Living Tree Job Monitor, Navigation Integrity, Persona Workspace Policy, Governed Incident 13-Persona Certification, Privileged API Authorization Audit, Native Supervisor Production, Native supervisor durable resume, CodeQL Security, Quality Gate, P0-P5 Revalidation, and V6 Operational Certification.

The branch was rebuilt on the current production visual system. Newer Profile/Settings account governance and shared DataNexus UI changes are preserved, while Job Monitor remains visible through the governed monitoring workspace for all 13 personas.

Rollback behavior was deployed and validated earlier with `JOB_MONITOR_TREE_ENABLED=false`; the flag was then removed and the default Tree-enabled behavior restored.

A fresh controlled supervisor execution was attempted only through the supported authenticated application boundary. The automation profile had no authenticated DataNexus session and stopped without execution. No role bindings, execution rows, or evidence rows were created or modified. The pre-provisioned Data Governance Admin and owner users both resolve `agent.execute=true` for the target project, so the remaining blocker is session establishment only, not authorization design.

Production durable-worker traffic continues to show intermittent Supabase/PostgREST `Gateway Timeout` responses on pool claims and stale-release maintenance. The worker claim hot-path migration is live, its bounded scan and indexes are present, and failures remain fail-safe as queued/fenced-for-retry. This runtime provider-path degradation is tracked separately from Living Tree correctness and is not hidden by this release evidence.

The draft must remain unmerged until one authenticated controlled supervisor execution is observed end-to-end through the real API and its resulting parent/child execution evidence is verified in Job Monitor.
