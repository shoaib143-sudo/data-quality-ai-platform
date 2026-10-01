# First learning pilot: independent readiness review

Date: 2026-10-01. Reviewed checkout: `bc7f684c0b1a4fa353336af5e4d9dc5951691bef`.

## Decision

The repository contains candidate, paired evaluation, policy, release and budget services. It does not yet contain a production caller that joins these services into a prospective baseline/candidate experiment. Configuring a quote and locking a policy alone is insufficient. This review is $0 preparation; it neither runs model calls nor grants release authority.

An existing dataset can supply pilot inputs, but dataset existence is not a held-out benchmark, reference answer set, or calibrated independent evaluator. Synthetic tests demonstrate control behavior, not an improvement in any of the eight agents.

## Source evidence

Repository searches outside `scripts` find definitions but no production callers of `registerLearningEvaluationPolicy`, `recordLearningEvaluationDecision`, `recordIndependentPairedEvaluations`, or `recordGovernedLearningCandidateBenchmark`. No production callsite supplies `learningExperiment` or `learningExperimentQuote`. Ordinary callsites in `app/api/ai/copilot/chat/route.ts`, `lib/ai/investigation-model.ts`, and `lib/ai/profile-readiness-remediation-model.ts` use the governance router without experiment scope. These ordinary calls must not be relabeled retrospectively as prospective experiment evidence.

`lib/ai/learning-experiment-budget.ts` guards a single model invocation and `lib/ai/observable-intelligent-router.ts` conditionally invokes it. The scope contains project, policy, candidate, run, agent and mode, but no case or baseline/candidate arm. A prospective runner needs a separate canonical binding between invocation, case, arm, version, output and evaluator result.

`lib/agents/governed-learning-evaluation-ledger.ts` accepts caller-provided scores and evidence references. Its metadata sets `synthetic: 'false'`; it must never receive synthetic preparation rows. It does not itself execute either arm or verify actor membership/independence.

`lib/agents/governed-learning-evaluation-service.ts` and SQL `agent.record_learning_evaluation_result` validate aggregate claims against a locked policy. The aggregate RPC does not join result claims to case-level rows, run reservations, settlements or canonical cost events. `independentlyVerified`, `evidenceComplete`, confidence lower bound and accounting totals remain trusted service-caller inputs. This is a required integration gap before genuine positive pilot admission, not evidence of an exposed browser-write vulnerability: the RPC is service-role-only.

Candidate drafts in `lib/agents/governed-learning-candidates.ts` contain proposed text and version labels. A concrete executable candidate artifact or configuration must be resolved and integrity-bound; differing labels alone do not prove different behavior.

## Required native runner sequence

| Step | Existing dependencies | Required implementation and evidence |
|---|---|---|
| 1. Resolve inputs | Candidate service, dataset manifest SQL, policy validator | Trusted server loader resolves actual candidate artifact, immutable baseline/candidate versions, dataset content/schema hashes and held-out cases. Verify manifest split excludes candidate training evidence. No caller-supplied artifact authority. |
| 2. Resolve authority | Existing project authorization, governed agent/skill registry, approval records | Resolve authenticated proposer and independent evaluator with current project capabilities. Distinct text IDs are necessary but do not prove reviewer authority or independence. Keep source remediation prohibited. |
| 3. Prepare and lock | `registerLearningEvaluationPolicy` | Lock rubric/calibration, primary metric, sample size, analysis plan, confirmation protocol, rollback reference and bounded budget before dispatch. $0 preparation may produce a draft manifest; do not lock a usable paid policy or claim verified results. |
| 4. Schedule paired execution | Governance router and experiment budget adapter | Add server-owned runner with durable case/arm/run keys, immutable artifact references, attempt state and completion checkpoints. Supply trusted quote dependency and `learningExperiment` plus matching execution correlation. Same held-out input for both arms. Apply existing agent/mode authority, project rate/concurrency and tool controls. |
| 5. Preserve raw evidence | Canonical job/artifact/telemetry stores, accounting service | Persist input/output artifact hashes and case/arm/version/run/invocation/policy bindings. Cancellation, partial completion and unknown billing remain explicit. Re-entry must not silently dispatch a second billable call; crash ambiguity requires stopped/manual reconciliation rather than invented success. |
| 6. Independently score | `recordIndependentPairedEvaluations`, paired benchmark validator | Calibrated deterministic or authorized independent evaluator computes scores from persisted outputs and references. Verify all references and scope before writing case rows. Synthetic rows must use a segregated contract and cannot use the ledger's hardcoded non-synthetic metadata. |
| 7. Compute decision | `recordGovernedLearningCandidateBenchmark`, `recordLearningEvaluationDecision` | Trusted collector derives sample count, paired scores, pre-registered confidence bound, confirmation evidence and accounting from canonical rows. Bind immutable aggregate evidence to exact case, policy and settlement records; reject missing/duplicate/wrong-arm/stale evidence. Do not trust arbitrary booleans or totals supplied by a route request. |
| 8. Review and controlled release | Release approval/admission and controlled release services | Existing positive admission remains review-gated, followed by bounded canary verification and rollback. No self-promotion, tool expansion or ADR-007 reclassification. All eight agents and three modes need their own verified coverage rather than inferring live coverage from 24 synthetic contracts. |

## Frontier challenge and disposition

| Capability | Status | Disposition | Finding |
|---|---|---|---|
| Immutable policy and release authority | PARITY | KEEP | Keep native project/approval boundaries and explicit no automatic promotion. |
| Pre-dispatch accounting and fail-closed quote | PARTIAL | KEEP | Single-call runtime is present; concrete verified quote adapter is an extension point and paid activation remains externally gated. |
| Dataset-to-target-to-evaluator execution | GAP_REQUIRED | BUILD_NOW | LangSmith documents target execution on datasets with evaluators. Native services do not yet have a joined production runner. Borrow the structure, retain native authority. |
| Paired cases and reproducible aggregate computation | PARTIAL | BUILD_NOW | Case contract exists; genuine output-to-score-to-decision chain and locked uncertainty computation are missing. |
| Durable pilot resume without duplicate calls | GAP_REQUIRED | BUILD_NOW | Native runner needs explicit durable attempt/completion keys. LangGraph documentation isolates API side effects into tasks to recover recorded outputs instead of repeating calls. This is a pattern comparison, not a runtime dependency recommendation. |
| External framework adoption and relative performance | GAP_DEFERRED | BENCHMARK_LATER | Evaluate replaceable harnesses later. No new production agent runtime is required to prepare the first pilot. |

Primary sources reviewed 2026-10-01:

- https://docs.langchain.com/langsmith/evaluation-types
- https://reference.langchain.com/python/langsmith/evaluation/_runner/evaluate
- https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/functional-api.mdx

These sources support the target/dataset/evaluator and durable side-effect patterns. The DataNexus gap assessment is an inference from the inspected source and callsites, not a claim that external frameworks supply DataNexus authorization or governance.

## Acceptance before the first real pilot

Require production runner tests covering wrong project/candidate/version/case/arm, missing actor authority, reviewer/proposer collision, duplicate resume, cancellation between dispatch and persistence, missing settlement, synthetic-to-live contamination, substituted evidence, shuffled held-out cases, and reproducible aggregate recomputation. Validate one complete baseline/candidate trajectory in a disposable $0 fixture without creating positive live evidence. Paid provider configuration, spending cap and live independent reviewer remain genuine activation gates.

The current honest status is: budget/runtime building blocks verified; end-to-end prospective experiment runner and evidence derivation still BUILD_NOW; real improvement unproven.
