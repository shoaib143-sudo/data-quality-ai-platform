# Living Tree Job Monitor transition plan

Date: 2026-09-13

PR: #363

## Goal

Transition DataNexus Job Monitor from a technically correct execution list/tree into the governed E2E Living Tree experience used as the product reference. The visual tree must remain a faithful projection of recorded execution evidence.

## Parallel workstreams

### A. Execution correctness and canonical contract

- Stabilize signed-in execution reads and branch diagnostics.
- Eliminate indefinite loading after request failure.
- Version the execution snapshot contract.
- Represent complete, partial/truncated, unavailable, unauthorized, stale, and diagnostics-unavailable states explicitly.
- Keep Tree and List on the same read model.

Exit: real recorded executions render reliably from root through branch details.

### B. Security and persona access

- Keep monitor reads on `observability.read`.
- Keep retry/cancel/terminate/recovery/execution separately capability-gated.
- Verify all 13 persona workspaces expose Job Monitor where intended.
- Add regression coverage for visibility without authority escalation.

Exit: every persona can see only authorized projects and read access never implies mutation authority.

### C. UX and reference-design mapping

Reference UI semantics:

- Root trunk = recorded root/supervisor execution.
- Solid branch = recorded parent/child ownership.
- Dotted arrow = recorded dependency/prerequisite.
- Cyan = running.
- Green = completed successfully.
- Amber = recorded wait or unmet prerequisite.
- Slate = queued/not started.
- Failed/cancelled states remain explicit and non-colour-labelled.
- Selected-job panel = facts for the selected run, its parent, blockers, timestamps, steps, attempts, checkpoints/events, and diagnostics.
- Percent progress appears only with a complete recorded plan; otherwise show recorded completed-step counts with total unknown.

Interaction contract:

- project selector
- state filter
- execution selector
- Tree/List toggle
- refresh
- fit/pan/zoom
- collapse/expand
- deep-linked root and branch selection
- keyboard selection/focus
- reduced-motion support
- mobile-safe layout
- explicit empty, loading, error, stale, and partial states

### D. Renderer foundation and accessibility

- Separate graph semantics from tree layout/rendering.
- Normalize presentation nodes and edges before drawing.
- Preserve Tree/List parity.
- Add non-colour status cues, visible focus, screen-reader labels, and reduced-motion behavior.
- Keep large trees bounded and progressively loadable.

Exit: renderer can reproduce the reference structure without deriving business truth.

### E. Performance and telemetry

- Capture monitor API duration and response payload size.
- Track execution-read failures, branch-read failures, stale polling, client request timeouts, and oversized/truncated trees.
- Measure representative p50/p95 before production acceptance.
- Retain private/no-store caching semantics for execution evidence.

Exit: release evidence includes latency, payload, failure, and stale-state measurements.

### F. Release engineering and documentation

- Keep `JOB_MONITOR_TREE_ENABLED=false` as List-view rollback.
- Validate signed-in preview across read-only and technical personas.
- Run a controlled new E2E supervisor/profiling execution and capture manifests/retry/diagnostic evidence.
- Validate production commit, navigation, tree rendering, and rollback.
- Maintain ADR, troubleshooting notes, acceptance evidence, and runbook.

## Implementation order

1. Current monitor stabilization.
2. Versioned execution contract and failure semantics.
3. Persona/capability matrix.
4. UX interaction contract and evidence mapping.
5. Renderer/accessibility foundation.
6. Final Living Tree visual treatment.
7. Selected-job evidence panel.
8. E2E orchestration semantics and safe actions.
9. History/audit evidence.
10. Performance/scale and telemetry.
11. Staged rollout and rollback verification.
12. 24-hour and 7-day production validation.

## Non-negotiable rules

1. Never invent execution relationships.
2. Never invent progress.
3. Never turn monitor visibility into execution authority.
4. Fail closed on unauthorized project/branch access.
5. Show partial evidence as partial evidence.
6. A terminal request failure must stop the loading state and become actionable UI.
7. Every visual state must map to recorded evidence or an explicit unavailable state.
8. Tree and List must stay on one canonical read model.

## Current validation baseline

- Job Monitor navigation is visible in the Senior Leadership persona preview and configured across all 13 persona definitions.
- Monitor project discovery uses `app.projects` and filters every project through `observability.read`.
- Signed-in preview loads a real failed Data Quality execution with three recorded steps and checkpoint evidence.
- A historical two-agent execution loads a `Profiling Agent` root and recorded `Data Quality Agent` child, including an explicit satisfied SUCCESS dependency edge between their scheduler jobs.
- Execution snapshots expose `schemaVersion: 1`; Tree and List consume the same read model.
- Read-only monitor users no longer receive `Execution Recovery` or `Run an agent` navigation unless the selected project separately authorizes `agent.execute`.
- Exact-head CI on `9bb8a20f1e493be0121334682ddd2a967ede24e2` passes the Living Tree suite, Quality Gate, P0-P5 Revalidation, Issue Authorization Boundary, CodeQL, persona-policy gates, Native Supervisor Production, durable resume, and V6 certification jobs.
- Exact-head Vercel preview `dpl_3bwrH7N3wfJaFr7rvPVUhFwyPiYd` is READY.

### Current monitor performance sample

Privacy-safe `MONITOR_METRIC` records on the exact-head preview show, for 23 root-list reads of 25 executions / about 10.3 KB each:

- root-list p50: about 1.42 s
- root-list p95: about 3.27 s
- observed root-list range: about 1.28 s to 3.62 s

The current exact-head sample also includes:

- execution snapshots: about 2.86 s and 3.62 s for a two-run / about 3.3 KB hierarchy
- branch diagnostics: about 2.06 s and 2.20 s for three steps / about 1.1 KB

PostgreSQL `EXPLAIN ANALYZE` for the representative `agent.agent_runs` primary-key lookup is about 0.1 ms, so the remaining latency is dominated by authorization/request fan-out rather than the indexed row lookup. `agent.agent_runs` stores `parent_run_id` but no materialized `root_run_id`; bounded hierarchy discovery therefore remains level-by-level through the current REST read model.

### Remaining acceptance blockers

- A controlled fresh native-supervisor E2E run must be invoked through authenticated `POST /api/agents/supervisor/run`; the route correctly requires `agent.execute`. The currently available signed-in Opera connector can read/navigate pages but exposes no POST/form-action or session-token interface, and direct database insertion would bypass the application boundary, so it is not acceptable as release evidence.
- A deployed rollback test still requires a Preview deployment with `JOB_MONITOR_TREE_ENABLED=false`. The available Vercel connector can inspect/deploy but does not expose environment-variable mutation, and the Opera connector currently has read-only settings access. Source/browser tests cover List fallback, but that is not equivalent to deployed flag verification.
- A fresh signed-in Senior Leadership reload on the newest exact-head preview is still required to visually prove the newly capability-gated header. The older signed-in tab was loaded before that commit; its continuing API polling is useful for performance evidence but not valid UI evidence for the new server-rendered header.

PR #363 remains draft until those controlled/deployed acceptance gates and normal production acceptance are complete.
