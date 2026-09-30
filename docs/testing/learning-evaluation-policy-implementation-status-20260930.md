# Evaluation policy implementation status

2026-09-30. PR #1091 now contains a pure typed policy validator and result classifier, essential behavior tests, an npm verification command and Continuous Learning Governance CI integration. Local Node 24 behavior tests passed.

The module rejects missing specification fields, same baseline/candidate, self-evaluator identity, invalid hashes, duplicate dataset versions, unsupported normalized modes and invalid budgets. Results bind to policy/project/candidate/version/mode/manifest/evaluator, reject pre-policy evidence, stop on missing/exceeded accounting, distinguish regression/ties/missing evidence, require a positive confidence lower bound and confirmation window, and reject authority/safety violations even when quality evidence is missing. No automatic promotion is permitted.

These are pure functions. Caller-supplied values are not authorization or empirical proof. Persistent immutable policy registration, actor/project/dataset and organizational evaluator resolution, release-path admission, runtime budget enforcement, independently computed statistical evidence and Command Center integration remain required. This change does not activate a candidate or modify the production release path. Sample values in tests are synthetic and not recommended statistically sufficient thresholds.

## Native capability challenge required by AGENTS.md

Reference: https://docs.langchain.com/langsmith/evaluation-types (reviewed 2026-09-30). It distinguishes offline curated-dataset evaluation and online evaluation with multiple evaluator approaches. DataNexus keeps its own authority and evidence boundaries rather than adopting an external control plane.

| Capability | Status | Disposition | Evidence needed |
| --- | --- | --- | --- |
| Offline/online evidence separation | PARTIAL | KEEP | Existing manifests/prospective ledger; real independently scored outcomes pending |
| Explicit experiment and result bindings | PARTIAL | BUILD_NOW | Pure validator behavior tests; immutable persisted admission pending |
| Independent evaluator calibration | GAP_REQUIRED | BUILD_NOW | Authorized independent actor and reviewed calibration record |
| Runtime cost/latency stop enforcement | GAP_REQUIRED | BUILD_NOW | Measured accounting at execution boundary, not classifier alone |
| Replaceable evaluator integration | PARTIAL | EXTENSION_POINT | Locked rubric/analysis references and independent provider adapter |

No ADR-007 agent classification, tool allowlist, mutation boundary, authentication, RLS or approval authority changes. Pure policy/evidence inputs keep the evaluator replaceable. Unmeasured frontier parity is not claimed.
