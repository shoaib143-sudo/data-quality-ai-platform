# ADR-007: Governed Living Tree execution monitor

Date: 2026-09-13

Status: Proposed for PR #363 acceptance

## Context

DataNexus needs an end-to-end Job Monitor that makes multi-agent execution understandable without inventing workflow truth. The target experience is a Living Tree in which a supervisor or root execution owns child agent runs, recorded prerequisites are drawn as dependency relationships, and selecting a branch exposes the evidence for that exact run.

The reference experience includes a root execution, major agent branches, visible state badges, dependency arrows, per-branch progress, and a persistent selected-job panel. The visual design is an interaction target, not an authority source. Runtime evidence remains authoritative.

## Decision

### One canonical read model

Tree and List views MUST consume the same governed execution snapshot and branch diagnostics. There MUST NOT be a visualization-specific execution truth model.

The canonical model consists of root and child `agent.agent_runs`, recorded run steps, validated plan evidence, waits/interrupts, scheduler prerequisites when available, sanitized retry evidence, and explicit warnings when evidence is partial.

### Evidence-first rendering

The UI MUST NOT infer business truth that is not recorded. Solid branches mean recorded ownership. Dotted arrows mean recorded prerequisites. Status comes from recorded state or explicit wait/dependency evidence. Percent progress is shown only when a complete recorded plan exists and the loaded hierarchy is not truncated. Without a complete plan, progress is count-based and states that the total is unknown.

### Versioned contract and failure semantics

The execution contract will evolve as a versioned server contract. Clients must distinguish complete evidence, partial/truncated evidence, unavailable execution, incomplete ancestry, stale polling, unauthorized scope, and missing optional diagnostics. A failed request MUST terminate loading and become an explicit retryable error/degraded state.

### Security boundary

Observation and mutation are separate capabilities. Job Monitor reads use `observability.read`. Project visibility is filtered through project authorization. Retry, cancel, terminate, recovery, and execution remain separately authorized. Server-side admin reads may cross RLS only behind explicit project authorization and allowlisted/sanitized responses.

### Persona visibility

Job Monitor is discoverable to all 13 persona workspaces. Visibility does not imply mutation authority. Technical personas may receive deeper operational controls only where their capabilities allow them. Other personas remain read-only.

### Renderer architecture

Execution semantics and visual layout are separate layers. The renderer accepts normalized nodes, ownership edges, prerequisite edges, and presentation states. Layout code does not query databases, derive authorization, or invent workflow relationships.

The renderer supports root-centred hierarchy, branch selection/deep links, fit/pan/zoom, collapse/expand, Tree/List parity, keyboard navigation, visible focus, reduced motion, non-colour status cues, responsive behavior, and explicit partial-tree indicators.

### Selected-job evidence panel

The selected-job panel presents agent/run identity, recorded state, parent, recorded blockers, timestamps, dataset context, steps/attempts, checkpoints/events, and diagnostics. Derived values are labelled. Missing values are shown as unavailable rather than guessed.

### Bounded reads and performance

Execution reconstruction remains bounded. Large trees are progressively loaded. Branch diagnostics remain addressable even when the branch is outside the current tree window. Release acceptance records API latency and payload size under representative load.

### Rollout and rollback

`JOB_MONITOR_TREE_ENABLED=false` remains the List-view rollback path. Tree rollout proceeds through signed-in preview, persona validation, controlled execution evidence, performance validation, and production smoke testing. No historical backfill is required merely to enable the renderer.

## Non-negotiable invariants

1. No invented relationships.
2. No invented progress.
3. Monitor read access never grants execution authority.
4. Every project and branch remains authorization-scoped.
5. Every visual state has an evidence source or an explicit unavailable state.
6. Request failure terminates loading visibly.
7. Tree and List consume the same execution evidence.

## Implementation sequence

1. Stabilize current monitor and remove indefinite loading.
2. Version the execution contract and codify degraded states.
3. Lock persona/capability matrix.
4. Lock UX interaction and reference-design evidence mapping.
5. Refactor renderer boundary and accessibility primitives.
6. Implement the final Living Tree visual treatment and selected-job panel.
7. Validate supervisor semantics, safe actions, history, scale, and telemetry.
8. Stage rollout with List fallback and production acceptance evidence.
