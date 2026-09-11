# ADR-008 — Native-First Agent Runtime and Continuous Capability Parity

**Date:** 2026-09-11  
**Status:** Accepted  
**Applies to:** All DataNexus AI agent runtime, orchestration, reasoning, memory, learning, recovery, tooling, interoperability, evaluation, and observability work

## Context

DataNexus has chosen to complete its agent platform end-to-end using native DataNexus components before introducing external agent frameworks into the production runtime.

This decision is not a rejection of industry frameworks or standards. It is intended to create a trustworthy native baseline that can later be benchmarked empirically against external implementations without confusing framework value with missing product foundations.

Native-first must not become native-only, framework-blind, or an excuse to reimplement mature capabilities without comparison. DataNexus must continuously challenge its native implementation against current best practices, open standards, and advanced capabilities available in mature agent runtimes.

ADR-007 remains the canonical multi-dimensional agent classification framework. ADR-008 defines how native implementation decisions are reviewed for capability completeness and industry parity.

## Decision

DataNexus will build the complete production agent platform natively first.

External frameworks may be used as references, benchmarks, test implementations, or later replacement candidates, but they must not become production runtime dependencies until the native end-to-end baseline exists and a controlled benchmark demonstrates a material benefit.

For every significant native agent capability, the implementation review MUST answer:

1. What capability is being implemented?
2. What is the current DataNexus behavior and evidence?
3. What advanced capabilities exist in relevant current industry runtimes or standards?
4. Which of those capabilities are required now, intentionally deferred, or not applicable?
5. Does the implementation preserve DataNexus authority, evidence, security, audit, rollback, and validation boundaries?
6. Does the change alter the ADR-007 classification of any agent?
7. Is the implementation replaceable through an explicit interface if a future external runtime outperforms it?
8. What objective benchmark would later prove parity, advantage, or deficiency?

## Native-First Non-Negotiable Boundaries

The following remain DataNexus-owned regardless of future framework adoption:

- authentication and identity;
- project and tenant scope;
- row-level security and authorization;
- agent authority and tool allowlists;
- governed mutation boundaries;
- human approval and risk-tier policy;
- canonical evidence and immutable audit history;
- durable business-job state;
- result artifacts and evidence integrity;
- retry ceilings and idempotency controls;
- rollback governance;
- recovery evidence and escalation;
- model-routing authority and evaluation evidence;
- learning-authority boundaries;
- current-policy authorization for every governed action;
- privacy and secret-redaction boundaries.

External runtimes may reason, plan, coordinate, checkpoint, retrieve, or call tools around these boundaries, but they may not become the authority for them.

## Continuous Capability Parity Gate

Every material agent-runtime feature MUST be reviewed against the following capability domains where relevant.

### Execution and State

- durable execution;
- step-level persistence;
- checkpointing;
- crash recovery;
- pause/resume;
- replay;
- state history;
- controlled forking/time-travel;
- idempotent re-entry;
- duplicate-side-effect prevention;
- bounded retries;
- cancellation and timeout semantics.

### Reasoning and Planning

- reactive execution;
- deliberative planning;
- bounded plan generation;
- plan validation before execution;
- alternative-plan evaluation;
- explicit goal-state evaluation;
- utility/risk/cost evaluation where implemented;
- deterministic policy separation from probabilistic reasoning.

### Human Governance

- human-in-the-loop approval;
- human-on-the-loop supervision;
- indefinite governed pause;
- approval expiry/revocation;
- proposal version binding;
- rejection and escalation;
- resumed execution after approval without replaying unsafe side effects.

### Tools and Action Safety

- typed tool schemas;
- tool discovery;
- least privilege;
- input validation;
- output validation;
- pre-tool authorization;
- post-tool evidence validation;
- tool-call idempotency;
- tool error classification;
- dynamic tool selection only within deterministic allowlists;
- external-tool trust boundaries.

### Multi-Agent Coordination

- specialist handoffs;
- supervisor/worker patterns;
- agents-as-tools;
- context filtering during handoff;
- sequential and parallel delegation;
- bounded recursion;
- cross-agent correlation and evidence;
- independent specialist authority boundaries;
- future distributed-agent interoperability.

### Memory and Learning

- working memory;
- durable memory;
- episodic history;
- semantic retrieval;
- provenance-bearing memory;
- memory expiration and scope;
- validated outcome learning;
- separation of memory from authorization;
- learning rollback/versioning;
- prevention of unvalidated experience from changing policy.

### Retrieval and Knowledge

- structured retrieval;
- vector/semantic retrieval;
- hybrid retrieval;
- grounded citations;
- permission-filtered retrieval;
- document ingestion and chunking;
- knowledge freshness;
- evidence provenance;
- external research boundaries.

### Evaluation

- deterministic contract tests;
- offline evaluations;
- production evidence evaluation;
- regression sets;
- agent trajectory evaluation;
- tool-selection accuracy;
- groundedness;
- recovery success rate;
- false-action / unsafe-action rate;
- latency and token cost;
- benchmark versioning and provenance.

### Observability

- trace correlation;
- agent run / step / tool spans;
- model usage and cost;
- failure and retry events;
- handoff events;
- human-approval events;
- recovery events;
- privacy-safe telemetry;
- canonical in-platform evidence separated from external observability exports.

### Security and Safety

- prompt-injection resistance;
- tool-output injection resistance;
- privilege escalation prevention;
- cross-project isolation;
- secret redaction;
- least privilege;
- fail-closed behavior;
- policy bypass resistance;
- malicious external tool/server handling;
- replay and duplicate-action protection.

### Interoperability

Industry protocols and runtimes may be studied as reference requirements even while the production implementation remains native. Interoperability interfaces should be designed so that later adoption does not require rewriting DataNexus governance authority.

Relevant categories include:

- agent-to-tool/resource interoperability;
- agent-to-agent interoperability;
- standardized telemetry semantics;
- portable typed tool schemas;
- provider-neutral model interfaces;
- replaceable retrieval, memory, evaluation, and reasoning providers.

## Capability Disposition

Every comparison finding MUST receive one of these dispositions:

- `KEEP` — native DataNexus is appropriate or stronger;
- `BUILD_NOW` — materially required for the end-to-end native platform;
- `BUILD_LATER` — useful but intentionally deferred with rationale;
- `BORROW_PATTERN` — external design is useful but DataNexus should implement the pattern natively;
- `EXTENSION_POINT` — keep native behavior but expose a replaceable interface;
- `BENCHMARK_LATER` — external implementation should be tested after native E2E completion;
- `NOT_APPLICABLE` — capability does not fit the DataNexus use case;
- `REJECT` — pattern would weaken governance, duplicate authority, or add unjustified complexity.

A missing capability may not be silently ignored. If not implemented, the reason and planned disposition must be explicit.

## Native Capability Status Labels

For architecture reviews, DataNexus capabilities SHOULD be labeled using:

- `ADVANTAGE` — stronger for DataNexus requirements than reviewed alternatives;
- `PARITY` — materially equivalent for our use case;
- `PARTIAL` — implemented but missing advanced behavior;
- `GAP_REQUIRED` — missing and needed before native E2E completion;
- `GAP_DEFERRED` — missing, useful, but explicitly deferred;
- `NOT_APPLICABLE`.

No `PARITY` or `ADVANTAGE` claim should be made solely from design similarity. It should be backed by runtime evidence or a controlled benchmark when practical.

## Reference Implementations and Standards

During native development, the team should continuously inspect relevant current industry systems as references. The reference set may evolve and is not a dependency list.

Representative references currently include:

- LangGraph for stateful graph execution, checkpointing, interrupts, replay, and branching;
- OpenAI Agents SDK for TypeScript-native loops, handoffs, tools, guardrails, and tracing;
- Microsoft Agent Framework for deterministic/agent/HITL workflow separation and workflow validation;
- CrewAI for crew/flow separation and hierarchical specialist coordination;
- LlamaIndex for retrieval, ingestion, query-tools, and knowledge-oriented agents;
- Google ADK for agent lifecycle, evaluation, deployment, and interoperability patterns;
- MCP for agent-to-tool/resource interoperability;
- A2A for agent-to-agent interoperability;
- OpenTelemetry GenAI semantic conventions for observability alignment.

Reference frameworks do not become DataNexus policy authorities.

## Required Review Format for Agent Work

For every substantial agent PR or architecture increment, the implementation review SHOULD contain a concise capability challenge:

**Native capability**  
What DataNexus implements now.

**Industry reference**  
What mature current runtimes or standards support that is relevant.

**Gap**  
What DataNexus still lacks.

**Decision**  
`KEEP`, `BUILD_NOW`, `BUILD_LATER`, `BORROW_PATTERN`, `EXTENSION_POINT`, `BENCHMARK_LATER`, `NOT_APPLICABLE`, or `REJECT`.

**ADR-007 impact**  
Whether any agent classification changes.

**Evidence**  
Tests, production evidence, benchmarks, or authoritative documentation supporting the decision.

## Native E2E Completion Gate

DataNexus will not consider the native agent platform complete solely because all named agents exist.

Native E2E completion requires evidence that the platform supports, where applicable:

- durable execution and state recovery;
- governed tool execution;
- bounded planning and action validation;
- human approval and resume;
- specialist handoff/delegation;
- memory and governed learning;
- retrieval and grounded evidence;
- result artifacts;
- agent and business-job correlation;
- evaluation and regression evidence;
- observability and cost evidence;
- recovery, rollback, and escalation;
- security and isolation;
- portfolio-wide ADR-007 classification;
- objective end-to-end acceptance scenarios.

Only after this baseline exists should DataNexus run controlled replacement benchmarks against external agent runtimes.

## Post-Baseline Benchmark Rule

When external runtimes are evaluated after native E2E completion, the same workload, model/provider configuration, evidence inputs, authorization policy, tool contracts, and acceptance criteria should be used wherever possible.

A framework may replace a native component only if the benchmark demonstrates a material improvement in one or more of:

- correctness;
- reliability;
- recoverability;
- security;
- developer maintainability;
- latency;
- cost;
- observability;
- extensibility;
- interoperability;

without weakening DataNexus governance or evidence integrity.

## Consequences

### Positive

- DataNexus obtains a complete independent production baseline.
- Framework choices can be benchmarked empirically rather than selected on marketing claims.
- Native development remains informed by advanced external capabilities.
- Replaceability is designed in before external adoption.
- Governance authority remains stable across future runtime substitutions.
- Missing advanced capabilities become explicit rather than accidental.

### Trade-offs

- Native implementation requires more engineering work before framework benchmarking.
- The team must continuously review evolving external capabilities and standards.
- Some advanced features may be intentionally deferred until core E2E completion.
- A disciplined capability ledger and acceptance evidence are required.

## Relationship to Other Decisions

- **ADR-006** remains authoritative for AI intelligence, learning, governance, evaluation, and observability boundaries.
- **ADR-007** remains authoritative for agent classification.
- **ADR-008** establishes the native-first implementation and continuous capability-parity governance process.

## Summary

**Build DataNexus native-first, but never framework-blind.**

Every important agent capability must be challenged against the current industry frontier. DataNexus must explicitly know whether it is ahead, at parity, partially complete, or intentionally behind. External systems may later replace individual components only after the complete native baseline exists and evidence shows that replacement is materially better without weakening governance.