# DataNexus self-improvement implementation status

Updated 2026-09-29. This document records the implementation boundary for governed self-improvement. It is an evidence contract, not a claim that the agents have already improved.

## Current implementation

DataNexus now has the building blocks for a closed learning loop:

1. Verified governed outcomes remain the source of outcome truth.
2. PGCL records immutable production eligibility for the source agent run.
3. Held-out learning benchmarks require temporal ordering and independently persisted baseline and candidate evaluation rows for every case.
4. A proposed candidate follows the existing review, approval, canary, activation, and rollback lifecycle.
5. Verified production outcomes are collected by source agent, agent version, and explicit run mode.
6. The prospective collector includes effective, ineffective, partial, failed, rejected, policy-blocked, rolled-back, unknown, and unclassified results in the denominator. A technically successful run is not automatically treated as effective.

## Runtime binding

The PGCL runtime calls `record_pgcl_run_learning_provenance` before persisting a candidate derived from a verified agent run. The prospective-outcome migration adds two idempotent database collection paths:

- an outcome-insert trigger, which records an outcome when production provenance already exists;
- a provenance-insert trigger, which backfills verified outcomes when provenance is recorded after the outcome.

This ordering is intentional because governed outcome recording and PGCL provenance can occur in either order. The collector skips unverified outcomes, runs without production eligibility, and source runs that cannot be resolved in the same project. It records an unrecognized or missing run mode as `UNCLASSIFIED` instead of guessing.

## Required evidence dimensions

The evaluation and prospective result surfaces must be reported separately for each applicable combination:

| Dimension | Required treatment |
| --- | --- |
| Agent | Canonical agent key from the immutable agent definition |
| Version | Agent definition version at source-run time |
| Run mode | Explicit `learningRunMode` or `run_mode`; conflicting or missing values become `UNCLASSIFIED` |
| Outcome | Verified governed outcome type, including negative and inconclusive outcomes |
| Effectiveness | Nullable verified score from 0 to 1; null is not converted to success |
| Provenance | Production-eligible, non-synthetic source run only |
| Time | Verified timestamp and immutable recorded timestamp |

Missing agents and modes are reported as missing evidence. They are not filled with zeroes and must not be described as regressions or improvements.

## Completion gates

The self-improvement task is complete only when all of the following are true:

- the database migrations are deployed to the isolated test database and schema health reports the required tables and functions;
- a held-out dataset snapshot and split manifest are registered independently of candidate evidence;
- every paired benchmark case has two evaluation rows, with no training overlap or source-evidence reuse;
- each applicable agent and run mode has prospective verified outcomes, including failed and inconclusive outcomes;
- an independently reviewed candidate improves the predeclared quality metric without a safety, policy, authority, cost, or latency regression;
- controlled release and rollback evidence are recorded;
- only then may DataNexus describe that agent and version as empirically self-improving.

Until those gates are met, the correct status is `IMPLEMENTED_INFRASTRUCTURE_NO_PROSPECTIVE_PROOF`.

## Verification

Run the focused contract check with:

```bash
npm run verify:governed-learning-prospective-outcomes
```

The test is intentionally structural. It verifies the persistence, ordering, immutability, negative-outcome accounting, and runtime binding contract. It does not manufacture production results and therefore cannot substitute for live governed outcomes.
