# Major Discussion — Native-First Agent Runtime and Continuous Capability Parity

**Date:** 2026-09-11  
**Status:** Accepted  
**Decision owner:** DataNexus AI architecture

## Decision

DataNexus will complete its agent platform end-to-end using native DataNexus components before introducing external agent frameworks into the production runtime.

This is a **native-first**, not **native-only**, decision.

The architecture standard is recorded in:

`Architecture/2026-09-11-ADR-008-native-first-agent-runtime-and-continuous-capability-parity.md`

ADR-007 continues to govern how every agent is classified.

## Why this decision was made

DataNexus already contains substantial native foundations: durable jobs, agent run state, governed tool allowlists, project-scoped authorization, result artifacts, recovery governance, memory and learning boundaries, model routing and evaluation controls, audit evidence, and canonical telemetry.

Introducing a general-purpose agent framework before the native platform is complete would make it difficult to tell whether a framework is adding real value or simply filling gaps that the product had not yet implemented.

A complete native baseline gives DataNexus a trustworthy reference implementation. External frameworks can then be evaluated objectively using identical workloads and acceptance criteria.

## Continuous Challenge Requirement

The team does not want native development to become isolated from the broader agent ecosystem.

For every significant native capability, DataNexus must ask:

- Does a mature runtime support something more advanced here?
- Are we missing checkpointing, pause/resume, replay, forking, planning, tool guardrails, specialist delegation, memory controls, evaluation, interoperability, or observability?
- Is the missing feature actually required for DataNexus?
- Should we build it now, defer it explicitly, borrow the pattern, or expose an extension point?
- Does the proposed native implementation preserve governance and evidence better than the external pattern?
- How would we later benchmark the two implementations fairly?

The answer should be evidence-backed rather than based on framework popularity.

## Standing Reference Set

Current references to question native completeness include:

- LangGraph — stateful graph execution, checkpoints, interrupts, replay/forking;
- OpenAI Agents SDK — TypeScript agent loops, handoffs, tools, guardrails, tracing;
- Microsoft Agent Framework — deterministic/agent/HITL workflow composition and validation;
- CrewAI — specialist crews, hierarchical coordination, stateful flows;
- LlamaIndex — ingestion, retrieval, query-tools, document intelligence;
- Google ADK — agent lifecycle, evaluation, deployment, A2A/MCP patterns;
- MCP — tool/resource interoperability;
- A2A — agent-to-agent interoperability;
- OpenTelemetry GenAI semantic conventions — portable agent/model observability.

This list is expected to evolve. Being listed does not imply adoption.

## How we will judge DataNexus

Every important capability should be assigned one of:

- `ADVANTAGE`
- `PARITY`
- `PARTIAL`
- `GAP_REQUIRED`
- `GAP_DEFERRED`
- `NOT_APPLICABLE`

Every resulting architecture action should be one of:

- `KEEP`
- `BUILD_NOW`
- `BUILD_LATER`
- `BORROW_PATTERN`
- `EXTENSION_POINT`
- `BENCHMARK_LATER`
- `NOT_APPLICABLE`
- `REJECT`

A gap must not disappear simply because the native implementation is functioning. Advanced capability completeness must be reviewed deliberately.

## Native completion is more than having named agents

The native agent platform will be considered end-to-end only when there is acceptance evidence for the complete lifecycle, including where applicable:

trigger → durable execution → state/checkpoint → reasoning/planning → retrieval → tool selection → authorization → approval → mutation → validation → result artifact → audit → telemetry → recovery/rollback/escalation → learning evidence.

The portfolio must also be classified under ADR-007 so that advanced labels such as goal-based, learning, utility-based, self-healing, or multi-agent are used only where runtime evidence supports them.

## What remains permanently DataNexus-owned

Framework comparisons must not move the following authority outside DataNexus:

- identity and access control;
- project/tenant isolation;
- RLS;
- mutation authority;
- human consent policy;
- risk tiers;
- canonical evidence;
- immutable audit;
- durable business-job truth;
- retry/idempotency controls;
- rollback governance;
- result integrity;
- model-routing and evaluation authority;
- learning-authority boundaries.

Future frameworks may execute inside these boundaries, never replace them by default.

## Post-native evaluation plan

After native E2E completion, DataNexus will benchmark individual runtime components rather than perform a wholesale framework migration.

Examples:

- native recovery orchestration vs LangGraph-based recovery orchestration;
- native TypeScript agent loop vs OpenAI Agents SDK;
- native governance retrieval vs LlamaIndex;
- native tool contracts vs MCP-compatible exposure;
- native cross-agent handoff vs A2A-compatible distributed agents.

Each benchmark should keep authorization, evidence, models, tools, workload, and acceptance criteria as equivalent as practical.

## Immediate implementation implication

The next native runtime work should prioritize reusable primitives that multiple agents need rather than adding isolated agent-specific logic.

The capability review should particularly question:

1. checkpointed execution state;
2. governed pause/resume;
3. explicit handoffs and context filtering;
4. bounded planning and plan validation;
5. tool input/output guardrails;
6. replay/failure recovery and duplicate-side-effect prevention;
7. multi-agent supervisor/specialist coordination;
8. trajectory and tool-selection evaluation;
9. standardized correlation/telemetry;
10. replaceable interfaces for future runtime benchmarking.

## Agreed operating principle

> Build DataNexus native-first, but challenge every important capability against the current industry frontier. Know explicitly whether DataNexus is ahead, at parity, partially complete, or intentionally behind. Build the full native baseline first; replace components later only when controlled evidence proves the replacement is better without weakening governance.