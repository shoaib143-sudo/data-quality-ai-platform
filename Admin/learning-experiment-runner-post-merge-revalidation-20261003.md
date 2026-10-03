# Learning experiment runner post-merge revalidation plan

Date: 2026-10-03  
Repository: [data-quality-ai-platform](https://github.com/shoaib143-sudo/data-quality-ai-platform)  
Implementation PR: [#1109](https://github.com/shoaib143-sudo/data-quality-ai-platform/pull/1109)  
Merge commit: `5db53275d683c0da10dafa13ce2e2fce3d44eec9`

## Scope and current result

This record updates the earlier post-implementation plan with evidence from the merge commit. It is a repository and workflow review. No production data was changed, no workflow was retried, no migration was applied, and no provider was called.

PR #1109 is merged. In post-merge workflow run [36960272989](https://github.com/shoaib143-sudo/data-quality-ai-platform/actions/runs/36960272989), the `verify` job passed and `live-production` failed. The failed job ran `Validate live production profiling estate` against the configured Supabase production project. Its assertion found four active dataset versions without a completed profile:

| Dataset version ID | Failed assertion |
| --- | --- |
| `95290660-8f89-46c2-82b9-9ddc41855c28` | `ACTIVE_SOURCE_WITHOUT_COMPLETED_PROFILE` |
| `4e72a0ab-934d-46b2-9d48-88a648d98c09` | `ACTIVE_SOURCE_WITHOUT_COMPLETED_PROFILE` |
| `fbcd0322-01a8-4e36-a555-4ade67190e8a` | `ACTIVE_SOURCE_WITHOUT_COMPLETED_PROFILE` |
| `abc5f2a7-898e-47f9-a8b2-5ab0c62870ed` | `ACTIVE_SOURCE_WITHOUT_COMPLETED_PROFILE` |

The same snapshot reported latest profile run `f2b7b85c-170b-4280-a0e9-8788709aa779` for version `fde96b74-4a18-4ecb-9769-74c52ccf3600` as `FAILED` with `ORPHANED_RUN_RECOVERED`. This was a warning, not one of the four failing assertions. The workflow also reported eight latest completed runs without findings; these are warnings, not this job's failure cause.

The failed job uploaded evidence artifact [profiling-production-validation-5db53275d683c0da10dafa13ce2e2fce3d44eec9](https://github.com/shoaib143-sudo/data-quality-ai-platform/actions/runs/36960272989/artifacts/11207414206), artifact ID `11207414206`, SHA-256 `de084ced2acf4dee8441f21aec485268262e0d352e13f0eee324de89af40be9e`. The artifact was recorded as available through 2026-12-31.

This is a live profiling estate validation failure, not evidence of a defect in the learning experiment runner tests. It also must not be dismissed as a flaky runner check. The check observed real production metadata and requires an authorized profile completion or correction of an incorrectly active source state before rerunning that validation. A blind workflow retry cannot resolve the recorded state. No such live change is included here.

## Post-merge verification status

| Gate | Observed result | Evidence and boundary |
| --- | --- | --- |
| PR integration | Merged | PR #1109, merge commit `5db53275d683c0da10dafa13ce2e2fce3d44eec9` |
| Post-merge code verification | PASS | `verify` job in run #36960272989, including runner unit/behavior checks, database fixture checks, and TypeScript step |
| Post-merge live profiling validation | FAIL | `live-production` job in run #36960272989; four active dataset versions lack completed profiles |
| Runner production deployment | NOT VERIFIED | Merge is not migration deployment or production application activation |
| Live learning experiment | NOT RUN | No live provider call, prospective result, or candidate promotion evidenced |
| Agent improvement | NOT ESTABLISHED | Synthetic tests prove code paths and rejection behavior only, not improved outcomes for any agent |

The earlier 119 runner scenarios, 24 agent/mode budget combinations, evaluation-policy checks, disposable PGlite migration fixture, and PostgreSQL concurrency fixture remain implementation/test evidence for their tested contracts. They are not production adapter evidence or prospective agent results.

## Testing schema constraint

The existing `testing` schema is a private synthetic fixture harness. Migration `20260923193808_create_private_testing_schema_and_fixture_harness.sql` creates `testing.fixture_runs` and `testing.fixture_assertions`; those tables store synthetic scenario and assertion records. The schema is not a clone of the `agent` and `governance` control plane.

Runner migration `20261001152250_learning_experiment_runner_evidence.sql` explicitly creates objects in `agent`, references existing `agent.learning_evaluation_policies`, `agent.learning_candidates`, `agent.learning_benchmark_dataset_cases`, `agent.learning_experiment_budget_reservations`, `agent.learning_experiment_budget_settlements`, and `governance.ai_model_cost_events`, and invokes an existing `agent` immutability function. It cannot be isolated by simply applying the unchanged migration into `testing`. The budget tables are already documented as canonical `agent` objects, while `testing` remains the synthetic-data boundary.

Therefore, the prior instruction to “apply the migration to the approved testing schema” is not executable as written and must be corrected. A disposable PostgreSQL/PGlite database with the required dependency schemas is suitable to test the exact migration. The Supabase `testing` schema can host fixture metadata, but passing its fixture tests does not prove the runner migration was deployed or that the canonical `agent` integration works. Any future migration to the shared Supabase `agent` schema needs its own explicit change scope, migration review, backup/rollback plan, and authorization. No migration is performed by this workstream.

## Required next actions

1. Resolve the four production profiling gaps through the normal authorized profiling workflow, or document and correct the source activation metadata if it is wrong. Preserve evidence for each version and avoid editing state merely to satisfy the check.
2. Re-run the production validation only after the underlying state has changed and the action is authorized. Confirm the failed assertions are gone and investigate the orphaned-run warning separately; do not retry solely to change the workflow result.
3. Correct the migration test plan: exact migration behavior belongs in a disposable database with its `agent` and `governance` dependencies. Keep the Supabase `testing` schema for synthetic fixture evidence and clearly label its scope.
4. Build and verify the still-missing production adapters: canonical stored plan/artifact bytes and hashes, current project/agent/mode authority, replayable held-out inputs, real provider/model pricing and hard spend bound, independent evaluator identity/calibration, complete attempt/evidence loader, and confirmation evidence.
5. Bind each of the eight agents and each supported mode to independently authored cases. Collect prospective paired baseline/candidate results only after the above gates are met. Keep promotion disabled.
6. Re-run unit, integration, SQL security, concurrency, negative and failure-path tests on the integration commit. Keep synthetic fixtures and live evidence separate.
7. Obtain the required independent evidence review and only then consider a separate activation decision. Production migration, provider spend, candidate promotion, source remediation, and release remain outside this plan's authorization.

## Revalidation, unit, negative, and failure-case checklist

### Revalidation

- Confirm the exact tested commit and workflow run before interpreting results.
- Verify the production profiling validation against the current estate after authorized remediation, including active source to completed profile linkage, run status, metrics, score, and findings contract.
- Test the exact runner migration in a disposable PostgreSQL environment containing its required dependency objects. Inspect RLS, grants, RPC signatures/search paths, immutable triggers, constraints, and foreign-key behavior.
- Verify the Supabase `testing` schema remains private and synthetic-only. Assert browser roles cannot access fixture records and that fixture PASS rows are never accepted as prospective results.
- Run the full application checks and inspect all required CI contexts on the exact integration head.

### Unit and integration tests

- Immutable project, policy row UUID, candidate, agent, skill, mode, run, manifest, version, case, arm, artifact, and execution-manifest bindings.
- Byte retrieval and SHA-256 agreement for executable baseline/candidate artifacts and held-out inputs.
- Current authority resolution, independent evaluator authorization, budget/quote validation, canonical reservation and settlement loading, and scoring from persisted attempt evidence.
- Paired baseline/candidate execution on identical held-out inputs and deterministic aggregate recomputation from the complete denominator.
- SQL uniqueness, RLS/grants, immutable rows, transaction rollback, locking, and two or more concurrent claimers for the same case/arm.

### Negative and failure cases

- Reject missing, stale, ambiguous, cross-project, tampered, or unavailable plan, authority, dataset, artifact, quote, evaluator, score, attempt, settlement, and cost evidence before dispatch or promotion.
- Reject training data, held-out mismatch, duplicate input hashes, altered bytes under an existing label, missing pair arms, duplicate results, omitted attempts, mismatched evaluator, and caller-supplied confirmation booleans.
- Fail closed on provider timeout before dispatch, timeout after provider acceptance, crash before evidence persistence, duplicate resume, cancellation at each phase, conflicting terminal write, and ambiguous cost reconciliation. Never silently repeat a potentially billable call.
- Reject absent/stale pricing, wrong currency, missing/partial/duplicate reservation or settlement, token/cost mismatch, wrong invocation/run/project, and cap-boundary or over-cap spend.
- Verify synthetic fixture output cannot enter the live prospective ledger or candidate admission path.
- Verify every failure leaves promotion disabled and produces auditable failure evidence without claiming agent improvement.

## Exit criteria

The module remains a merged, tested foundation, not a production self-improvement capability. Completion of the next phase requires resolved post-merge profiling validation, a corrected and successfully exercised migration test strategy, implemented production adapters, per-agent/per-mode prospective evidence, and a separate independent review. Production activation remains disabled until a distinct authorization gate is satisfied.
