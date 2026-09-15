# Deferred production certification debt

Date: 2026-09-15
Status: DEFERRED, fail-closed
Scope: Data Governance PowerHouse completion program

## Decision

The remaining production certification debt described below is intentionally deferred so it does not block independent product and governance work. Deferral is not acceptance, certification, or evidence that the affected production behavior is correct.

No readiness, RLS, authorization, provenance, learning, temporal, or evidence gate may be weakened because an item is deferred.

## Deferred critical item

The live synthetic governance integration path still requires final production database reconciliation for the schema-qualified pgcrypto digest calls used by the governed synthetic fixture.

The repository-side repair qualifies the calls through the extensions schema rather than widening a SECURITY DEFINER search path. Production must not be declared fully certified until the corresponding migration is present in the production migration ledger and the live governance.run_synthetic_governance_integration_suite() returns PASSED with its required checks true.

This synthetic fixture remains synthetic. Its successful execution must never make it eligible as real production learning or backtesting evidence.

## Deferred certification backlog

The following work may be completed later without blocking independent delivery:

1. authenticated production E2E and UI persona acceptance where credentials and authorized access are available;
2. final migration replay debt and production migration-ledger reconciliation;
3. observability certification, including runtime error and fatal inspection;
4. scale, concurrency, controlled failure, recovery, and rollback certification;
5. real-data backtesting readiness, which requires sufficient persisted, verified, explicitly non-synthetic positive and negative outcomes.

## Non-negotiable boundaries while deferred

* JDBC profiling readiness remains deterministic and fail-closed.
* Intentional non-exposed app_private SECURITY DEFINER RLS helpers must be protected by regression contracts, not by weakening RLS.
* agent.resolve_runtime_interrupt follows the same principle.
* Synthetic, demo, test, bootstrap, and fabricated evidence are excluded from production learning evidence.
* Project and current authorization remain mandatory.
* Temporal cutoffs and provenance remain mandatory.
* Predictive probabilities remain non-exposed until separately validated and calibrated.
* Shadow evaluation remains non-authoritative.
* No automatic retraining, model promotion, production mutation, decision execution, or recommendation authority is introduced by this deferral.
* Observational comparisons must not be represented as causal evidence.

## External blockers

Controls that cannot be changed with the available write-capable integrations, including leaked-password protection or unavailable GitHub Supabase CI secrets, are classified BLOCKED_EXTERNAL rather than bypassed.

Finance and Demo_Shoaib real-data insufficiency must be isolated as data blockers. No synthetic evidence may be substituted to manufacture readiness.

## Exit criteria

This deferral can be closed only with concrete evidence:

* the required production migration is recorded in the production ledger;
* the live synthetic governance suite passes;
* relevant production deployment is READY;
* runtime error and fatal inspection is clean for the validated deployment window;
* replay and rollback evidence is captured where applicable;
* real backtesting readiness is reported only when genuine persisted evidence satisfies the existing sample and class requirements.

Until then, status remains deferred and fail-closed.
