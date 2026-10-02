# Governed Self-Improvement Post-Implementation Assurance and Gap Closure

Date: 2026-10-02  
Scope: DataNexus governed self-improvement / prospective learning evaluation  
Status: IMPLEMENTATION ASSURANCE IN PROGRESS — production verification not claimed

## Executive result

The double-check identified one material implementation gap that was not fully represented by the earlier green component tests: DataNexus had immutable manifests, learning candidates, paired benchmark evidence, locked prospective evaluation policies, durable experiment budgets, evaluation persistence, release admission, canary controls and rollback, but no durable joined prospective experiment runner.

PR #1115 closes the orchestration portion of that gap with:
- durable experiment-run identity;
- one immutable claim per held-out case and BASELINE/CANDIDATE arm;
- deterministic attempt identity;
- idempotent reuse of completed attempts and case evaluations;
- fail-closed recovery for unresolved CLAIMED work instead of blind redispatch;
- complete locked HELD_OUT partition execution in v1, preventing post-lock sample selection;
- independent evaluator binding;
- distinct baseline/candidate evidence references;
- explicit SYNTHETIC_REHEARSAL versus LIVE_PROSPECTIVE evidence classes;
- isolated PostgreSQL state-machine verification.

The runner does not grant authority, choose a candidate, choose an evaluator, create provider pricing, spend money, promote a candidate or deploy itself.

## Post-implementation assurance sequence

A final implementation claim requires all evidence below on one immutable exact head.

| Track | Required evidence | Failure rule |
|---|---|---|
| Exact-head revalidation | Continuous Learning Governance, Post Implementation Assurance, Quality Gate, V6, P0-P5, Repository Governance, CodeQL, dependency/security, Release Governance, Delegation/DB reconstruction | Any stale, failed, cancelled, pending or mismatched-head required gate blocks closure |
| Independent adversarial audit | continuous-learning adversarial audit, AI Red Team, authority/isolation tests, prompt/tool misuse, stale evidence, manifest leakage, replay/resume attacks | Do not weaken assertions; repair implementation |
| Unit/contract tests | candidate, manifest, policy, paired benchmark, budget, runner, release admission, rollback, Command Center | 100% mandatory contract tests pass |
| State/concurrency/recovery | budget concurrency fixture, duplicate invocation, duplicate attempt, unresolved claim, idempotent completion, crash/restart behavior | Unknown side effects remain unresolved; never redispatch blindly |
| Negative/failure paths | wrong project/candidate/policy/version/case/arm/evaluator, subset selection, duplicate evidence, provider/accounting failure, cancellation, missing settlement, stale policy | Fail closed and preserve evidence |
| Clean reconstruction | migrations reconstruct current schema; released migrations immutable | Forward-only repair only |
| Evidence separation | synthetic rehearsal cannot become live outcome or production proof | Synthetic/live contamination blocks release |
| Production binding | exact source/build/deployment/database/runtime identity and live journeys | Required only for PRODUCTION_VERIFIED; CI cannot substitute |

## Executed runner-specific evidence

On PR #1115, Continuous Learning Governance has passed on the corrected exact head including:
- prospective experiment runner pure orchestration tests;
- complete existing governed-learning unit/contract suite;
- independent continuous-learning adversarial audit;
- immutable benchmark manifest PostgreSQL fixture;
- learning experiment budget concurrency fixture;
- prospective experiment runner PostgreSQL fixture.

The runner tests cover:
1. normal paired baseline/candidate execution;
2. idempotent resume without repeated calls;
3. unresolved durable CLAIMED attempt blocking redispatch;
4. executor failure persisted as terminal failure;
5. post-lock subset selection rejected;
6. baseline/candidate evidence identity collision rejected;
7. independent evaluator binding;
8. experiment completion requiring the full evaluation set.

## Gap register after double-check

### G1 — Exact executable runtime identity binding
Status: GAP_REQUIRED / BUILD_NEXT / RELEASE-BLOCKING FOR LIVE PILOT

The current learning candidate and evaluation policy bind `baseline_version` and `candidate_version` as immutable strings, but they do not bind each arm to an exact executable agent-definition/runtime-manifest identity.

The native DataNexus runtime can pin exact agent definition/tool/runtime state once an agent definition ID is supplied. However, the learning contract does not currently prove that a candidate version string maps to one exact executable definition.

Do not infer that candidate version strings equal `agent.agent_definitions.version`.

Before LIVE_PROSPECTIVE execution, add a governed immutable execution binding that proves, for both arms:
- exact agent definition identity;
- exact skill/prompt/tool/model/runtime configuration or immutable equivalent;
- project/candidate/policy binding;
- lifecycle state allowed for evaluation;
- rollback/restoration identity;
- runtime manifest/deployment compatibility.

A synthetic executor used only for SYNTHETIC_REHEARSAL does not close this live binding gap.

### G2 — Immutable source snapshot / replayable benchmark cases
Status: GAP_REQUIRED / ACTIVATION BLOCKER

The proposed Album dataset has catalog hashes but no verified replayable immutable source bytes/storage binding. A catalog hash alone does not prove evaluator replay.

Before a live manifest is sealed:
- establish authorized stable snapshot/replay source;
- verify content/schema bytes;
- privacy/classification and evaluator input permission;
- deterministic case construction and training/held-out split;
- source-case references and canonical manifest hash.

### G3 — Independent evaluator operational binding
Status: GAP_REQUIRED / BUSINESS-POLICY BOUNDARY

Evaluator/proposer identity inequality exists in the contract, but an actual independent reviewer, conflict review, rubric, calibration evidence and authorization are not yet selected.

### G4 — Provider/model/pricing and verified quote binding
Status: GAP_REQUIRED / COST BOUNDARY

Durable budget admission is implemented and deployed, but live reviewed pricing/model/quote evidence is absent. Current authorized external spend remains USD 0.

No paid provider call may start until explicit nonzero budget approval and canonical pricing/quote binding exist.

### G5 — Statistical analysis and confirmation plan
Status: GAP_REQUIRED / POLICY BOUNDARY

Minimum gain/score proposals exist, but the final sample-size calculation, paired uncertainty method, confirmation window and multiplicity handling are not locked.

### G6 — Promotion authority assignment
Status: GAP_REQUIRED / BUSINESS-POLICY BOUNDARY

The governed action exists and the repository reconstruction repair is in PR #1101, but no live Business/Governance authority row grants `PROMOTE_LEARNING_CANDIDATE`.

### G7 — Application production parity
Status: GAP_REQUIRED / PRODUCTION DEPLOYMENT BOUNDARY

Vercel production is behind the current learning implementation. Production deployment/certification must be exact-head and governed. Do not infer production behavior from main/CI.

### G8 — Platform final-production assurance
Status: GAP_REQUIRED / PRODUCTION VERIFICATION

The adopted DataNexus post-implementation contract still requires:
- protected-main Governance-OFF live baseline evidence;
- final exact-head production source/build/deployment/runtime provenance;
- required live authenticated, unauthorized/adversarial and degraded journeys;
- affected persona live acceptance;
- current recovery/rollback evidence.

These are production verification requirements, not reasons to weaken implementation tests.

## Negative and failure matrix

| Scenario | Required result |
|---|---|
| Wrong project/policy/candidate | Reject |
| Stale/ambiguous evaluation policy | Reject |
| Case outside sealed HELD_OUT partition | Reject |
| Post-lock subset sampling | Reject |
| Wrong arm version | Reject |
| Duplicate case/arm dispatch | Reuse exact terminal evidence or require reconciliation; never duplicate |
| Crash after claim | Existing CLAIMED returned; no blind redispatch |
| Failed/cancelled execution | Terminal failure; no paired score |
| Baseline/candidate same evidence ref | Reject |
| Wrong evaluator | Reject |
| Missing paired success evidence | Reject scoring |
| Incomplete case evaluation set | Reject run completion |
| Synthetic evidence submitted as live | Reject at evidence/claim boundary |
| Missing/unsafe cost accounting | Budget path blocks further provider work |
| Budget/deadline exceeded | Stop and retain evidence |
| Authority/safety violation | Release classification cannot become IMPROVED/eligible |
| Stale/revoked approval | Release blocked |
| Rollback evidence absent | Release blocked |
| Production source != certified source | PRODUCTION_VERIFIED blocked |

## Closure vocabulary

Use only:
- IMPLEMENTED — deterministic capability exists and implementation contracts pass.
- CERTIFIED — every required non-production evidence class is fresh PASS/allowed NOT_APPLICABLE on one exact final head.
- PRODUCTION_VERIFIED — CERTIFIED plus exact production source/build/deployment/database/runtime binding and required live journeys.
- EMPIRICALLY_SELF_IMPROVING — only after a separately authorized real prospective experiment demonstrates sustained improvement with no safety, authority, cost or latency regression.

Current self-improvement status must not be represented as EMPIRICALLY_SELF_IMPROVING.
