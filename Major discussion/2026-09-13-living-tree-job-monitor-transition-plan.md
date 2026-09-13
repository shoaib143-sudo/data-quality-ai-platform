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
- PR #363 remains draft until controlled E2E execution, performance measurements, final persona negative testing, and production acceptance are complete.
