# Governed learning prospective evidence runbook

Updated 2026-09-29 for PR #1078. Check the PR head and CI results before using this runbook.

This runbook defines the no-cost CI fixture plan and the one remaining evidence gate. It does not authorize a production migration, candidate activation, or deployment.

## No-cost CI fixture matrix

All rows below run from repository fixtures or static contract checks. They do not require paid infrastructure, production credentials, real customer data, model-training spend, or external provider calls.

| Fixture layer | CI command | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Prospective persistence | `node scripts/test-governed-learning-prospective-outcomes.mjs` | Immutable prospective outcome storage, delayed verification handling, production provenance filter, explicit mode normalization, and negative outcome accounting | That any real agent has improved |
| Isolated prospective SQL fixture | `bash scripts/run-learning-prospective-outcome-fixture.sh` within the Delegation Administration Policy CI database job | Real SQL triggers capture terminal runs and collect a delayed verified outcome in a disposable database, then roll back the fixture | That the simulated production-eligible row is a real business outcome |
| Terminal run denominator | `node scripts/test-agent-run-outcome-coverage.mjs` | One-row-per-run coverage for succeeded, completed, partial, failed, and cancelled terminal runs, including pending verification state | That a real production run produced a verified business result |
| Dataset manifest | `node scripts/test-learning-benchmark-dataset-manifest.mjs` | SHA-256 case identity, immutable TRAINING and HELD_OUT partitions, canonical manifest hash, and manifest binding requirement | That a held-out case is representative of production work |
| Paired evaluation ledger | `node --experimental-strip-types scripts/test-governed-learning-evaluation-ledger.mjs` | Baseline and candidate evaluations are independently persisted and attributable to the same project, candidate, evaluator, dataset, and case | That the evaluator is calibrated on real outcomes |
| Paired benchmark and adversarial checks | `node --experimental-strip-types scripts/test-governed-learning-paired-benchmark.mjs` and `node scripts/test-learning-self-improvement-adversarial.mjs` | Duplicate, leaked, mismatched, unsafe, synthetic, or unsupported aggregate claims fail closed | That a candidate is better than the baseline on unseen live work |
| Command Center observability | `node scripts/test-prospective-learning-command-center.mjs` | All eight agents and observed modes are represented without inventing missing evidence; the surface is actor-authorized and read-only | That the dashboard contains prospective results before real outcomes exist |
| Existing governance regression suite | `npm run verify:governed-learning-production-readiness` and the Continuous Learning Governance workflow | Existing candidate, approval, controlled release, PGCL, authority, and rollback contracts remain intact | That release approval or production activation has occurred |

The workflow also reconstructs the database in CI. This validates migration syntax and ordering in an ephemeral database. It is still a test environment and must not be reported as a live DataNexus result.

## Fixture execution order

1. Run the static contracts and TypeScript checks.
2. Reconstruct the database from the migration set in a disposable CI database.
3. Register a synthetic immutable manifest with at least one TRAINING and one HELD_OUT case.
4. Create paired baseline and candidate evaluation fixtures for each held-out case.
5. Exercise rejection cases: duplicate case, training overlap, missing paired side, mismatched aggregate, safety failure, synthetic metadata, missing source evidence, and conflicting run modes.
6. Insert synthetic terminal runs across `OFF`, `GUIDED`, `GOVERNED_AUTO`, `FULL_AUTONOMOUS`, `SUPERVISED`, and `HANDSFREE` where applicable. Include succeeded, partial, failed, cancelled, and pending verification states.
7. Confirm the prospective Command Center reports missing agents and modes as zero evidence or unmeasured, not as a score.
8. Confirm no fixture creates a positive learning case, changes policy, expands tool authority, activates a candidate, or writes to production.

## Precise remaining real outcome gate

The implementation gate is satisfied at the exact PR head when CI is green and database reconstruction succeeds. The remaining gate is empirical and cannot be manufactured by CI fixtures:

> For every applicable DataNexus agent and run mode, record a sufficient, independently reviewable sample of real, non-synthetic, production-eligible source runs whose governed outcomes are VERIFIED, including effective, ineffective, partial, failed, cancelled, rejected, policy-blocked, rolled-back, and unknown outcomes where they occur. Compare an approved candidate with the contemporaneous baseline on the predeclared quality metric, safety and authority violations, cost, latency, abstention, and recovery. Require a sustained quality gain with no prohibited regression before claiming self-improvement.

The exact sample size and minimum gain threshold must be declared by the Data Governance Admin before the live canary. Until that policy decision exists, the result is `INCONCLUSIVE`, not pass or fail. This is the only remaining gate that requires real governed runtime evidence. It cannot be met by synthetic fixtures, a green workflow, a successful migration, a stored positive case, or a technically successful run alone.

## Safe handoff after CI

After the no-cost matrix is green:

1. Keep PR #1078 unmerged while the exact head, migration set, and workflow results are reviewed.
2. Obtain the separate approval for a controlled deployment to the intended test or production target.
3. Before any live run, declare the project scope, agent versions, run modes, baseline, candidate, evaluator, sample policy, stop rules, rollback version, and evidence retention period.
4. Collect real outcomes through the governed runtime. Do not manually insert prospective rows or mark a technically successful run as effective.
5. Review the per-agent and per-mode summary. Missing evidence remains missing evidence.
6. Stop, roll back, or classify the result as inconclusive if the sample policy, safety threshold, authority boundary, cost budget, latency budget, or evidence completeness gate is not met.

No production activation is implied by this document.
