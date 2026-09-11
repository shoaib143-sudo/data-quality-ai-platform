# DataNexus AI — Repository Agent Working Rules

These rules apply to AI-assisted architecture, implementation, review, and agent-platform work in this repository.

## Native-first does not mean framework-blind

DataNexus will build its agent platform natively end-to-end before adopting external agent runtimes as production dependencies. This is a baseline-building strategy, not a reason to ignore better ideas from the wider ecosystem.

For every significant native agent or agent-runtime capability, the implementing assistant MUST actively challenge the design against current best-in-class agent runtimes, protocols, standards, and enterprise practices before treating the work as complete.

The review must answer:

1. What capability does DataNexus have today?
2. What do current best-in-class systems support that is materially stronger, safer, more reliable, more observable, or more maintainable?
3. Which advanced capabilities are missing from DataNexus?
4. For each gap, is it required now, intentionally deferred, not applicable, or better represented by an extension point?
5. Does the proposed implementation preserve DataNexus authority, evidence, privacy, security, audit, rollback, validation, and project-scope boundaries?
6. Does the change alter the ADR-007 classification of any agent?
7. Is the implementation replaceable or benchmarkable later without surrendering DataNexus control-plane authority?
8. What objective evidence would demonstrate parity, advantage, or deficiency?

## Required capability status

Every relevant capability comparison should use one of:

- `ADVANTAGE`
- `PARITY`
- `PARTIAL`
- `GAP_REQUIRED`
- `GAP_DEFERRED`
- `NOT_APPLICABLE`

## Required implementation disposition

Every identified capability or gap should use one of:

- `KEEP`
- `BUILD_NOW`
- `BUILD_LATER`
- `BORROW_PATTERN`
- `EXTENSION_POINT`
- `BENCHMARK_LATER`
- `REJECT`
- `NOT_APPLICABLE`

## Advanced capability challenge areas

Where relevant, compare the native implementation against the current frontier for:

- durable execution and crash recovery;
- step persistence and generalized checkpointing;
- pause/resume and long-lived human-in-the-loop waits;
- replay, state history, controlled forking/time-travel;
- idempotent re-entry and duplicate-side-effect prevention;
- cancellation, timeout, retry, and lease semantics;
- reactive and deliberative reasoning;
- bounded planning and plan validation;
- utility/risk-aware decision selection;
- typed tools, input/output schemas, and tool guardrails;
- dynamic tool selection and least-privilege tool exposure;
- specialist handoffs and context filtering;
- supervisor/worker and hierarchical multi-agent coordination;
- memory lifecycle and separation of working, episodic, semantic, and validated learning context;
- governed adaptive learning and learning-authority boundaries;
- retrieval quality, provenance, grounding, and citation integrity;
- offline and online evaluation, trajectory evaluation, and regression testing;
- human-in-the-loop and human-on-the-loop governance;
- observability, tracing, correlation, token/cost accounting, and privacy-safe telemetry;
- authorization, isolation, prompt/tool injection resistance, and fail-closed behavior;
- rollback, recovery, escalation, and post-action validation;
- interoperability and replaceable protocol boundaries;
- latency, throughput, concurrency, token use, model calls, and total operating cost;
- developer experience, testability, upgrade risk, lock-in, and maintainability.

## DataNexus-owned authority boundaries

The following remain DataNexus-owned even if future external runtimes are benchmarked or adopted:

- authentication and identity;
- organization/project scope;
- row-level security and authorization;
- agent authority and tool allowlists;
- governed mutation policy;
- risk tiers and user approval requirements;
- canonical evidence and immutable audit history;
- durable business-job truth;
- result-artifact integrity;
- retry ceilings and idempotency controls;
- rollback governance;
- recovery evidence and escalation;
- model-routing and evaluation authority;
- learning-authority boundaries;
- privacy, secret-redaction, and sensitive-data boundaries.

External frameworks may later reason, plan, checkpoint, coordinate, retrieve, or call tools around these boundaries. They must not become the authority for them.

## Source-of-truth documents

- `Architecture/2026-09-11-ADR-007-agent-classification-framework.md`
- `Architecture/2026-09-11-ADR-008-native-first-agent-runtime-and-continuous-capability-parity.md`
- corresponding records under `Major discussion/`

When implementation evidence conflicts with documentation, runtime evidence wins and the documentation must be corrected.
