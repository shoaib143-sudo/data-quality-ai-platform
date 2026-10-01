# Learning pilot evaluation draft, 2026-10-01

Status: **UNLOCKED / NOT_EXECUTABLE / NO_LIVE_OUTCOMES**. Maximum authorized external spend: **USD 0**. The accompanying [draft JSON](../docs/testing/learning-pilot-draft-20261001.json) is a preparation document, deliberately not a valid `LearningEvaluationPolicy` or registration payload. Null fields mean unresolved evidence, not default values. No live rows, provider calls, pricing approvals, experiment locks or promotions are authorized by this draft.

## Proposed first scope

Propose `profiling_agent`, `profile_evidence_analysis`, `GUIDED`, using the previously identified Profiling Demo Project / Album as a selection candidate. Catalog identifiers are recorded in the draft: project `479813aa-72a4-4b12-b72a-74da8d2419ce`, dataset `ab520b1f-1f4c-4bdd-900a-c6be51957975`, version `f90abfb8-3e58-447f-9ff2-79ee1d70eb2d`. See [dataset readiness](learning-pilot-dataset-readiness-20261001.md) for stored-hash inventory. Those records do not prove actor authorization or source-byte replayability; hash bytes remain unverified. Policy IDs remain null because the pilot is not locked. Resolve content/schema byte verification and actor-authorized allowlist before use. No PUB Gold dependency exists. No source remediation is permitted.

The skill registry requires `project_id`, `dataset_version_id`, `objective` and outputs `observations`, `evidence_refs`, `confidence`, `limitations`. Its allowlisted tools are `profiling.source.read`, `profiling.schema.discover`, `profiling.metrics.execute`; `mayMutate` is false. Choosing GUIDED does not grant execution permission or prove the selected actor has the required capabilities.

## Exact contract bindings still required

`lib/agents/learning-evaluation-policy.ts` requires normalized nonempty `policyId`, `projectId`, `candidateId`, `agentKey`, `skillKey`, `datasetManifestId`, `baselineVersion`, `candidateVersion`, `rollbackRef`, `evaluatorActorId`, `proposerActorId`, `rubricRef`, `calibrationRef`, `manifestHash`, `lockedAt`, `primaryMetric`, `analysisPlanRef`. It also requires unique nonempty `datasetVersionIds`, a positive integer `sampleSize`, `minimumGain` in (0,1], `minimumScore` in [0,1] and finite nonnegative cost/token budgets with positive integer `latencyMs`. Baseline and candidate versions must differ; evaluator and proposer identities must differ. Identity inequality alone is not a conflict-of-interest review.

The policy registration SQL additionally requires a candidate and sealed manifest in the same project, matching agent/skill/version fields, a lock following both evidence cutoffs, and the registered manifest version within the dataset allowlist. Resolve the logical `policyId` separately from the UUID policy record ID used for reservations and result persistence.

Candidate registration must be supported by real persisted evaluation evidence, immutable baseline and candidate versions, evidence cutoff, proposal category/change and retained evidence references. Do not fabricate a candidate version, copy inventory definition versions as full runtime identity, or create a candidate merely to satisfy registration.

The manifest contract requires project ID, unique immutable dataset key/version, source snapshot reference, split seed, canonical SHA-256 manifest hash, evidence cutoff and nonempty TRAINING and HELD_OUT partitions. Each case has a unique 64-character hex `case_key`, `split`, and opaque `source_case_ref`. The registrar hashes sorted `case_key:split:source_case_ref` entries joined by `|`; an arbitrary dataset content hash is not that manifest hash. Cases must be independently resolved and deduplicated, with no candidate-training overlap or leakage.

Full runtime identity must bind resolved skill, prompt, model, runtime, tools, policy and immutable dataset snapshot. Rollback must point to an actual restorable approved version, with an authorized operator. Freeze rubric/calibration and independent verification evidence before candidate outcomes become visible. Retention, operator and release approval references are also unresolved.

## Proposed analysis, not locked configuration

Reuse the existing review proposals: primary metric is independently verified profiling-task pass rate; practical gain at least 0.05 absolute; candidate score at least 0.80. These are proposed thresholds, not empirical findings or approved policy values. An independent rubric should check recomputed metric correctness, evidence grounding, completeness, justified limitations and uncertainty. Track authority/safety separately; their permitted violation count is zero.

Select a fixed sample only after a baseline estimate, paired discordance, practical gain, power and correlation assumptions are independently reviewed. No statistically sufficient sample count is invented here. Album alone may not supply enough independent tasks. Repeated rows or repeated prompts do not create independent samples. Expand only through an authorized immutable allowlist if the selected scope cannot support the design.

For a paired design, baseline and candidate must share the same held-out case, have distinct canonical evidence references and independently blinded scoring. Predeclare the confidence-interval method, correlation handling, analysis point and confirmation window before results exist. A 95% confidence level is a review proposal. When true pairing cannot be established, use a separately justified contemporaneous design rather than calling the comparison paired. A second locked window is required before a sustained-improvement claim. Multiple agent/mode claims need a predeclared multiplicity strategy; this pilot does not generalize to all eight agents.

Include failed, cancelled, rejected, policy-blocked, partial and unknown outcomes in denominator reconciliation. Appropriate denial is distinct from successful task completion. Stop for unauthorized action, source remediation, leakage, altered identity/rubric, incomplete provenance/accounting, or exceeded bounds. Missing evidence is INCONCLUSIVE, not success.

## Implementation and execution sequence

1. Resolve selection and actor authorization read-only. Bind immutable snapshot and full runtime identity; verify schema/content hashes and replayability.
2. Identify a genuinely independent evaluator with current verification authority, distinct proposer, conflict review and calibration evidence. Drafting roles is not assigning approval authority.
3. Reconcile newly completed authorized baseline outcomes with terminal-run coverage. Historical runs and synthetic fixtures do not become prospective samples through backfill.
4. Form one narrow evidence-backed candidate. Freeze training evidence and held-out split, then seal the actual manifest through the governed registrar after independent review.
5. Complete the sample calculation, rubric, analysis/confirmation plans, safety rules, retention and rollback. Resolve each null in the JSON with canonical evidence.
6. Provide a concrete pilot runner or reviewed existing execution path that binds the locked policy to each baseline/candidate case, records canonical execution and outcome evidence, and supports reproducible replay without duplicating business side effects. The generic router budget wrapper and contract tests are not this end-to-end experiment runner. Runner availability, provider-free analysis feasibility and replayability remain unverified prerequisites.
7. Verify actual provider/model routing and quote implementation when provider execution is proposed. No paid execution is permitted under this USD 0 draft. The reservation implementation requires positive token/cost bounds for provider calls, so zero caps do not admit a free-looking provider run. A genuinely provider-free deterministic rehearsal must remain explicitly synthetic and outside live improvement evidence; it must not bypass the guarded provider path.
8. After concrete bindings and separately authorized nonzero spend if necessary, register a complete policy through `registerLearningEvaluationPolicy`; never upload this draft as a locked policy. Lock before candidate outcomes. Validate policy/manifest/candidate/deadline bindings through the native admission path.
9. Collect actual governed results, independent verification, complete cost/token/latency accounting and confirmation-window evidence. Persist via `recordLearningEvaluationDecision` with exact policy record binding, then classify each agent/mode separately.
10. Positive classification remains `REVIEW_REQUIRED` with `automaticPromotionAllowed=false`. Controlled release still requires current authorization and approval tied to the exact latest eligible evidence, with rollback preserved.

## Runnable work under the current USD 0 boundary

The existing `pnpm run verify:learning-experiment-budget`, `pnpm run verify:learning-evaluation-policy`, and `pnpm run verify:governed-learning-benchmarks` exercise synthetic runtime/admission, accounting, policy, pairing and manifest contracts. Disposable PostgreSQL CI covers concurrent reservations. These commands are runnable validation paths, not live experiment outcomes or evidence that agents improved. Their results must be recorded by the executing workstream; this draft does not claim a fresh run.

## Native capability challenge

| Capability | Status | Disposition | Evidence needed |
| --- | --- | --- | --- |
| Native policy and accounting admission | PARTIAL | KEEP | Actual scoped run and canonical accounting beyond fixtures |
| End-to-end locked pilot execution and replay | GAP_REQUIRED | BUILD_NOW | Reviewed runner, exact bindings and repeatable synthetic rehearsal |
| Independent scoring and calibration | GAP_REQUIRED | BUILD_NOW | Authorized reviewer, rubric, conflict review and calibration records |
| Statistical improvement and confirmation | GAP_REQUIRED | BENCHMARK_LATER | Locked prospective comparison and second window |
| Self-promotion or expanded authority | NOT_APPLICABLE | REJECT | Native approval and authority boundaries remain enforced |

This preparation does not alter ADR-007 agent classification. Future external evaluators/runners may be benchmarked through replaceable ports; they cannot own identity, project scope, tool authority, immutable evidence, approvals, release or rollback. Comparative literature and deeper runtime parity assessment belong in the independent review workstream, not an unsupported parity claim in this draft.
