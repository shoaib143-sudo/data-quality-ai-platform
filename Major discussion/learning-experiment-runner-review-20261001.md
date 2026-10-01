# Native learning experiment runner: independent integration review

Date: 2026-10-01. This review follows the prior [pilot readiness review](learning-pilot-readiness-review-20261001.md). It evaluates implementation boundaries rather than asserting that any agent has improved.

## Capability challenge

| Capability | Status | Disposition | Native evidence and completion requirement |
| --- | --- | --- | --- |
| Server-owned control plane | PARITY | KEEP | Native authentication, project scope, agent/mode authorization, evidence and release authority remain authoritative. No external framework becomes an approver. |
| Target/dataset/evaluator composition | PARTIAL | BUILD_NOW | The runner composes server-loaded paired execution ports. Concrete canonical loader, invoker, evaluator and collector wiring must be demonstrated separately. |
| Immutable executable/input binding | PARTIAL | BUILD_NOW | Hash actual bytes and lock exact execution manifest. Version labels and catalog metadata alone cannot prove replay or distinct behavior. |
| Durable side-effect recovery | PARTIAL | BORROW_PATTERN | Persist atomic attempt claims before execution and stop ambiguous resumes. In-memory fixtures prove control behavior, not restart durability. |
| Canonical settlement/service composition | PARTIAL | BUILD_NOW | The service joins reservation, ACCOUNTED settlement and PRICED USD cost event and composes the live store, budget admission and model cost accounting. Concrete stored-plan verification, current authority, pricing, activation and independent scoring are still mandatory integrations. |
| Canonical score/accounting derivation | PARTIAL | BUILD_NOW | Verify raw output and joined reservation/settlement/cost identities before scoring. A trusted adapter interface is an extension point, not live evidence. |
| Controlled release and rollback | PARITY | KEEP | Existing review admission remains required; runner completion is not release authority. |
| Generalized time travel and workflow forking | GAP_DEFERRED | BUILD_LATER | Not necessary for the first bounded paired experiment. Never replay a billable side effect merely to recreate a trace. |
| External runtime adoption | GAP_DEFERRED | BENCHMARK_LATER | Compare later behind replaceable ports. No new runtime dependency required for this module. |
| Autonomous self-promotion | NOT_APPLICABLE | REJECT | Violates approved native learning-authority boundary. |

## Primary frontier sources

Reviewed 2026-10-01:

- https://docs.langchain.com/langsmith/evaluation-types
- https://reference.langchain.com/python/langsmith/evaluation/_runner/evaluate
- https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/functional-api.mdx
- https://docs.langchain.com/oss/javascript/langgraph/persistence

LangSmith separates target execution on datasets from per-example and aggregate evaluators. LangGraph separates persisted checkpoints from longer-lived stores and recommends persisted task boundaries around API side effects with idempotent design. These patterns inform the native runner. The parity assessment is an inference from DataNexus source inspection, not a claim that those products enforce DataNexus authority or guarantee exactly-once provider billing.

## Adversarial review boundaries

Require exact policy record UUID binding in addition to the logical policy key, canonical source bytes rather than mutable version labels, sealed held-out membership, no duplicate independent sampling units, and training-evidence exclusion. Current authorization must be rechecked at dispatch, and same actor under different text labels must not count as independent evaluation.

An acquired claim is not completed evidence. Crashes, transport cancellation and persistence failure may hide an accepted provider invocation; ambiguous claims must stop rather than refund or retry silently. Completed re-entry may only reuse verified immutable persisted output for the exact case, arm, executable and policy.

The existing paired ledger marks rows non-synthetic. Disposable fixtures must use a segregated contract and must not call it. Positive aggregate booleans, confidence bounds and cost totals cannot be accepted from a route request. The production collector must derive them from complete canonical case and settlement joins, including failure denominators and the predeclared analysis plan.

No ADR-007 classification changes. Persisting outputs and constructing an evaluation harness alone do not prove learning; validated results must later alter governed future behavior through the approved release path.

## Integration findings

The new runner separates `policyRecordId` from `policy.policyId`, freezes a copied server plan, hashes executable/input bytes, rejects duplicate input hashes, excludes training case keys and reseals all policy and training bindings in its execution manifest. Its durable store adapter calls service-only claim/completion RPCs. SQL completion verifies immutable identity, output bytes, an ACCOUNTED settlement and a PRICED canonical cost event. These checks reduce substitution risk but do not establish actor authority or model-output provenance by themselves.

Service role retains direct insert privileges by design. The SQL joins enforce the RPC completion contract, not a boundary against a malicious service-role writer. Browser roles receive no direct table or RPC permission, and invoker-security functions retain native scope restrictions.

The evaluator/collector binds each score to the exact attempt, case, arm, version, input/output hash and provenance and rejects paired arms using different inputs. A bounded paired Hoeffding lower bound is reproducible only for genuinely independent units and a predeclared confidence level. Exhaustive attempt loading and authorized independent review remain canonical-loader obligations. The collector conservatively uses full experiment cost/token totals for the shared run UUID, matching the existing budget SQL rather than understating cost as a maximum single invocation. It leaves confirmation false and prospective writes disabled; elapsed time alone cannot prove independent confirmation.

The new executor calls the existing quoted budget invocation guard, captures its accounting callback and reloads settlement evidence to check exact invocation, reservation, cost event and scope. It rejects synthetic dispatch and requires explicit server activation. Sealed artifacts describe supported reasoning prompts, not arbitrary executable code or tool expansion.

The source now supplies canonical settlement loading and a server composition function. The loader rejects read failures, missing or ambiguous links, non-ACCOUNTED settlements, non-PRICED or non-USD cost events, and mismatched project, invocation, run, token or cost values. Composition reloads canonical receipts before accepting prospective outcomes and requires stored-plan verification before execution. It does not manufacture canonical plans or current authority from caller assertions.

Production plan loading and integrity verification, native current authority resolution, quote configuration, actual independent scoring and confirmation evidence remain activation requirements. An explicit server activation assertion is mandatory before provider dispatch. Until those adapters and a production entrypoint are joined, fixture verification establishes implementation behavior, not a live end-to-end self-improvement system.

Independent runner verification passed 119 disposable scenarios. Disposable PGlite SQL behavior validation passed, as reported by the integrating workstream. Native ten-session dispatch-claim concurrency and exact-head protected CI remain pending. No live runner migration deployment, real provider invocation, positive prospective result or automatic promotion is asserted by these source checks.
