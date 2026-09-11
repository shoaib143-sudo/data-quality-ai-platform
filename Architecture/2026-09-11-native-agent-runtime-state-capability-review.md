# Native Agent Runtime State — Capability Review

**Date:** 2026-09-11  
**Governing ADRs:** ADR-007, ADR-008  
**Scope:** Native checkpointing, pause/resume, governed HITL decisions, state history, and controlled replay/forking

## Purpose

This review is the ADR-008 capability-parity gate for the first shared native DataNexus agent-runtime slice.

The implementation is intentionally native. Industry runtimes are used as design references, not production dependencies.

## Current industry reference points

The following current official capabilities were used as comparison points:

- LangGraph persistence and interrupts: durable checkpoint/thread state, pause/resume, replay/fork-oriented state history.
  - https://docs.langchain.com/oss/javascript/langgraph/persistence
  - https://docs.langchain.com/oss/javascript/langgraph/interrupts
- OpenAI Agents SDK JavaScript HITL: approval interruptions, serializable run state, long-lived pause/resume, exact pending tool approvals, and fail-closed resume behavior.
  - https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- Microsoft Agent Framework workflows: checkpoints for long-running recovery, pending requests in checkpoint state, external request/response HITL, and resume/rehydration.
  - https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints
  - https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop

## Capability assessment

| Capability | Native DataNexus status after this slice | Disposition | Evidence / rationale |
| --- | --- | --- | --- |
| Durable business execution truth | `ADVANTAGE` | `KEEP` | `orchestration.durable_jobs` remains canonical; checkpoint state cannot override business-job authority. |
| Step-level resumability | `PARITY` for existing deterministic steps | `KEEP` | Existing `agent_run_steps` supports resumable step execution and successful-step reuse. |
| Generalized runtime checkpoints | `PARITY` foundation | `BUILD_NOW` | New append-only, versioned checkpoints with ordered history and parent lineage. |
| Checkpoint integrity | `ADVANTAGE` | `KEEP` | Database computes SHA-256 from canonical `jsonb` state; caller cannot assert an arbitrary state digest. |
| Checkpoint state privacy | `ADVANTAGE` | `KEEP` | Native state contract is reference-oriented and explicitly excludes raw prompts, completions, hidden reasoning, credentials, and arbitrary tool output. |
| Concurrency-safe checkpoint ordering | `PARITY` | `BUILD_NOW` | Transaction advisory lock serializes checkpoint sequence allocation per agent run. |
| Long-lived pause | `PARITY` foundation | `BUILD_NOW` | Interrupt creation atomically checkpoints state and moves the run from `RUNNING` to `WAITING`. |
| Human approve/reject | `PARITY` foundation | `BUILD_NOW` | Authenticated project-admin resolution records `APPROVED` or `REJECTED`. |
| Approval bound to exact action | `ADVANTAGE` | `KEEP` | HUMAN_APPROVAL requires an exact SHA-256 action-payload fingerprint and rejects mismatched approval payloads. |
| Approval vs execution separation | `ADVANTAGE` | `KEEP` | Human decision leaves the run `WAITING`; only the internal runtime resume path moves it back to `RUNNING`. Approval therefore never directly executes a side effect. |
| Interrupt idempotency | `PARITY` | `BUILD_NOW` | Reuse requires the same state, action authority fields, summary, expiration, and idempotency key; collisions fail closed. |
| Pause/resume application integration | `PARTIAL` | `BUILD_LATER` | Shared primitives and decision API exist; individual agents still need explicit adoption. |
| State history | `PARITY` foundation | `BUILD_NOW` | Checkpoints are append-only and ordered per run. |
| Controlled replay/fork lineage | `PARITY` foundation | `BUILD_NOW` | Replay creates a new child run and copies a known checkpoint as `REPLAY_SOURCE`; source history is never rewritten. |
| Replay side-effect safety across every agent tool | `PARTIAL` | `BUILD_LATER` | Fork creation is safe, but each side-effecting tool must prove idempotent/replay-safe semantics before automatic replay execution. |
| Arbitrary production time-travel that rewinds external side effects | `NOT_APPLICABLE` | `REJECT` | Database state rewind cannot truthfully undo external effects. DataNexus uses immutable source history plus controlled forks instead. |
| Interrupt expiration | `PARITY` foundation | `BUILD_NOW` | Expired pending approvals resolve to `EXPIRED`; runtime remains paused for explicit handling/escalation. |
| Interrupt cancellation automation | `PARTIAL` | `BUILD_LATER` | Schema supports `CANCELLED`; a generic cancellation command is intentionally not exposed in this first slice. |
| Full graph/superstep snapshot of arbitrary executor internals | `GAP_DEFERRED` | `BUILD_LATER` | Native v1 persists safe structured continuation state rather than opaque arbitrary executor objects. |
| Graph topology/version compatibility during long pauses | `GAP_REQUIRED` | `BUILD_LATER` | State is versioned, but future agent-definition/runtime-version pinning must be added before multi-day resume is declared fully production-complete. |
| Nested-agent pending approvals | `GAP_DEFERRED` | `BUILD_LATER` | Multi-agent supervisor/handoff runtime is a later native slice. |
| User-facing pending-approval workspace | `GAP_REQUIRED` | `BUILD_LATER` | API and RLS foundations exist; operator UX still needs to be built. |
| Trajectory evaluation across checkpoint history | `GAP_REQUIRED` | `BUILD_LATER` | Checkpoint lineage provides the evidence base, but trajectory scoring/regression evaluation is a later slice. |

## Deliberate differences from generic frameworks

DataNexus does not persist an opaque framework-owned run object as its source of truth. Native checkpoints persist a small, versioned, structured continuation contract and references to canonical evidence/memory.

This is deliberate because opaque serialized agent state can accidentally carry prompts, model completions, secrets, provider-specific objects, or stale authority. DataNexus authorization remains current at the moment an action is executed.

Likewise, replay is not modeled as mutation of historical state. A replay is a new child `agent_run` with explicit source-run/source-checkpoint lineage. This preserves failure evidence and prevents historical outcomes from being rewritten.

## Acceptance boundary for this slice

This slice is complete only when all of the following are true:

1. migration reconstructs cleanly and passes repository database verification;
2. new tables have RLS and authenticated users have read-only table access;
3. internal checkpoint/interrupt/replay mutation functions are service-role only;
4. human decision RPC executes in authenticated user context and independently verifies project-admin authority;
5. checkpoint/replay history is immutable;
6. HUMAN_APPROVAL is bound to an exact action fingerprint;
7. approval does not resume or execute the action;
8. resume requires a resolved human decision and a `WAITING` run;
9. replay creates a new child run without altering the source run/checkpoint;
10. no external agent framework is introduced as a runtime dependency;
11. CI verifies these contracts on the exact PR head.

## Next native runtime slices

After this foundation is merged and production-verified, the next parity challenges should be:

1. runtime/agent-definition version pinning for safe long-lived resume;
2. tool input/output schemas and pre/post execution guardrails;
3. bounded planning plus deterministic plan validation;
4. specialist handoff/context filtering and supervisor-worker coordination;
5. trajectory evaluation and checkpoint-based regression tests;
6. operator UI for pending approvals, checkpoint history, and controlled replay;
7. per-tool replay/idempotency certification before any automatic replay execution.
