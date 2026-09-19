# Agent Policy v2 + Runtime v2 — Implementation and Assurance Checkpoint

**Date:** 2026-09-19  
**Objective:** Complete DataNexus Agent Policy v2 + Agent Runtime & Execution Orchestration v2 as one production-ready, fully governed execution platform.

## Why this checkpoint exists

The September 19 implementation stream moved the platform beyond planning into concrete Runtime v2 governance, recovery, lifecycle, notification, tool-validation and monitoring changes. This discussion record captures the durable decisions and implementation direction so later agents do not restart architecture design or rely on stale placeholder-era assumptions.

## Decisions preserved

### Deterministic authority

Models may propose actions, but deterministic server-side policy decides execution. UI controls, model intent, approval state, agent identity, or run status never independently grant authority.

Resource DENY overrides ALLOW. Approval does not substitute for execution capability. Authorization must be re-evaluated at the relevant mutation/admission boundary.

### Job Monitor

Job Monitor remains observational by default. Polling/refresh must never kick a worker or mutate execution.

Explicit run actions may be offered only when server-derived effective action state permits them. Execute/resume, retry, cancel, approve and run-scoped admin are independently governed.

Run drilldown is being deepened around durable evidence, not hidden client assumptions. Governed evidence includes tool invocations, checkpoints, interrupts and supervisor trajectory, subject to resource visibility and `execution.view_evidence`.

### Tool contracts

Tool governance is independent of parent-agent enablement.

A discovered validation gap was addressed by requiring raw caller input to fail closed before normalization when:

- a closed schema receives undeclared fields; or
- conflicting snake_case/camelCase aliases are supplied.

Normalization must not silently erase suspicious caller input before the contract sees it.

### Resource authorization

Direct navigation is an authorization boundary. Agent-run details/evaluation must not rely solely on project membership when a dataset/resource ACL exists. Dataset DENY semantics remain authoritative and protected evidence must not be disclosed through direct URLs.

### Approval notification health

DataNexus remains the authoritative decision system. Email and Teams remain governed channels.

Operational delivery health can expose bounded state, retry and dead-letter information, but not recipient addresses, raw provider response bodies, or sensitive delivery errors.

### Agent version lifecycle

The runtime now follows an explicit version lifecycle:

`DRAFT → VALIDATED → CANDIDATE → ACTIVE → DEPRECATED → RETIRED`

Promotion is explicit. A new version does not automatically become production default. Exactly one ACTIVE version per agent key is allowed. Promotion preserves immutable evidence and governed rollback. Executable states fail closed for non-ACTIVE/missing lifecycle state.

### Recovery

Closed-loop recovery is part of Runtime v2. Retry and compensation remain bounded, evidence backed, idempotency aware and fenced. Recovery cannot be used to bypass authorization, approval, tool contracts or provider policy.

### Secret hygiene

Secret hygiene is enforceable and part of certification. Actual secret rotation remains a separate operational action and is not silently performed.

### Database advisor/index policy

Advisor output is evidence, not an automatic migration queue. Current review work preserves the rule that unindexed FKs and zero-scan indexes require representative workload evidence before changes. Exact duplicate comparison precedes duplicate-index cleanup.

### Break-glass policy hold

Agent Policy v2 says no break-glass production execution. A later Runtime v2 checkpoint mentions time-limited break-glass behavior. No production break-glass execution path is authorized until the product owner explicitly reconciles that conflict. Implementation must fail closed meanwhile.

## Implementation checkpoint

Important work in this stream includes:

- deterministic governed Job Monitor action handling;
- enforceable secret-hygiene checks;
- closed-loop recovery convergence;
- approval notification delivery-health UX;
- fail-closed raw tool-input validation;
- direct Agent Run resource-ACL hardening;
- explicit governed agent-version lifecycle;
- deeper governed runtime-evidence drilldown;
- refreshed Supabase advisor/index evidence work.

Repository state is moving through parallel PRs. Future work must fetch current `main` and current PR state rather than treating the SHA in any discussion document as permanent truth.

## Remaining program

The active program remains the 29-item Runtime v2 scope recorded in `PROJECT_STATE_v2.md` and `Architecture/2026-09-19-agent-runtime-v2-master-implementation-plan.md`.

High-value remaining convergence areas include:

- approval/delegation/ACL administration depth;
- SLA automation and operational evidence;
- artifact/message governance;
- cost/token attribution and budget enforcement;
- configurable concurrency/admission controls;
- provider resilience;
- governed multi-agent handoffs;
- runtime observability convergence;
- performance/load and chaos certification;
- end-to-end persona acceptance;
- independent adversarial certification;
- exact-final-HEAD production revalidation.

## Post-implementation assurance decision

No requirement is DONE because code exists or a PR merged.

Final certification must include:

1. requirement-to-code-to-test reconciliation;
2. unit testing;
3. integration testing;
4. negative, boundary and failure cases;
5. clean database reconstruction/migration validation;
6. independent adversarial audit designed to disprove compliance;
7. performance/load testing;
8. chaos/fault injection;
9. security/secret-hygiene review;
10. exact-final-HEAD protected CI;
11. controlled preview/canary;
12. production revalidation;
13. rollback/recovery exercise;
14. final durable-documentation reconciliation.

The adversarial suite must attempt authorization bypass, false approval/execution states, resource ACL bypass, lifecycle bypass, malformed tool execution, budget/concurrency bypass, unsafe fallback, recovery abuse and evidence leakage.

## Continuation rule

Future implementation agents should continue from current architecture and runtime evidence. Do not rebuild Agent Policy v2 or Runtime v2 from scratch. Re-fetch `main`, inspect active PRs, choose the highest-priority executable gaps, implement, test, merge through protected CI, and repeat until certification gates are satisfied.
