# Paired Learning Experiment Runner — Zero-Cost Validation Runbook

## Purpose

Validate the entire runner/control chain without model calls, provider charges, live positive learning evidence, or candidate activation.

## Required checks

1. Run `pnpm run verify:learning-paired-experiment-runner`.
2. Run `pnpm run verify:learning-experiment-budget`.
3. Run `pnpm run verify:learning-evaluation-policy`.
4. Run `pnpm run verify:governed-learning-benchmarks`.
5. Reconstruct the database from migrations on a disposable PostgreSQL instance.
6. Confirm the new runner migration is forward-only and historical released migrations are unchanged.
7. Confirm synthetic execution paths do not create budget reservations or release-decision bindings.
8. Confirm an incomplete/failed arm halts further dispatch and remains in the denominator.
9. Confirm a release-eligible result requires exactly one PROSPECTIVE_LIVE decision binding.

## Negative/failure matrix

| Scenario | Required result |
| --- | --- |
| duplicate case key | reject |
| training case supplied as run case | reject |
| baseline/candidate versions equal | reject |
| executable hashes equal | reject |
| attempt key reused with altered identity | reject |
| prior unfinished attempt | block redispatch |
| wrong arm version | reject |
| missing live budget reservation | reject successful live arm |
| UNKNOWN/EXCEEDED settlement | reject successful live arm |
| synthetic arm with paid reservation | reject |
| missing output artifact on success | reject |
| scorer receives failed arm | impossible |
| evaluator differs from locked evaluator | reject |
| scorer result not independently verified | aggregate cannot finalize |
| authority/safety violation | positive finalization blocked |
| aggregate sample differs from locked sample size | finalization blocked |
| synthetic run finalization | reject |
| unbound IMPROVED result | release admission blocked |
| canonical aggregate mismatch | decision binding rejected |

## Evidence standard

A green synthetic rehearsal demonstrates implementation/control correctness only. It does not establish:
- real candidate quality;
- reviewer independence;
- source replayability;
- provider readiness;
- approved spending;
- empirical self-improvement.

Those remain separate activation evidence.
