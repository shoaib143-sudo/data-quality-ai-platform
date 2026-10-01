# Paired Learning Experiment Runner — Implementation Status

Date: 2026-10-02

## Scope

This module closes the zero-cost implementation gap identified by the first learning-pilot readiness review: DataNexus previously had candidate, manifest, policy, budget, case-level evaluation, aggregate evaluation, approval and controlled-release services, but no server-owned prospective runner joining them into one durable baseline/candidate experiment.

The new module remains non-production by default and does not authorize provider spend, candidate activation, promotion authority assignment, live dataset use, or production deployment.

## Implemented control chain

1. A locked evaluation policy and sealed HELD_OUT manifest are resolved by server-owned persistence.
2. The experiment run root and exact ordered case list are persisted before dispatch under a stable caller-supplied `runKey`. Reusing that key is allowed only when the immutable policy/candidate/evidence class/manifest/case sequence matches exactly.
3. Each baseline/candidate arm persists:
   - case identity;
   - arm and locked version;
   - immutable executable artifact reference and SHA-256 hash;
   - immutable input artifact reference and SHA-256 hash;
   - attempt key and attempt number;
   - unique execution correlation ID.
4. Re-entry with the same attempt key is idempotent only when the complete immutable identity matches. Completed terminal arm results are reused without provider redispatch; an existing attempt with no terminal evidence blocks redispatch until reconciled.
5. Canonical `source_case_ref` is read from the sealed HELD_OUT manifest binding and returned by the persistence boundary; caller-supplied source references are not trusted. The request factory must also attest the exact input artifact SHA-256 before any provider call.
6. PROSPECTIVE_LIVE successful arms require the existing governed experiment-budget reservation and ACCOUNTED settlement for the exact execution correlation.
7. SYNTHETIC runs reject paid runtime evidence and remain structurally segregated from live release evidence.
8. Successful baseline/candidate results for one held-out case are bound before an independent case score can be recorded. On restart, already-scored cases are reused without rerunning the evaluator.
9. Canonical summary evidence derives:
   - exact case/scored-case counts;
   - baseline/candidate aggregate score;
   - whether every case is independently verified;
   - safety/authority counts;
   - canonical cost/token/latency totals;
   - completeness and accounting status.
10. Finalization may use only PROSPECTIVE_LIVE complete evidence and a separately supplied analysis provider implementing the predeclared uncertainty/confirmation method.
11. The resulting aggregate evaluation decision is immutably bound back to the exact prospective run and analysis evidence reference.
12. Release review now rejects an otherwise positive legacy aggregate row unless exactly one valid PROSPECTIVE_LIVE experiment binding exists.

## New repository surfaces

- `supabase/migrations/20261002023000_learning_paired_experiment_runner.sql`
- `lib/agents/governed-learning-experiment-runner.ts`
- `lib/agents/governance-learning-experiment-evidence-store.ts`
- `lib/agents/governance-learning-experiment-arm-executor.ts`
- `lib/agents/governed-learning-experiment-finalizer.ts`
- `scripts/test-learning-paired-experiment-runner.mjs`

## Deliberately unresolved activation dependencies

The implementation does not fabricate or infer any of the following:

- executable baseline/candidate artifacts;
- provider/model selection;
- provider quote/pricing authority;
- live dataset replay bytes;
- reviewer independence;
- analysis/calibration evidence;
- approved USD/token/latency budgets;
- production release authorization.

The governed arm executor requires a server-owned request factory that verifies the executable artifact hash and a canonical output-artifact writer. The existing governed router and experiment-budget control remain the only paid provider path. Automatic provider fallback remains disabled for experiment calls.

## Failure-path semantics

- missing/invalid executable artifact identity → reject before run;
- same baseline/candidate executable hash → reject;
- unfinished prior attempt → block redispatch;
- provider/policy exception after attempt creation → persist terminal UNKNOWN/CANCELLED/POLICY_BLOCKED evidence and stop further dispatch;
- non-success arm → no scoring and no later calls in the runner;
- live success without ACCOUNTED reservation/settlement → reject persistence;
- synthetic run with budget reservation → reject;
- evaluator mismatch or proposer/evaluator collision → reject score;
- missing/incomplete accounting → finalization blocked;
- synthetic run → release-decision binding impossible;
- unbound positive aggregate decision → release review blocked;
- canonical summary mismatch → decision binding rejected.

## Post-implementation verification

Required exact-head gates:

- paired experiment runner unit/negative-path tests;
- existing learning experiment budget runtime + concurrent SQL fixture;
- prospective evaluation policy/release-admission tests;
- independent continuous-learning adversarial audit;
- full database reconstruction;
- Release Governance forward-only migration enforcement;
- CodeQL, dependency audit, Repository Governance, V6 and P0-P5.

## Decision boundary

The next phase after this implementation is not autonomous activation. A real pilot still requires explicit business/operational choices for candidate, immutable source snapshot, independent evaluator, analysis plan, approved provider/model pricing and nonzero spend limits, followed by a separately authorized controlled execution.
