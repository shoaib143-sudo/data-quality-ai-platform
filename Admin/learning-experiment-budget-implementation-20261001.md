# Learning experiment budget implementation and acceptance

Date: 2026-10-01. Scope: implementation, integration, authorization correctness, and essential failure-path testing. Production activation and paid experiments are excluded from this change.

## Authorized first stage

Start with synthetic fixtures for all eight canonical agents and each supported agent/skill/mode combination. The fixture runner must make zero paid model calls. Use isolated database fixtures, with `testing` as the synthetic-data boundary in the existing environment where appropriate. Do not create a paid branch or insert synthetic rows as real prospective learning outcomes.

The agents are `profiling_agent`, `data_quality_agent`, `steward_agent`, `governance_analyst_agent`, `architect_agent`, `investigator_agent`, `executive_agent`, and `support_agent`. Policy mode names are `GUIDED`, `GOVERNED_AUTO`, and `FULL_AUTONOMOUS`. These names do not authorize every mode on every execution surface. Derive valid combinations from canonical agent/skill/runtime eligibility; unsupported combinations must be rejected or reported as unsupported, never silently counted as passing.

## Implementation contract

1. Resolve the immutable locked record from `agent.learning_evaluation_policies` on the server. Bind project, candidate, agent, skill, mode, baseline/candidate version, and dataset manifest before admission. Client-supplied limits never override the locked policy.
2. Reserve a verified upper bound before dispatching each billable attempt. Check both total experiment and per-run cost/token bounds. Serialize decisions using a database row lock, so concurrent workers cannot spend the same remaining budget.
3. Bind reservations to a stable run and invocation identity. Duplicate admission must not dispatch another model request. Reservation idempotency alone is insufficient to authorize replay.
4. Count retries and fallback attempts under the same experiment and run. Each potentially billable attempt needs its own admitted reservation before dispatch. Do not hide retries inside an unmetered provider wrapper.
5. Apply the locked elapsed-time ceiling to the execution deadline and provider cancellation signal. Stop further attempts after cancellation, deadline expiry, admission failure, or unresolved accounting.
6. Reconcile trustworthy observed usage and versioned pricing after completion. Require consistent provider/model/request identity. Never infer zero cost from missing tokens, missing prices, transport failure, cancellation, or absent usage.
7. Keep unresolved spend reserved and stop further policy execution when accounting is uncertain. A worker crash or expired lease is not proof that the provider did not bill. There is no automatic TTL refund of uncertain spend.
8. Preserve existing project admission, authorization, tool allowlists, release review, human approvals, canary verification, activation, and rollback. An experiment budget grants no new execution or promotion authority.

## Essential acceptance gates

Implementation surfaces in this change:

- `lib/ai/learning-experiment-budget.ts`: guarded experiment execution and trusted quote contract.
- `lib/ai/governance-learning-experiment-budget.ts`: server persistence adapter for reservation/reconciliation.
- `supabase/migrations/20261001004136_governed_learning_experiment_budget.sql`: durable budget state and database RPCs.
- Existing router integration: optional server-provided quote dependency. A scope-bearing experiment without a verified quote is denied before spending. There is no default quote that silently enables paid calls.

Quote evidence must match the exact provider, model, pricing version, and immutable request. Cost arithmetic uses exact decimal USD values. Experiment fallback is disabled at the server boundary; any supported retry requires a fresh invocation identity and reservation. An UNKNOWN accounting outcome blocks the policy.

The current UNKNOWN settlement is terminal and immutable. Clearing it requires a separately governed recovery decision; this module supplies no automatic clearing or timeout refund. The 24 agent/mode combinations exercise the shared budget contract, not live execution or authority of each agent in every mode. Existing agent and skill eligibility remains authoritative.

| Gate | Required evidence |
| --- | --- |
| Binding | Wrong project, mode, policy, version, or manifest denied before provider dispatch |
| Total budget | Concurrent admissions cannot exceed locked total cost or tokens |
| Per-run budget | All attempts in a run consume the same per-run ceiling |
| Duplicates | Repeated invocation identity cannot cause a second model request |
| Failure recovery | Unknown outcome retains reservation and blocks further spend |
| Reconciliation | Missing, mismatched, negative, or inconsistent accounting stops execution |
| Cancellation | Deadline/cancellation propagates; experiment fallback is disabled |
| Provider bounds | Unsupported pricing/token upper-bound guarantees reject paid admission |
| Synthetic isolation | No paid provider calls and no real prospective outcome records |
| Authority | No source remediation, autonomous release, or authority expansion |
| Integration | Focused tests, SQL fixtures, type/build checks, and exact-head CI pass |

The implementation PR must report actual test outcomes. This document does not assert that these gates have passed merely because they are listed.

## Remaining gates before a real experiment

1. Select an authorized project and immutable dataset versions with an approved manifest.
2. Select baseline, candidate, rollback reference, agent, skill, and an actually supported mode.
3. Assign an independent evaluator distinct from the proposer. Lock rubric, calibration, primary metric, analysis plan, sample size, score threshold, minimum gain, and confirmation window.
4. Choose explicit total/per-run cost, total/per-run tokens, and latency ceilings. The initial synthetic stage authorizes no paid execution; it does not imply a paid budget later.
5. Verify the exact provider/model/backend quote and billing semantics. Account for input/output, hidden reasoning, cache semantics, provider fees, retries, and any provider-added tokens. Pin the pricing version and verify a conservative billable upper bound. A compatible API shape does not establish billing parity.
6. Deploy the reviewed implementation and migration through the existing governed release process. Apply no new production migration or activation based only on synthetic test success.
7. Collect baseline and candidate prospective evidence with every terminal outcome included. Historical and synthetic evidence stay separate.
8. Independently evaluate the locked analysis plan. Missing evidence, missing accounting, ties, or insufficient uncertainty remain inconclusive or stopped as specified by the existing classifier.
9. Submit only eligible persisted improvement evidence for existing release approval. Approval, canary, verification, activation, and rollback remain separate gates.

## Completion boundary

The bounded implementation can be complete before real agent improvement is proven. Synthetic tests can establish budget and authority behavior; they cannot establish better model decisions, empirical quality gain, provider billing guarantees, or deployed release parity. Record those remaining activation prerequisites explicitly rather than marking all agents self-improving.

See [capability challenge and decisions](../Major%20discussion/learning-experiment-budget-20261001.md).
