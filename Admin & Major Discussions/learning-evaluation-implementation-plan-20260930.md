# Learning evaluation implementation plan

Canonical plan: [phases, five workstreams and acceptance gates](../docs/testing/learning-evaluation-implementation-plan-20260930.md).

Policy: [eight-agent evaluation policy and live inventory](../docs/testing/learning-evaluation-policy-20260930.md).

Tracking: PR #1091.

Implemented in the current branch:
- typed prospective evaluation policy and decision contract;
- immutable project/candidate/version/mode/manifest/evaluator bindings;
- append-only evaluation policy and result persistence with project RLS;
- service-role-only evidence writes;
- positive-gain release-review admission;
- safety, accounting, uncertainty and experiment-budget fail-closed behavior;
- integration with the existing release approval fingerprint;
- controlled-release revalidation;
- essential positive, negative and failure-path verification.

Current completion gate: exact-head CI, migration reconstruction and reconciliation with current `main`.

After that, remaining work is operational evidence rather than missing control-plane code: choose the authorized project/datasets/evaluator, register the first real policy, collect baseline and candidate outcomes, calculate the locked analysis result, and only then consider the existing governed candidate-release workflow.
