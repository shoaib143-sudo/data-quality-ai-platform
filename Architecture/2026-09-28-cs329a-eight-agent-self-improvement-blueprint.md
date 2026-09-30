# CS329A to DataNexus: eight-agent self-improvement blueprint

Status: implementation design and evidence inventory, 2026-09-28. This document specifies the information needed to implement and verify self-improvement. It does not certify live improvement.

## Source and confidence

- Primary course: [Stanford CS329A syllabus](https://cs329a.stanford.edu/), its [nine-video playlist](https://www.youtube.com/playlist?list=PLangBM27OtEA), and Stanford's public [homework 1](https://github.com/stanford-cs329a/cs329a-homework1-fall2025-public), [homework 2](https://github.com/stanford-cs329a/cs329a-homework2-fall2025-public), and [homework 3](https://github.com/stanford-cs329a/cs329a-homework3-fall2025-public).
- Lecture detail: the community-maintained [nine English caption transcripts](https://github.com/flowioo/stanford-cs329a-self-improving-ai-agents/tree/main/transcripts), commit `215083d7a5bbb97d57e028492e1a09e6cd132601`. Its manifest maps all nine files to the video IDs below. Captions contain transcription errors and some summaries mark their endings incomplete. Treat exact claims and numerical results as unverified unless checked against the original paper or video.
- DataNexus evidence: `AGENTS.md`, ADR-006, ADR-007, `governed-agent-registry.ts`, `agent-excellence-contracts.ts`, `governed-learning-context.ts`, PGCL services, candidate/benchmark/release services, and their migrations and tests at main commit `0c5390b88844f45348fdf9fc73f3bf0ba72d8a50`. PR #1078 adds temporal benchmark integrity.
- The course studies algorithms and research results. DataNexus-specific contracts, thresholds, and rollout order below are engineering proposals, not claims that Stanford prescribed them.

## What each lecture contributes

| Part and source | Core mechanism | DataNexus decision |
| --- | --- | --- |
| [1: Overview](https://www.youtube.com/watch?v=6YnLB0XbTnI) | Separate an agent's goal, actions, environment feedback, verifier, and stopping rule. Sampling plus verification can improve an answer without changing weights. | Define improvement as better verified outcomes on future comparable work, not merely more stored cases or fluent output. |
| [2: Test-time compute](https://www.youtube.com/watch?v=-Ggc37xLj_Y) | Repeated sampling, majority voting, outcome/process scoring, and allocation of sequential versus parallel search. More attempts cost more and help only with a useful verifier. | Allow a bounded number of alternative plans on uncertain, high-value tasks. Evaluate marginal quality per token, latency, and tool call. Keep deterministic tasks single-pass. |
| [3: Robust verification](https://www.youtube.com/watch?v=p7TdPUcPoik) | Outcome verifiers and step-level verifiers have coverage and false-positive tradeoffs; weak signals can be combined only after calibration. A plausible process can still lead to a wrong result. | Verify every material claim and action against canonical records, then verify the final business outcome. Record verifier version, evidence, abstentions, and disagreements. Never treat self-critique as ground truth. |
| [4: Tool/code feedback](https://www.youtube.com/watch?v=Lxh9RF5S-K0) | Interleave reasoning, authorized action, observation, and revision; execution feedback can identify errors. Tool loops can exhaust context or reinforce mistakes. | Persist typed tool observations and failure codes. Let agents revise bounded plans in the current run. Use current policy for every action; tool output is untrusted data. |
| [5: Planning](https://www.youtube.com/watch?v=Ml_fp9XkB8Y) | Decompose multi-step work, search alternatives, reflect on failed trajectories, and parallelize independent steps where safe. | Use validated dependency plans and explicit stop conditions. Parallel reads may be compared; governed writes remain idempotent and policy-checked. Store failed branches as evaluation evidence, not approved memory. |
| [6: Train-time scaling](https://www.youtube.com/watch?v=yVnmHSAy3ck) | Filter verified successful trajectories for training; STaR, group-relative RL, and reward design have distribution and stability failure modes. | Defer weight updates. A future offline training dataset must be de-identified, consented, versioned, split by time/project, independently evaluated, and explicitly released. Do not label PGCL as RL. |
| [7: Deep research](https://www.youtube.com/watch?v=Uni9dqyuuDM) | Generate diverse candidates, filter with tests/scorers, retrieve evidence iteratively, and synthesize cited results. | Use bounded multi-source retrieval for investigation, lineage, and policy questions. Evaluate recall, citation accuracy, freshness, source diversity, and unsupported claims before increasing search budget. |
| [8: Agentic evaluation](https://www.youtube.com/watch?v=8JAqLnTaZu4) | Long tasks fail through planning, wrong tools, loops, premature stopping, and unsupported synthesis; reliability at a target success rate matters more than isolated wins. | Test complete Golden Path and governance journeys at multiple lengths. Measure success at fixed budgets, failure taxonomy, recovery, and independent human-rated relevance. |
| [9: Future directions](https://www.youtube.com/watch?v=AyO6wyu4DEg) | Multi-agent generator/critic diversity, meta-verification, self-generated tasks, and continual learning are research directions with reward-hacking risks. | Separate proposer, verifier, and release authority. Synthetic tasks may stress-test the system but cannot certify a production improvement. Benchmark before adopting local models or RL. |

These are paraphrases from the caption set cross-checked against the official syllabus topics. They are not verbatim lecture notes.

## Operational definition and loop

An agent is self-improving only if a versioned change to its retrieval, prompt, skill, plan policy, tool selection, or model route produces a reproducible improvement on unseen, representative tasks, while satisfying authorization, privacy, cost, and reliability gates. Learning a fact for one run and performing better on the same case is useful context, but does not establish generalization.

1. **Observe:** create a project-scoped run record with agent/skill/model/prompt/tool versions, run mode, input and artifact hashes, permitted action trace, costs, and end state.
2. **Verify:** deterministic checks compare claims and actions with authoritative data; an independent reviewer or labeled evaluator handles subjective quality. Record unknown and conflicting evidence explicitly.
3. **Attribute:** link the outcome to the exact retrieved precedent, candidate, tool result, and run. A completed job is not automatically a successful business outcome.
4. **Collect feedback:** capture administrator positive/negative labels after verification, stakeholder correction, explicit rejection, tool errors, and later measured outcomes. Preserve source, actor, time, scope, and consent. Do not train from unauthenticated feedback.
5. **Propose:** aggregate failures and successes by agent, skill, task type, dataset, and run mode. Produce a versioned hypothesis with affected contract, expected benefit, known counterexamples, evidence cutoff, rollback reference, and no new authority.
6. **Evaluate offline:** freeze a time-based held-out set before candidate creation. Compare baseline and candidate on the same tasks, including negative and adversarial cases. Keep proposer and evaluator independent.
7. **Review and release:** require Data Governance Admin review for a reusable positive case and authorized human review for a skill change. Canary only under the existing controlled release mechanism; stop or roll back on guardrail failures.
8. **Measure after release:** compare matched task cohorts, safety incidents, cost, latency, and outcomes. Retire stale or harmful precedents. A canary without sufficient observations remains inconclusive.

Two loops remain distinct: within-run reflection uses fresh observations to choose the next authorized step; across-run learning proposes a durable change and passes independent verification before reuse. Neither loop grants action authority.

## Canonical evidence and data contracts

The current tables and RPCs are the starting point, not permission to create parallel truths. Extend only after schema review.

| Record | Required fields or invariant |
| --- | --- |
| Run and trajectory | Project ID; agent/skill/version; run mode; immutable step sequence; tool schema and output hash; policy decision; approval; artifact and verifier references; token/cost/latency; stop reason. Redact secrets and sensitive source content. |
| Outcome verification | Business objective, expected and observed state, comparison method, verifier ID/version, independent evidence, time window, uncertainty and failure classification. Distinguish technical completion from outcome quality. |
| Feedback | Actor identity and role, source run, label and rationale, target dimension, evidence, timestamp, revocation/correction link. Negative labels and explicit unknowns must remain queryable. |
| Learning case | Source run and verified outcome, project and asset scope, use-case key, reusable lesson, applicability constraints, counterexamples, expiry, approval state, provenance, supersession. No case is an instruction or policy. |
| Candidate | Baseline and candidate versions; source evidence cutoff; precise change; predicted benefit and risk; allowed agent/skill; held-out dataset ID; rollback; immutable evidence references. |
| Evaluation | Paired baseline/candidate results; dataset snapshot and split; per-agent/task/mode strata; deterministic checks; independent human judgments where needed; authority failures; abstention; costs; confidence interval or uncertainty. |
| Release | Reviewer and approval, canary assignment, exposure, stop rule, observed outcomes, rollback and retirement history. Replay must respect original project scope. |

Integrity rules: no evidence created after a claimed observation time; no duplicate case counted as independent evidence; no same-run feedback used in a held-out test; no cross-project or cross-asset leakage; no synthetic case certifies a real outcome; no self-evaluation alone promotes a candidate; no feedback changes policy or tool allowlists. PR #1078 enforces one temporal rule at the benchmark insert boundary.

The paired benchmark recording adapter checks that baseline and candidate totals come from the same unique SHA-256 case keys, do not overlap the declared training keys, and match cited aggregate evidence and safety counts. The new database trigger binds each aggregate to two independently persisted `governance.ai_evaluation_results` rows per case, with one baseline and one candidate version. It checks project, agent, skill, candidate, evaluator, benchmark key, dataset snapshot key, held-out label, temporal cutoff, explicit non-synthetic status, nonempty underlying evidence references, score, safety labels, source evidence overlap, and aggregate recomputation. A mismatch rolls back the benchmark transaction. The ledger rows must exist before calling `recordGovernedLearningCandidateBenchmark`; its references are UUIDs, and each row must carry `benchmark_case_key`, `benchmark_variant`, `benchmark_split=HELD_OUT`, `benchmark_dataset_key`, `learning_candidate_id`, `agent_key`, `skill_key`, `version`, `benchmark_evaluator_id`, `benchmark_key`, `synthetic=false`, `authority_violation`, and `adversarial_failure` metadata. Its `evaluation_type` is `AGENT_SKILL`, `capability` is `agent_skill:<agent_key>:<skill_key>`, and `evaluator_type` matches the aggregate. Installation fails if historical benchmark aggregates exist without a verified paired-evidence backfill; it does not silently grandfather them. The dataset key and case hash still originate with the independent evaluator; this gate cannot prove that the fixture was truly unseen without a separately governed dataset registry and split manifest.

Prospective collection begins when the new migration is applied. An immutable row is captured for every verified governed action outcome whose source run has explicit production-eligible provenance. Triggers cover either arrival order of outcome and provenance. It records the source agent definition version, run mode, effectiveness, and outcome type, including ineffective, partial, unknown, policy-blocked, and failed action outcomes in the eligible denominator. Failed agent runs cannot currently receive PGCL production provenance, so their outcomes are absent; instrument that population before interpreting any rate as an overall success rate. `learningRunMode` or `run_mode` is used only when it contains a recognized mode; missing, unrecognized, or conflicting values are `UNCLASSIFIED`. The service-only summary groups by project, agent, version, and mode with sample counts and first/last verification dates. There is no retrospective backfill, no claim for absent agents or modes, and no live result until this migration runs and real verified outcomes arrive. To compare a released candidate with baseline, record the release exposure and cohort assignment on the source run before execution, then compare contemporaneous outcomes with task-mix, cost, latency, and uncertainty controls. The current collector alone does not prove causal improvement.

## Eight-agent learning matrix

Each agent may learn from verified outcomes within its existing tool allowlist. The terms below are candidate behaviors and evaluation targets, not current production claims.

| Agent | Reusable lesson | Authoritative verifier and negative cases | Guardrail |
| --- | --- | --- | --- |
| Profiling | Which metric set and sampling plan detect a class of anomaly efficiently | Dataset version, row/column coverage, persisted metric replay; null-heavy, empty, schema-drift, and inaccessible sources | No source mutation; fixed compute and read budgets |
| Data Quality | Which rule or incident pattern predicts a verified finding and follow-up | Rule run, finding, score and post-action validation; false positives, waivers, stale rules, failed remediation | Reauthorize every governed action; no data remediation learned from precedent |
| Steward | Which ownership, CDE, glossary, or certification evidence resolves a case | Current authoritative stewardship records and administrator decision; conflicting owners, revoked approvals | Advice cannot rewrite a canonical governance record |
| Governance Analyst | Which policy and control sources support a scoped interpretation | Policy version, scope and cited control; contradictory or expired policy, missing jurisdiction | Abstain or escalate when precedence is not established |
| Architect | Which lineage and contract paths predict a change impact | Actual field-level lineage and contract validation; missing edges, cycles, stale or inferred lineage | Unknown paths remain unknown; no invented lineage |
| Investigator | Which evidence discriminates competing root causes | Incident timeline, measured anomaly, ruled-out hypotheses and later outcome; correlated symptoms and contradictory sources | Keep alternatives and calibrated uncertainty; no speculative repair |
| Executive | Which risk and scorecard synthesis predicts a material outcome | Reconciled KPI and risk evidence with decision-maker rating; misleading aggregates and stale metrics | Cite source and freshness; do not treat summary as an approval |
| Support | Which recovery or routing step resolves an operational incident | Job state, bounded retry, recovery and post-action verification; duplicate side effects, lost lease, timeout | Current recovery authorization and idempotency always prevail |

Apply per run mode: guided, supervised, handsfree and any other canonical modes from the execution-mode registry. Compare modes separately. A positive outcome in one mode cannot silently authorize another.

## Verifiers, selection, and budgets

- Prefer exact checks for schema, data metrics, policy decisions, lineage IDs, job state, and artifact integrity. Use human adjudication for quality and business relevance where exact truth is unavailable.
- Separate process validity from outcome validity. A correctly approved plan can still fail to improve quality; a good outcome from an unauthorized action remains a failure.
- Calibrate evaluator agreement against a labeled set with ambiguous and adversarial examples. Track false accept, false reject, abstention, inter-rater disagreement, and drift by domain.
- For optional best-of-N planning, generate at most the current `agent-excellence-contracts.ts` budget. Deduplicate candidates, run policy and evidence checks before utility scoring, choose only among authorized candidates, and stop when expected improvement is below marginal cost. Initially shadow-test rather than execute alternate writes.
- Never expose private test answers or future outcomes to candidate generation. Separate generator, critic, and release reviewer identities. Meta-verification can flag questionable judgments but cannot override a deterministic denial.

## Evaluation and acceptance

Construct project-scoped, de-identified fixtures from verified real outcomes; keep a separate adversarial suite and blinded human-rated cases. Split by time and asset family, deduplicate near-identical cases, pin source snapshots, and report sample counts. Use a matched baseline and candidate under equal tool permissions and comparable budgets. Report per agent and per run mode, plus Golden Path and cross-agent journeys.

Minimum evidence before saying **self-improving** for an agent:

1. A verified outcome and correction/negative feedback path exists for that agent, with traceable run provenance.
2. A candidate changes future behavior on unseen cases; the measured quality improvement has an uncertainty estimate and is not explained by task mix or leakage.
3. Zero authority or privacy regressions and no increase in severe failure cases; inconclusive results do not pass.
4. Cost and latency remain within the approved budget; gains per resource unit are reported.
5. An independent evaluator, authorized reviewer, canary, stop condition, rollback, and post-release outcome evidence are recorded.
6. The claim is repeated for each of the eight agents and relevant execution modes. A shared library conformance test alone does not prove this.

Proposed dashboard: verified runs, feedback coverage, positive/negative/unknown labels, candidate funnel, benchmark win/loss by skill, false-accept rate, retrieval precision and citation validity, precedent use and attributable success, canary exposure and rollback, latency/tokens/cost, and sample counts. Show the denominator and freshness for every rate. Never display a synthetic example as a production success.

## Current state and implementation order

| Capability | Status | Disposition and concrete next evidence |
| --- | --- | --- |
| Project-scoped verified episodic and approved positive-case retrieval | PARTIAL | KEEP; measure relevance and applicability on labeled queries, expiry and negative-example handling |
| Eight-agent PGCL proposal and retrieval contract | PARTIAL | KEEP; verify real run to approval to later attributed improvement for each agent |
| Candidate, independent benchmark, human review and canary | PARTIAL | BUILD_NOW; temporal check in PR #1078, then held-out paired comparison and representative real canary evidence |
| Outcome and process verification | PARTIAL | BUILD_NOW; per-skill deterministic validators plus calibrated human evaluation and error taxonomy |
| Adaptive test-time search | GAP_DEFERRED | BENCHMARK_LATER; bounded shadow alternatives against baseline and marginal cost |
| Offline fine-tuning or RL | GAP_DEFERRED | BUILD_LATER after governed dataset, privacy review, model reproducibility and independent release gate |
| Continuous improvement demonstrated in production | GAP_REQUIRED | BUILD_NOW; per-agent prospective evidence and rollback exercise before changing ADR-007 learning classification |

Sequence: first measure baseline and instrument negative feedback; then validate retrieval and verifiers; then run paired offline evaluations for all eight agents; then canary approved changes with strict stop rules; finally make a per-agent claim supported by prospective outcomes. This document does not authorize activation, training, or release.

## Adversarial questions to resolve during implementation

- Can a case with a matching keyword but a different asset, policy version, or run mode be retrieved and misapplied?
- Can an agent mark its own output as verified or fabricate a tool result or approval?
- Does a verified success remain safe when the current policy, dataset schema, or credential scope changes?
- Are failures, abstentions and rejected corrections represented, or does the memory contain only positive cases?
- Does a long trajectory loop, stop early, exceed budget, or hide failed attempts behind a successful final answer?
- Can a small canary appear to improve through selection bias, duplicate cases, leaked labels, or delayed negative outcomes?
- Does a model or prompt change alter tool selection or authority even if average task score improves?
- Does retirement or rollback immediately prevent future retrieval while preserving immutable evidence?

## Frontier challenge against ADR-007/008

DataNexus has an advantage in owned authorization, project scope, and auditable controlled release. Its learning evidence is partial because real prospective quality gains and calibrated verifiers are not yet shown. The course's search, multi-agent critique, and RL ideas are extension points or deferred research patterns, not parity claims. The proposed work preserves DataNexus-owned identity, RLS, tool allowlists, mutation policy, audit, recovery, and model routing. It does not alter any agent's ADR-007 current classification. Objective parity evidence is a held-out and canary result per agent with zero safety regressions, budget compliance, and attributable improvement.
