# Governance Provider Platform Post-Implementation Assurance Plan

Date: 2026-10-02
Scope: PR #1095 and the provider-neutral governance control plane.

## Purpose

This plan is mandatory after implementation completion and before live provider mutation activation. It does not replace normal CI. It proves that the completed implementation still satisfies authorization, policy, approval, idempotency, durability, evidence, provider isolation, MCP, and reconciliation contracts when reviewed from a clean post-implementation baseline.

## Gate 0: exact-head freeze

1. Record PR head SHA and main SHA.
2. Synchronize the branch with current main.
3. Freeze implementation changes for the assurance run.
4. Run the assurance suite against that exact head only.
5. Any fix invalidates prior closure evidence and restarts affected gates.

## Gate 1: re-validation

Re-run:
- governance provider aggregate verification
- TypeScript no-emit compilation
- repository Quality Gate and Repository Governance
- Agent Policy v2 and approval hardening
- execution-controller and provider-resilience verification
- database migration contract tests
- MCP transport/security tests
- provider conformance tests
- desired-state/diff/planning/reconciliation tests
- durable checkpoint/evidence tests
- full relevant regression set

Required result: zero unexplained failures, zero skipped release-blocking tests, exact-head evidence recorded.

## Gate 2: unit and integration tests

Unit coverage must include canonical validation, stable fingerprints, explicit-delete semantics, capability resolution, dependency DAG, semantic-loss handling, retry classification, checkpoint state transitions, approval binding, drift modes, MCP schemas, and provider error normalization.

Integration coverage must include API to runtime, runtime to policy/approval, runtime to checkpoint/evidence persistence, provider discovery to canonical planning, approval-inbox resume, MCP to DataNexus authorization, and verification/reconciliation readback.

## Gate 3: negative and failure-path tests

Mandatory cases:
- unauthenticated, unauthorized, cross-project and wrong-principal access
- changed desired state or deployment fingerprint after approval
- expired, rejected, missing or wrong-action approval
- PDP DENY and REQUIRE_APPROVAL
- PAUSE and KILL
- unsupported/read-only provider capability
- malformed desired-state JSON
- explicit destructive operation without confirmation
- provider 401, 403, 404, 429, timeout, invalid JSON and 5xx
- duplicate request/idempotency replay
- simultaneous execution claim race
- process interruption after provider success but before verification
- pending asynchronous provider job and poll resume
- verification mismatch
- partial batch failure and dependency blocking
- drift introduced after a successful deployment
- MCP Host/Origin/header/body mismatch and invalid/expired bearer token
- evidence update/delete attempt

No failure case may silently downgrade into success.

## Gate 4: independent adversarial audit

Perform a clean-room review from the PR diff and runtime contracts without relying on implementation notes. Reviewers/audit jobs attempt to prove:
1. a mutation can bypass RBAC, execution control, PDP or approval;
2. an approval can be replayed against changed intent;
3. implicit absence can delete provider state;
4. duplicate/concurrent requests can execute a mutation twice;
5. provider credentials can escape into MCP/API/evidence/logs;
6. one project/tenant/provider connection can cross another;
7. stale or forged provider state can be accepted as verified;
8. evidence can be altered after recording;
9. unsupported provider behavior can be represented as supported;
10. an MCP client can bypass DataNexus runtime governance.

Every finding receives severity, reproduction, affected contract, fix SHA and re-test evidence.

## Gate 5: migration and persistence validation

Apply migrations to an isolated Supabase test schema/environment first. Verify:
- deployment_id schema alignment
- service-role-only access
- append-only evidence enforcement
- atomic checkpoint claim behavior
- unique idempotency boundary
- upgrade from pre-fix schema as well as clean install
- rollback/forward-repair procedure

Production migration application remains a controlled infrastructure action.

## Gate 6: provider conformance

For Informatica, first run read-only live conformance using approved credentials:
- authentication
- configured base URL/connection binding
- pagination and response normalization
- provider object projection identity
- documented API capability matrix
- rate-limit/error normalization
- readback verification

Mutation capabilities remain disabled until endpoint-specific live conformance passes.

## Gate 7: MCP interoperability

Exercise the endpoint with the official MCP 2026-07-28 SDK client:
- server/discover
- tools/list
- tools/call
- required modern metadata and headers
- stateless repeated requests
- authorization isolation
- approval-required response/resume
- long-running execution handle/status behavior

## Gate 8: E2E Golden Path

Run Source → Dataset → Profiling → Findings → Score → Governance → governed provider deployment → verification → reconciliation → evidence/Job Monitor. Include guided and governed/handsfree paths where applicable.

## Closure criteria

Closure requires:
- all mandatory gates green on one exact head;
- no open Critical or High findings;
- Medium findings explicitly accepted or fixed;
- no live mutation capability advertised without conformance evidence;
- migration evidence captured;
- CI and regression evidence linked;
- residual limitations documented;
- production/live activation boundaries explicitly separated from code completion.

