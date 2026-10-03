# Paired learning experiment runner core

Date: 2026-10-01

## Scope

This module closes the first native runner gap identified by the zero-spend pilot readiness review:

- durable server-owned case/arm/run identities before provider dispatch;
- deterministic execution binding to the locked policy, candidate, manifest, held-out case, agent definition and version;
- explicit PREPARED -> DISPATCHED transition committed before executor invocation;
- fail-closed resume behavior: a DISPATCHED attempt cannot be silently re-dispatched after process loss;
- append-only transition events;
- canonical budget reservation/settlement binding required before a non-synthetic attempt can become COMPLETED;
- synthetic fixture separation: synthetic attempts cannot bind live budget/cost evidence;
- isolated SQL and TypeScript orchestration tests.

## Deliberate non-capabilities

This PR does not:

- register or select a live candidate;
- create or lock a live evaluation policy;
- select a dataset or manifest;
- choose an evaluator or reviewer;
- configure provider/model pricing;
- call any provider;
- bind a production route to the runner;
- score outputs;
- compute confidence intervals or aggregate quality decisions;
- request approval, start a canary, activate a candidate or perform rollback;
- create production evidence from synthetic fixtures.

The production coordinator exposes a server-only executor port but no executable adapter is registered in this module.

## State machine

Each locked held-out case has exactly one durable attempt per arm:

PREPARED -> DISPATCHED -> COMPLETED
                      -> FAILED
                      -> CANCELLED
                      -> RECONCILIATION_REQUIRED

A retry while PREPARED may reuse the same identity and then commit dispatch.

A retry after DISPATCHED is blocked with AMBIGUOUS_PRIOR_DISPATCH_REQUIRES_RECONCILIATION. The system must reconcile provider/accounting evidence rather than issue another potentially billable attempt.

For non-synthetic attempts, COMPLETED requires:
- exact policy/candidate/run reservation binding;
- an ACCOUNTED budget settlement;
- the canonical cost-event ID bound by that settlement;
- non-empty output evidence.

Missing or conflicting accounting forces RECONCILIATION_REQUIRED.

## Evidence and tests

- `scripts/test-learning-paired-experiment-runner.mjs`
  - prepare/dispatch/complete orchestration;
  - ambiguous resume does not invoke executor;
  - post-dispatch executor failure attempts reconciliation state;
  - database failures fail closed;
  - application code always prepares non-synthetic attempts.

- `scripts/test-learning-paired-experiment-runner.sql`
  - idempotent prepare;
  - immutable context mismatch rejection;
  - ambiguous re-dispatch rejection;
  - synthetic completion without live accounting;
  - non-synthetic completion only with exact ACCOUNTED reservation/cost binding;
  - missing accounting becomes RECONCILIATION_REQUIRED;
  - attempt event mutation rejection.

## Remaining BUILD_NOW work

The next safe implementation slices are still:

1. trusted source/input loader with replayable immutable case evidence;
2. concrete runtime adapter that maps one case arm into the governed agent/model execution path and passes the durable run ID into the existing learning budget guard;
3. canonical output artifact persistence and verification;
4. independent evaluator adapter over persisted output evidence;
5. aggregate collector that derives sample counts, scores, safety counts, accounting totals and release decision inputs from joined canonical evidence rather than caller-supplied claims;
6. disposable end-to-end synthetic trajectory proving baseline + candidate + scoring + aggregate derivation without provider spend.

Live provider configuration, nonzero spending, real reviewer assignment, real candidate selection, production deployment and release remain separate decision boundaries.
