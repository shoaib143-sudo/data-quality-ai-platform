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

The existing canonical project runtime cost enforcement remains authoritative for provider execution. PR #1091 does not introduce a second resource-control plane. Its locked experiment budget is checked against recorded evaluation evidence. Admission and post-run accounting checks do not prove that experiment-specific limits interrupt an in-flight provider request; that execution-boundary integration remains to be demonstrated.

Still intentionally external to this implementation:
- real project/dataset selection and independent evaluator assignment;
- independently computed confidence/statistical evidence;
- actual prospective baseline/candidate outcomes;
- live candidate execution or promotion.

No automatic promotion is permitted. A technically successful run is not evidence of improvement. A candidate reaches release review only after a persisted, independently verified positive result satisfies the locked policy.

## Native capability challenge required by AGENTS.md

Current references reviewed 2026-09-30:
- OpenAI evaluation best practices: eval-driven development, task-specific datasets, continuous evaluation, human calibration of automated graders and production-representative cases.
- Arize/Phoenix agent evaluation guidance: versioned datasets and experiments, trace-derived failure taxonomies, deterministic and model-based evaluators, human calibration, CI evaluation and promotion of confirmed failures into regression suites.
- LangSmith evaluation concepts previously reviewed for offline versus online evaluation and evaluator separation.

DataNexus keeps authentication, project scope, RLS, evidence, approval, release and learning authority in its own control plane. External evaluation providers remain replaceable adapters rather than release authorities.

| Capability | Status | Disposition | Evidence / remaining boundary |
| --- | --- | --- | --- |
| Offline and online evidence separation | PARITY | KEEP | Immutable benchmark manifests plus prospective production ledger; first real candidate comparison still pending |
| Explicit experiment and result bindings | PARITY | KEEP | Exact candidate, versions, mode, evaluator, policy, manifest and decision are release-fingerprinted |
| Sealed held-out manifest binding | PARITY | KEEP | Registered manifest ID/hash/version and cutoff enforced by persistence RPC |
| CI evaluation and regression gating | PARITY | KEEP | Focused positive, negative, adversarial, release-admission and observability tests are mandatory |
| Learning decision observability | PARTIAL | KEEP | Locked policy and decision evidence is visible read-only; richer trajectory-level evaluator views are not part of this PR |
| Independent evaluator calibration | PARTIAL | KEEP | Evaluator separation plus rubric/calibration references are enforced; real reviewer calibration evidence remains operational |
| Runtime cost and latency stop enforcement | PARTIAL | BUILD_NOW | Existing project runtime controls remain authoritative; experiment-specific ceilings are checked on evaluation evidence, and in-flight enforcement remains unverified |
| Replaceable evaluator integration | PARTIAL | EXTENSION_POINT | Locked rubric, calibration and analysis references preserve provider-neutral integration |
| Trace or trajectory-level semantic evaluation | GAP_DEFERRED | BUILD_LATER | Existing traces and governed outcomes can support it, but this PR does not add an external or agent-as-judge control plane |

No ADR-007 agent classification, tool allowlist, mutation boundary, authentication, RLS authority or approval authority is expanded by this work. The new evaluation layer is benchmarkable and replaceable without surrendering DataNexus control-plane authority.

## Resume audit and behavioral verification

Added executable service tests with a test-only admin-client substitute. They verify project/candidate/policy query bindings, newest policy/decision selection, stale-positive invalidation, result reclassification, database error handling, missing accounting, budget excess and safety rejection. Both rows and their timestamps are inspected; tied or malformed chronology blocks admission rather than guessing with UUID order. Date parsing may conservatively treat sub-millisecond differences as a tie; a new unambiguous decision is required in that case.

Synthetic behavior tests do not prove real quality gain, organizational reviewer independence, empirical statistical confidence or runtime cost enforcement. They do not activate any experiment.
