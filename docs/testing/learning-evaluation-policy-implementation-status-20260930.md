# Evaluation policy implementation status

2026-09-30. PR #1091 now contains the typed policy validator and result classifier plus persistent prospective evaluation evidence and release-path admission binding.

Implemented:
- fail-closed policy validation across project, candidate, agent, skill, mode, datasets, versions, evaluator separation, immutable manifest, analysis plan, positive gain, score, cost, token and latency limits;
- result classification that separates STOPPED, REJECTED and REVIEW_REQUIRED from IMPROVED, REGRESSED and INCONCLUSIVE;
- append-only `agent.learning_evaluation_policies` and `agent.learning_evaluation_results` with project RLS and no browser mutation grants;
- service-role-only policy/result RPCs with duplicate, cross-candidate, version, safety, evidence, sample, uncertainty and budget validation;
- release admission requiring a persisted REVIEW_REQUIRED + IMPROVED decision with automatic promotion disabled;
- exact evaluation policy/result, manifest, mode and evaluator bindings added to the existing approval fingerprint;
- controlled-release revalidation of the same prospective evaluation evidence before canary and activation;
- latest-policy and latest-decision precedence, so a newly locked policy or newer rejection, regression, stop or inconclusive result invalidates older positive eligibility;
- sealed benchmark-manifest identity binding, including registered manifest ID/hash/version and temporal cutoff validation at persistence time;
- read-only Learning Governance observability for locked policies, evaluator/manifest identity, decision quality/disposition, uncertainty, safety and accounting evidence;
- essential positive, negative, safety, regression, inconclusive, stale-positive and persistence/release-binding tests;
- Continuous Learning Governance CI coverage through `verify:learning-evaluation-policy`.

The existing canonical project runtime cost enforcement remains authoritative for provider execution. PR #1091 does not introduce a second resource-control plane. Its locked experiment budget is an additional experiment-specific ceiling and evidence check.

Still intentionally external to this implementation:
- real project/dataset selection and independent evaluator assignment;
- independently computed confidence/statistical evidence;
- actual prospective baseline/candidate outcomes;
- live candidate execution or promotion.

No automatic promotion is permitted. A technically successful run is not evidence of improvement. A candidate reaches release review only after a persisted, independently verified positive result satisfies the locked policy.

## Native capability challenge required by AGENTS.md

Reference reviewed 2026-09-30: LangSmith evaluation concepts distinguish offline curated evaluation and online evaluation. DataNexus retains its own governance authority, evidence, RLS and release controls.

| Capability | Status | Disposition | Evidence needed |
| --- | --- | --- | --- |
| Offline/online evidence separation | IMPLEMENTED CONTRACT | KEEP | Real independently scored outcomes pending |
| Explicit experiment and result bindings | IMPLEMENTED | KEEP | Exact-head CI and migration reconstruction |
| Sealed held-out manifest binding | IMPLEMENTED | KEEP | Registered manifest ID/hash/version and cutoff enforced by persistence RPC |
| Learning decision observability | IMPLEMENTED | KEEP | Read-only Command Center contract and UI verification |
| Independent evaluator calibration | CONTRACT ENFORCED | KEEP | Authorized evaluator plus real calibration record |
| Runtime cost/latency stop enforcement | INTEGRATED | KEEP | Existing canonical runtime enforcement plus experiment ceiling |
| Replaceable evaluator integration | EXTENSION POINT | KEEP | Locked rubric, calibration and analysis references |

No ADR-007 agent classification, tool allowlist, mutation boundary, authentication, RLS authority or approval authority is expanded by this work.
