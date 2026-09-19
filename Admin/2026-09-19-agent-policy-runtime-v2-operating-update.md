# Admin — Agent Policy v2 and Runtime v2 Operating Update

**Date:** 2026-09-19  
**Scope:** DataNexus Agent Policy v2 + Agent Runtime & Execution Orchestration v2  
**Evidence baseline:** repository `main` at documentation branch creation: `afb1628987d50e0f61066e61932706381eaaa02b`

## Purpose

This record captures the administrator-facing operating state created by the September 19 Runtime v2 implementation stream. It is an operational summary, not a substitute for server-side authorization, database evidence, or exact-head certification.

## Governed administration model

Administrative UI availability never grants authority. Mutating operations remain server-authorized and resource-scoped. Resource DENY overrides ALLOW, approval never substitutes for execution capability, and Job Monitor polling remains observational.

Run-scoped operations are independently governed for execute/resume, retry, cancel, approve, and run administration. General platform administration must not be inferred from a Job Monitor control.

## Approval and notification administration

The approval control plane includes governed authority/delegation administration and notification delivery health.

Current behavior includes:

- Business and Governance approval axes remain independently authorized.
- The same person cannot satisfy both approval axes for a material production mutation.
- Delegation remains individual, scoped, time bounded where configured, and provenance preserving.
- DataNexus remains the authoritative approval decision surface.
- Email and Teams are notification/decision-entry channels only and are re-authorized server side.
- Delivery health may expose bounded DataNexus/Email/Teams state, retry and dead-letter status.
- Recipient addresses, raw provider response bodies, and sensitive provider errors must not be exposed in administrator-facing delivery status.

## Resource ACL administration

Resource administration must preserve explicit DENY precedence. Direct run-detail navigation and run-evaluation paths are expected to re-check resource authorization rather than relying on project membership or UI visibility.

Unauthorized direct access should fail closed without disclosing protected run/evidence existence.

## Agent version administration

Runtime v2 now uses an explicit governed lifecycle:

`DRAFT → VALIDATED → CANDIDATE → ACTIVE → DEPRECATED → RETIRED`

Administrative rules:

- a new version does not become production default automatically;
- exactly one ACTIVE version is allowed per agent key;
- promotion to ACTIVE atomically deprecates the previous ACTIVE version;
- DEPRECATED versions remain available for governed rollback until retired;
- lifecycle changes require a reason and append immutable transition evidence;
- non-ACTIVE or missing lifecycle state fails closed for executable QUEUED/RUNNING/WAITING states.

## Job Monitor and evidence

Run drilldown now includes governed runtime evidence subject to `execution.view_evidence` and resource visibility:

- governed tool invocation metadata;
- contract/input/output hashes;
- runtime checkpoints;
- approval/runtime interrupts;
- supervisor trajectory evidence.

Raw tool inputs/outputs and raw runtime manifests are not administrator-visible merely for convenience.

## Secret hygiene

Static secret-hygiene enforcement is part of the production security posture. Sensitive public environment variables, client-side secret access, and unsafe direct secret logging are prohibited.

Actual credential rotation remains a separate operational action and is not implied by documentation or hygiene validation.

## Database advisor/index administration

The latest Runtime v2 review is evidence driven:

- RLS-with-no-policy findings must be checked against direct role privileges before remediation;
- service/control-plane-only tables may intentionally have RLS without end-user policies when `anon`/`authenticated` have no direct DML authority;
- unindexed foreign keys are candidates for workload validation, not automatic index creation;
- zero-scan indexes are not automatic deletion candidates;
- exact duplicate-index comparison should precede any duplicate-index cleanup;
- destructive index changes require representative workload/query-plan evidence.

See `Architecture/2026-09-15-supabase-advisor-and-index-review.md` and `scripts/review-runtime-v2-database-advisors.sql`.

## Recovery and resilience administration

Closed-loop recovery is governed and bounded. Retry/compensation must preserve idempotency/replay certification, leases/fencing, attempt limits, tool contracts, approval requirements, and durable evidence. Recovery is not authority escalation.

Provider fallback is permitted only to pre-approved provider/model combinations satisfying equal-or-stronger production governance, security and residency requirements.

## Policy hold

Agent Policy v2 does not currently authorize a production break-glass execution path. Later Runtime v2 notes mentioning emergency/break-glass behavior do not override that baseline. Until an explicit product-policy decision reconciles the conflict, production execution remains fail closed.

## Administrator completion checklist

Before declaring Runtime v2 production complete, administrators must require evidence for:

1. exact-final-HEAD protected CI;
2. unit and integration testing;
3. negative/failure cases;
4. independent adversarial audit;
5. migration/clean reconstruction validation;
6. resource ACL and approval revalidation;
7. performance/load certification;
8. chaos/fault-injection certification;
9. provider/recovery validation;
10. controlled canary and production revalidation;
11. rollback/recovery exercise;
12. documentation reconciliation with deployed runtime truth.

A merged PR is not by itself production certification.
