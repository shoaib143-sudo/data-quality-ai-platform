# Runtime v2 — Optimized Implementation Plan

**Date:** 2026-09-15  
**Status:** Approved implementation baseline  
**Applies to:** DataNexus agent runtime, orchestration, governed tools, provider routing, recovery, observability, evaluation, and production rollout

## Objective

Complete the native DataNexus Agent Runtime & Execution Orchestration v2 without surrendering DataNexus control-plane authority. Items 2–29 of the approved backlog are in scope; secret rotation remains intentionally deferred.

## Non-negotiable authority boundaries

DataNexus remains authoritative for authentication, tenant/project scope, RLS and resource authorization, agent/tool authority, risk classification, approvals, durable execution truth, evidence/audit integrity, retry/idempotency ceilings, rollback/recovery governance, provider/model production eligibility, learning authority, privacy, and secrets.

## Parallelism model

Run 3–4 streams concurrently where dependencies allow. Avoid parallel schema ownership of the same table contract. Prefer additive forward-only migrations and small independently validated PRs.

A blocked stream must not stall independent streams. External-auth or policy blockers are isolated and revisited only when they become critical-path dependencies.

## Phase 0 — Baseline, contracts, and capability ledger

**Stream A — Documentation**
- refresh `PROJECT_STATE_v2.md`;
- consolidate current Agent Policy and production state;
- remove stale placeholder-era assumptions.

**Stream B — Database/security review**
- classify Supabase security advisor findings;
- review duplicate/unused indexes using grants, function behavior, and query evidence;
- remediate only evidence-backed defects.

**Stream C — Runtime master contracts**
Define state transitions, version lifecycle, tool execution contracts, provider fallback eligibility, approval expiry/revalidation, budgets, concurrency, retention/legal hold, emergency controls, recovery semantics, telemetry, and canary rollout.

**Stream D — Capability parity baseline**
For each relevant ADR-008 domain, assign capability status and implementation disposition. No silent gaps.

## Phase 1 — Governance and control-plane quick wins

**A — Approval/delegation administration**
- project/domain approval coverage;
- Business/Governance axis visibility;
- separation-of-duties health;
- delegation creation/revocation by delegator or Data Governance Admin;
- delegate view-only behavior.

**B — External notifications and delivery**
- signed approval links;
- clear Open in DataNexus path;
- DataNexus authoritative decision boundary;
- dedupe, retry, dead-letter visibility, provider health, operator retry.

**C — ACL and typed tool contracts**
- ACL administration with DENY precedence;
- effective access explanation;
- typed input/output schemas;
- fail-closed validation and structured errors.

**D — Evidence lifecycle**
- artifact retention configurable within 5–7 years;
- legal hold for Governance Admins;
- agent-message retention aligned with execution/audit lifecycle;
- governed immutable evidence metadata.

## Phase 2 — Runtime governance and observability

**A — SLA and approval/runtime integration**
- 7/5/3/1 business-day SLA automation;
- default approval validity 7 days;
- authority/risk/resource revalidation immediately before execution;
- material fingerprint change invalidates prior approval.

**B — Cost/token accounting and tracing**
Capture provider/model identity, tokens, model/tool calls, latency, duration, retries, and cost. Authorized project users see authorized-run usage; admins receive aggregate reporting.

**C — Job Monitor drilldown**
Expose governed step, tool, approval, artifact, retry, cost, failure, recovery, version, and provider lineage without broadening authorization.

**D — Concurrency and budgets**
Configurable optimized defaults for project/agent/tool concurrency, runtime duration, tokens, cost, steps, tool calls, and delegation depth. Admins can raise/lower limits without code changes.

## Phase 3 — Runtime core

### Durable execution state machine

Use explicit guarded transitions with idempotency, leases, bounded retries, timeouts, pause/resume, cancellation, checkpoints, duplicate-side-effect prevention, terminal-state guarantees, and append-only transition evidence.

Representative lifecycle:

`CREATED → QUEUED → WAITING_APPROVAL → READY → RUNNING → PAUSED/WAITING → SUCCEEDED | FAILED | CANCELLED`

### Agent version lifecycle

`DRAFT → VALIDATED → APPROVED → ACTIVE → RETIRED`

- explicit promotion to Active;
- no automatic newest-version activation;
- previous versions retained for rollback/audit;
- historical runs permanently reference exact version;
- one canonical Active version per governed scope.

### Provider resilience

Automatic fallback only to pre-approved provider/model targets satisfying equivalent or stronger residency, security, governance, evaluation, and production-eligibility requirements.

### Governed tools

Each tool has independent enablement, environment restrictions, capability/risk policy, project/domain constraints, schema guardrails, budgets/limits, idempotency expectations, and evidence requirements. Tool authorization and guardrails execute before side effects.

## Phase 4 — Multi-agent orchestration and recovery

### Multi-agent delegation

Explicit allow-list only. Every handoff records source, destination, purpose, filtered context, correlation, authority provenance, depth, and remaining budget. Handoff authorization occurs before any side effect.

### Failure/recovery

Deterministic handling for worker crash, provider outage/timeout, tool timeout, DB transient failure, duplicate/delayed jobs, stale/expired approval, fingerprint mismatch, retry exhaustion, poison jobs, and partial execution.

### Emergency controls

Global/project/agent/tool kill switches plus time-limited break-glass access requiring reason, MFA where supported, enhanced audit, and post-event review.

### Promotion/canary controls

Model/provider/runtime changes require explicit production approval and canary rollout with measurable rollback conditions.

## Phase 5 — Continuous evaluation evidence

Trajectory/evaluation evidence is produced continuously, not deferred to the end. Capture plan quality, tool selection, handoff quality, recovery outcome, approval correctness, grounding, latency, cost, retries, and policy violations. Use evidence for regression, version/model/provider promotion, canary expansion, and rollback.

## Phase 6 — Independent certification

Run four independent streams:

1. **Performance/load:** concurrent users/runs, queue saturation, DB/provider/tool latency, Job Monitor load, budget enforcement.
2. **Chaos/failure:** worker termination, provider/network/webhook/DB failures, duplicates, queue delay, partial execution.
3. **End-to-end:** conversation → approval → execution → tools → handoff → artifacts/notifications → recovery → completion/audit.
4. **Security/adversarial:** cross-project access, ACL bypass, replay, forged links, dual-axis abuse, disabled tools, residency/provider bypass, delegation/budget/kill-switch/break-glass bypass.

## Phase 7 — Capability-parity certification

Repeat ADR-008 comparison with evidence across durable execution, recovery, tools, planning, handoffs, memory/retrieval where applicable, evaluation, observability, security, interoperability, latency, throughput, cost, and maintainability.

Every relevant capability must receive:

- status: `ADVANTAGE`, `PARITY`, `PARTIAL`, `GAP_REQUIRED`, `GAP_DEFERRED`, or `NOT_APPLICABLE`;
- disposition: `KEEP`, `BUILD_NOW`, `BUILD_LATER`, `BORROW_PATTERN`, `EXTENSION_POINT`, `BENCHMARK_LATER`, `REJECT`, or `NOT_APPLICABLE`;
- evidence and rationale.

## Phase 8 — Controlled production rollout

Release sequence:

`preview → validated test → canary → monitored production → full production`

Release gates include exact-head CI, security/adversarial checks, clean migration reconstruction, RLS/ACL validation, SLO validation, provider fallback checks, kill-switch checks, audit integrity, rollback readiness, and approval-path validation.

Canary rollback signals include elevated failure rate, SLO breach, retry anomaly, cost anomaly, provider mismatch, authorization anomaly, or audit-integrity failure.

## Frozen operational defaults

- RTO: 4 hours
- RPO: 15 minutes
- approval validity: configurable, default 7 days
- material fingerprint change: immediate approval invalidation
- artifact retention: configurable 5–7 years
- messages: execution/audit lifecycle
- legal hold: Governance Admin
- provider fallback: approved equivalent-or-stronger only
- agent version activation: explicit promotion
- tool governance: independent of parent-agent enablement
- multi-agent delegation: allow-list + configurable depth/budget
- CRITICAL production mutation: mandatory human approval
- kill switch: global/project/agent/tool
- canary rollout: required for material runtime/model/provider changes

## Anti-loop implementation rule

If the same failure occurs twice without new evidence, stop repeating the same method. Diagnose the failure class, choose a materially different approach, or isolate the blocker and move to an independent workstream. Never weaken governance, tests, or SLO thresholds merely to make progress.

## Completion definition

A capability is complete only when code, unit tests, negative/failure cases, adversarial checks, integration evidence, exact-head CI, preview validation, production validation where applicable, capability-parity review, and durable documentation are all complete.
