# Durable learning experiment budgets: capability challenge and decisions

Date: 2026-10-01. This record applies the native-first comparison required by `AGENTS.md`. It documents an implementation boundary, not a production activation or an empirical self-improvement claim.

## Existing capability and gap

DataNexus already has immutable learning evaluation policies, persisted independent evaluation decisions, approval fingerprint binding, controlled release, rollback, project budget admission, and observed model cost accounting. PR #1097 adds cancellation propagation and prevents cancellation-driven fallback. Project admission and post-run evaluation checks do not provide atomic experiment-specific total/per-run reservations before dispatch.

The required addition is a durable reservation/reconciliation boundary tied to `agent.learning_evaluation_policies`. It supplements the existing control plane rather than adopting a second source of authorization or release truth. Normal execution outside this experiment boundary must not be described as automatically covered by experiment caps.

## Frontier challenge

Primary references inspected on 2026-10-01:

- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence): persistent checkpoints support interruption/recovery; in-memory state does not survive restarts. This informs durable state design without substituting a graph checkpoint for a budget transaction.
- [AI SDK generating text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text): generation exposes usage and lifecycle metadata, including usage across steps. Such telemetry is useful evidence, but observing it after generation does not reserve experiment funds before dispatch.
- [OpenAI Agents SDK usage](https://openai.github.io/openai-agents-python/usage/): per-request and aggregate usage can include handoffs and tool-related model calls; third-party usage reporting depends on the exact adapter/backend. Retaining the distinction between omitted usage and provider-reported zero informs fail-closed reconciliation.

These documents describe relevant mechanisms. They do not establish a universal billing guarantee for DataNexus's configured providers. Provider-specific verification remains required.

| Capability | Status | Disposition | Evidence required to close |
| --- | --- | --- | --- |
| Locked project/agent/skill/mode/evidence binding | PARTIAL | BUILD_NOW | Reject mismatched runtime context before dispatch; retain existing release binding |
| Atomic total/per-run reservation across workers | GAP_REQUIRED | BUILD_NOW | Database transaction tests prove serialized admission at exact boundaries |
| Durable crash accounting | PARTIAL | BORROW_PATTERN | Pending/uncertain spend survives restart; no timeout-based refund |
| Duplicate-side-effect prevention | GAP_REQUIRED | BUILD_NOW | Same invocation cannot dispatch twice even across workers |
| Cancellation and bounded fallback | PARTIAL | KEEP | Cancellation tests plus integration at the experiment execution boundary |
| Per-attempt usage and pricing provenance | PARTIAL | BUILD_NOW | Every potentially billable attempt reconciles against observed evidence |
| Universal provider billing upper bound | GAP_REQUIRED | EXTENSION_POINT | Verified backend-specific quote, tokenizer and pricing contract; unsupported backends denied |
| General graph replay, forking and time travel | GAP_DEFERRED | BUILD_LATER | Separate runtime objective; not needed to admit this bounded experiment safely |
| Empirical quality parity with frontier agents | PARTIAL | BENCHMARK_LATER | Independent prospective paired evaluation, including negative outcomes |
| External runtime ownership of approval/authority | NOT_APPLICABLE | REJECT | DataNexus retains authentication, scope, audit, release, rollback and learning authority |

Statuses describe the baseline and remaining challenge. Implementation/test evidence must be attached before changing a required gap to parity. There is no claimed ADVANTAGE from design intent alone.

## Decisions

- Use an immutable persisted policy and row-locked database admission. A process-local counter cannot protect shared budgets under concurrent workers or restarts.
- Reserve conservative billable maxima. Output token ceilings alone do not bound input tokens, hidden tokens, fees or provider billing. Missing verified bounds deny paid admission.
- Disable experiment fallback at the server boundary. Each supported retry uses a fresh invocation identity and reservation within the same run budget. Existing provider resilience cannot obscure billable attempts beneath a single reservation.
- Preserve uncertainty. Cancellation is a request to stop work, not proof of zero billable consumption. Unknown outcomes retain exposure and block further policy execution until authoritative reconciliation.
- Reject duplicate execution. Returning an existing reservation must not authorize another provider call. No claim of exactly-once external provider delivery is made without provider-supported idempotency.
- Keep the adapter replaceable. A future provider or external runtime can supply verified quote/usage evidence but cannot change the locked budget or release authority.
- Do not install a default quote implementation. The optional server quote dependency must supply immutable request-bound provider/model/pricing evidence and exact decimal USD accounting. Missing quoting support denies a scope-bearing experiment before spending.
- Keep initial validation synthetic and free of paid model calls across all eight agents and supported combinations. This establishes implementation behavior, not real improvement.

## Authority and privacy

This change does not alter ADR-007 agent classifications, allowed tools, project authorization, governed mutation policy, stakeholder approval requirements, or rollback governance. It does not permit source-data remediation or candidate self-promotion. Budget records should retain identifiers and accounting provenance without storing prompts, credentials, or dataset payloads unnecessarily.

## Objective completion evidence

Attach the implementation commit and exact-head CI, behavior tests proving denial before dispatch, SQL concurrent-admission/duplicate/unknown-outcome checks, all-eight-agent synthetic conformance, and an explicit unsupported-provider path. Activation requires approved project/dataset/evaluator and budget choices plus backend-specific billing verification. Actual improved quality requires independent prospective results; no synthetic pass may substitute for them.

See the [implementation and acceptance checklist](../Admin/learning-experiment-budget-implementation-20261001.md).
