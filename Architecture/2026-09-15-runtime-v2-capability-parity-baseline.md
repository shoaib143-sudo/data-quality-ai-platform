# Runtime v2 Capability-Parity Baseline

**Date:** 2026-09-15  
**Status:** Phase-0 baseline; deliberately conservative  
**Authority:** ADR-008 Native-First Agent Runtime and Continuous Capability Parity

## Purpose

This ledger establishes the starting capability status for Runtime v2. It is not a claim that DataNexus is already at industry parity. ADR-008 explicitly prohibits unsupported `PARITY` or `ADVANTAGE` claims, so this baseline uses conservative labels unless current runtime evidence is sufficient.

The ledger must be refreshed after each material Runtime v2 phase and before production certification.

## Status and disposition vocabulary

Capability status:

- `ADVANTAGE`
- `PARITY`
- `PARTIAL`
- `GAP_REQUIRED`
- `GAP_DEFERRED`
- `NOT_APPLICABLE`

Implementation disposition:

- `KEEP`
- `BUILD_NOW`
- `BUILD_LATER`
- `BORROW_PATTERN`
- `EXTENSION_POINT`
- `BENCHMARK_LATER`
- `REJECT`
- `NOT_APPLICABLE`

## Baseline ledger

| Capability domain | Current DataNexus evidence | Status | Disposition | Runtime v2 target/evidence gate |
|---|---|---|---|---|
| Durable execution and state | Durable orchestration/job truth exists; run/step records, runtime manifests, checkpoints, interrupts, replay and recovery structures exist in current schema; worker and durable-queue certification already run in CI. Generalized state-transition semantics and cross-capability recovery are not yet the Runtime v2 final contract. | `PARTIAL` | `BUILD_NOW` | Explicit guarded state machine, idempotent re-entry, leases, bounded retries, pause/resume/cancel/timeout semantics, checkpoint/recovery tests and crash-recovery evidence. |
| Human governance | Agent Policy v2 has server-authoritative risk, resource authorization, Business + Governance separation, same-person dual-axis prevention, scoped delegation, mandatory comments, replay guards, immutable execution fingerprints, external-channel fail-closed behavior and post-implementation adversarial validation. Approval expiry and deeper runtime revalidation are Runtime v2 follow-ups. | `PARTIAL` | `KEEP` + `BUILD_NOW` | Preserve current controls; add default 7-day expiry, immediate material-fingerprint invalidation, pre-execution revalidation, governed indefinite waits and resume-without-duplicate-side-effect evidence. |
| Tools and action safety | Live tool registry exists; execution authority is capability gated; Agent Policy risk/approval boundaries already protect mutations. Typed input/output definitions exist in the registry, but independent tool lifecycle/environment controls, universal guardrails, budget enforcement and post-tool evidence validation are not yet complete. | `PARTIAL` | `BUILD_NOW` | Independent tool enablement/environment restrictions, typed validation, least privilege, pre-tool authorization, idempotency rules, post-tool evidence checks, limits and adversarial bypass tests. |
| Multi-agent coordination | Agent messages and correlation structures exist, and current product architecture supports multiple specialist agent domains, but Runtime v2 does not yet have the frozen allow-listed delegation contract with bounded depth/budget and handoff-before-side-effect authorization across the full runtime. | `GAP_REQUIRED` | `BUILD_NOW` | Explicit source/destination allow-list, context filtering, bounded recursion/depth/cost, correlation/evidence, supervisor/worker acceptance scenarios and unauthorized-handoff tests. |
| Reasoning and planning | Native agents already execute governed domain-specific work and current architecture separates deterministic policy from agent behavior. A generalized bounded planning contract with plan validation, alternative evaluation and explicit goal-state evidence is not yet certified across the runtime. | `PARTIAL` | `BUILD_LATER` + `BORROW_PATTERN` | Preserve deterministic governance boundary; introduce bounded planning only where it materially improves agent class requirements, with plan validation/evaluation tests and ADR-007 impact review. |
| Memory and governed learning | ADR-006 learning boundaries and governed-outcome-learning certification exist; policy/authorization is not delegated to learned state. Runtime v2 has not yet demonstrated a complete generalized working/episodic/semantic memory lifecycle with expiry, provenance and rollback across all relevant agents. | `PARTIAL` | `BUILD_LATER` | Keep validated-learning authority; add memory lifecycle only for agent classes that require it, including provenance, expiration, scope, rollback and tests proving memory cannot alter authorization. |
| Retrieval and knowledge | Retrieval permission/grounding checks and retrieval benchmark authority exist in CI, and DataNexus already preserves project/resource scope. Complete provider-neutral retrieval replacement and all freshness/ingestion/grounding quality dimensions are not yet benchmarked as Runtime v2 capabilities. | `PARTIAL` | `KEEP` + `EXTENSION_POINT` | Preserve permission filtering/provenance; benchmark structured/semantic/hybrid retrieval and expose replaceable provider boundaries without moving authorization outside DataNexus. |
| Evaluation | Deterministic contracts, adversarial gates, AI red-team evidence, P0-P5 revalidation, production evidence checks and release certification exist. Trajectory evaluation, tool-selection quality, recovery success rate and continuous version/provider promotion evidence are not yet first-class for all Runtime v2 runs. | `PARTIAL` | `BUILD_NOW` | Persist trajectory/evaluation evidence continuously; version benchmarks and regression sets; use results for version/model/provider promotion, canary expansion and rollback. |
| Observability | Job Monitor, run details, persisted steps/evidence, durable queue health, telemetry gates and production smoke evidence exist. Unified run/step/tool/handoff/approval/recovery spans with token/cost attribution are incomplete. | `PARTIAL` | `BUILD_NOW` | Governed trace correlation across run/step/tool/handoff/approval/recovery, token/cost visibility under resource authorization, privacy-safe exports and Job Monitor drilldown. |
| Security and safety | RLS/project isolation, resource ACL DENY precedence, server-authoritative capabilities/risk, fail-closed approvals, replay protection, CodeQL/dependency scanning, production security posture and red-team workflows already exist. Runtime v2 introduces new tool/handoff/provider/budget/kill-switch attack surfaces that still require dedicated adversarial certification. | `PARTIAL` | `KEEP` + `BUILD_NOW` | Preserve existing controls; test prompt/tool-output injection, cross-project access, provider/residency bypass, disabled-tool execution, handoff/budget/kill-switch/break-glass bypass and secret-redaction boundaries. |
| Provider/model routing | Governed model gateway and provider-boundary checks already exist in CI. Frozen Runtime v2 fallback policy requires explicit production eligibility, equivalent-or-stronger residency/security/governance constraints, promotion gates and canary behavior not yet fully implemented. | `PARTIAL` | `BUILD_NOW` | Approved provider/model registry, evaluation state, residency/security eligibility, deterministic fallback ranking, explicit promotion and failover/canary/rollback tests. |
| Agent version lifecycle | Agent definitions are versioned and historical runs bind to agent-definition IDs, but multiple enabled versions can coexist and the explicit `DRAFT → VALIDATED → APPROVED → ACTIVE → RETIRED` production lifecycle is not yet the governing runtime contract. | `GAP_REQUIRED` | `BUILD_NOW` | One canonical Active version per governed scope, explicit promotion, rollback, immutable historical binding and negative tests preventing implicit newest-version activation. |
| Failure and recovery | Durable queues, provider timeout/fallback tests, emergency execution controls, runtime interrupts and recovery structures exist. A single deterministic framework covering worker crash, partial side effects, poison jobs, stale approvals, retry exhaustion and recovery evidence is not yet complete. | `PARTIAL` | `BUILD_NOW` | Unified failure taxonomy, safe resume/abort/compensation, retry ceilings, recovery audit/evidence and chaos scenarios. |
| Concurrency, budgets and cost control | Worker isolation/capacity and AI budget-scope composition are already tested. Runtime v2 requires configurable project/agent/tool concurrency and explicit runtime/token/cost/step/tool-call/delegation budgets exposed as governed controls. | `PARTIAL` | `BUILD_NOW` | Configurable server-authoritative defaults, admin tuning, backpressure/fairness, hard budget enforcement and load/adversarial tests. |
| Artifact/message lifecycle | Agent artifacts/messages exist and approval/execution evidence is persisted. Frozen 5–7 year artifact retention, aligned message/audit lifecycle and Governance Admin legal hold are not yet complete lifecycle controls. | `GAP_REQUIRED` | `BUILD_NOW` | Retention classification, legal hold, immutable metadata, governed access, expiration jobs and evidence-preservation tests. |
| Emergency operations | Existing emergency-execution controls are certified in V6. Runtime v2 additionally requires explicit global/project/agent/tool kill switches and time-limited reason-bound break-glass with enhanced audit and post-event review. | `PARTIAL` | `BUILD_NOW` | Hierarchical kill switch enforcement, break-glass expiry/MFA integration where supported, bypass tests and post-event evidence. |
| Interoperability and replaceability | ADR-008 explicitly keeps DataNexus authority native and requires replaceable boundaries. Production runtime intentionally does not depend on external agent frameworks today; generalized MCP/A2A/provider-neutral replacement interfaces remain future-facing. | `GAP_DEFERRED` | `EXTENSION_POINT` + `BENCHMARK_LATER` | Keep native authority; design portable typed-tool, telemetry, provider and handoff interfaces; benchmark external runtimes only after native E2E baseline is complete. |
| Production rollout governance | Branch protection, release governance, production security gates, preview deployments and production smoke validation already exist. Runtime/model/provider-specific canary promotion with automatic rollback conditions is not yet the unified Runtime v2 release mechanism. | `PARTIAL` | `BUILD_NOW` | Preview → validated test → canary → monitored production → full production, with explicit failure/SLO/cost/auth/audit rollback signals. |

## Industry-reference challenge set

The comparison set remains the categories accepted in ADR-008 rather than a dependency list:

- stateful/durable graph runtimes for checkpoint, replay, interrupt and recovery patterns;
- native agent SDKs for tools, handoffs, guardrails and tracing;
- deterministic/HITL workflow frameworks for workflow validation and pause/resume semantics;
- hierarchical multi-agent systems for specialist coordination;
- knowledge-oriented frameworks for retrieval/ingestion patterns;
- MCP-style agent-to-tool/resource interoperability;
- A2A-style agent-to-agent interoperability;
- OpenTelemetry GenAI semantic conventions for replaceable telemetry semantics.

Patterns may be borrowed, but none of these systems becomes the authority for DataNexus identity, authorization, risk, approvals, evidence, durable job truth, retry ceilings, rollback, provider eligibility, learning authority or privacy.

## Phase-0 conclusions

### Build now

The current native baseline is strong enough to continue without adopting an external runtime, but the following are required before Runtime v2 E2E completion:

1. durable state-machine hardening;
2. agent version lifecycle;
3. independent governed tool controls and universal tool guardrails;
4. allow-listed multi-agent orchestration;
5. provider eligibility/fallback/promotion controls;
6. unified recovery semantics;
7. configurable concurrency and execution budgets;
8. artifact/message retention and legal hold;
9. continuous trajectory/evaluation evidence;
10. unified runtime observability and cost attribution;
11. hierarchical emergency controls;
12. canary runtime/model/provider rollout.

### Intentionally deferred or extension-point work

- generalized advanced planning where current agent classes do not require it;
- generalized memory architecture beyond proven agent-class need;
- external runtime replacement benchmarking;
- production dependence on MCP/A2A or external agent frameworks.

These remain explicit rather than silently missing.

## Evidence rule for future updates

A later phase may promote a capability to `PARITY` or `ADVANTAGE` only when objective runtime evidence or a controlled comparison supports the claim. Architectural similarity alone is insufficient.
