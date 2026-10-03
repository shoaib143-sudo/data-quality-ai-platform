# Decision: Neural Job Monitor Post-Implementation Assurance

Date: 2026-10-03
Status: Accepted implementation assurance pattern

## Decision

Runtime-backed neural Job Monitor progress must remain an observability projection of authorized durable execution evidence. It must not create execution state, trigger workers, infer completion without persisted steps, or weaken authorization boundaries.

The assurance model combines:

- exact-main CI and release gates;
- Job Monitor domain consistency tests;
- runtime-backed neural progress contract tests;
- an independent adversarial neural-progress audit;
- post-merge execution of the monitoring workflow on `main`;
- exact-SHA production identity verification after governed deployment.

## Rationale

PR-level green checks alone did not guarantee that the monitoring-specific suite would execute again after merge because its workflow did not have a `push` trigger. That gap has been closed. A separate adversarial script was also added so authorization scoping, evidence precedence, refresh failure behavior, and synthetic-progress prohibitions are independently guarded rather than relying only on implementation-pattern tests.

## Non-negotiable invariants

1. Step evidence can only be loaded for runs already authorized for the current user.
2. Failed step evidence dominates running and waiting evidence.
3. Missing step evidence never creates an execution pulse or completion percentage.
4. Polling remains bounded and observational.
5. Monitoring cannot invoke job-worker execution.
6. Never-executed features remain explicit null-backed grey state.
7. Production acceptance requires exact deployed SHA verification.

## Follow-up

After governed Vercel promotion, validate the live Job Monitor with authenticated real execution evidence and record any UI/runtime discrepancy as a regression before closing the assurance cycle.
