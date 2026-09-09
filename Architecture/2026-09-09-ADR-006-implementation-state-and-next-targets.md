# ADR-006 implementation state and next targets

Date: 2026-09-09
Status: Current implementation checkpoint
Production main SHA at checkpoint: `0b4f365144b3f13624db0ab78ff85d6729659738`
Production URL: `https://data-quality-ai-platform.vercel.app/`
Supabase project ref: `tvjnavjxuehpesxcfvrx`
Target DataNexus project: `479813aa-72a4-4b12-b72a-74da8d2419ce`

## Purpose

This checkpoint summarizes the material ADR-006 architecture progress completed after the 2026-09-08 operating-state document and defines the next implementation targets. It is the compact continuation point for the AI intelligence, governance, learning, evaluation, observability, retrieval, and resource-control work.

## Future state we are building toward

DataNexus AI should operate as a governed AI control plane in which models are replaceable workers, not authorities. DataNexus owns identity, routing, evidence, policy, learning, evaluation, resource controls, audit, observability, and human/governed approval. The target system should support progressively autonomous specialist agents while keeping every material decision traceable to canonical evidence and explicit authority.

The intended direction is:

1. Governed model selection behind stable provider interfaces.
2. Verified learning from human-reviewed or otherwise governed outcomes, never recursive trust in prior AI output.
3. Dedicated retrieval, reranking, evaluation, and benchmark evidence.
4. Policy and risk controls above model execution.
5. Runtime execution controls, quotas, and emergency stop/pause independent from model approval authority.
6. AI observability with W3C trace correlation while keeping trace identity separate from business/execution identity.
7. A read-only AI Command Center that explains canonical state and evidence without becoming a mutation authority.
8. Progressive introduction of external infrastructure such as OPA or OTLP backends only when real configuration and runtime support exist.

## Architecture rules that remain authoritative

- PostgreSQL / Supabase is authoritative for governance state and evidence.
- Observation is not governance authority.
- AI suggestion is not human/governed authority.
- Inferred lineage is not source-observed lineage.
- Stable identity is preferred over mutable path-only identity.
- Execution authorization is separate from DQ or model approval.
- W3C trace IDs are observability correlation only and must not be repurposed as business identity.
- Resource budgets are quota/execution controls, not model approval or deployment authority.
- Never invent evidence, provenance, labels, pricing, authority, policy precedence, or provider usage.
- Command Center remains read-only and protected by `admin.manage`.
- Governance lifecycle is append-only/versioned; no AI path may silently activate or promote governance state.
- Exact-head CI must be green before merge; production must be verified against the exact merged SHA.
- Databricks `system.access` lineage permission work remains explicitly excluded from this workstream. Do not spend implementation time trying to bypass or fabricate that external permission boundary.

## Completed ADR-006 implementation progress

### Governance and Command Center

PRs #131-#137 established read-only Command Center evidence for governance, evaluation, learning candidates, routing policies, data-quality investigations, canonical audit evidence, resource budgets, and emergency execution state.

PR #146 added the interactive read-only Command Center Explorer.

PR #155 added retrieval-evaluation readiness visibility.

PR #164 added explicit project output-budget readiness states: `READY`, `NOT_CONFIGURED`, `DISABLED`, and `NO_OUTPUT_LIMIT`.

PR #167 added read-only visibility for canonical request-admission and concurrency-lease evidence.

PR #168 extended the trace timeline with whitelisted budget-admission evidence while preserving strict separation among trace ID, execution correlation UUID, provider request ID, admission ID, and lease ID.

### Policy decision boundary

PR #138 introduced the replaceable `PolicyDecisionProvider` boundary with fail-closed semantics and exact current policy-version behavior.

PR #144 added policy-decision telemetry without allowing telemetry failure to change policy authority.

OPA remains a preferred future dedicated PDP implementation, but no OPA service, endpoint, Rego bundle contract, or deployment currently exists. The in-platform provider remains canonical until real OPA infrastructure is available.

### Retrieval, reranking, and evaluation

PR #139 introduced the dedicated `RerankerProvider` seam and deterministic baseline.

PR #140 added labeled retrieval relevance evaluation with MRR@K, nDCG@K, and Recall@K persisted through the Evaluation Engine.

PR #149 defined governed retrieval relevance datasets with only explicit `HUMAN_REVIEWED` or `GOVERNED_IMPORT` authority.

PR #151 added append-only canonical persistence for retrieval relevance cases and judgments.

PR #152 added the governed offline retrieval benchmark runner.

PR #153 added the authenticated atomic human relevance-label recorder behind `admin.manage` while keeping Command Center itself read-only.

PR #154 added authenticated governed benchmark execution that records evaluation evidence but has no model-promotion authority.

No reranker quality claim is valid until real governed labels exist and DataNexus-specific benchmark results support it.

### Telemetry and observability

PR #141 added W3C trace fields to `governance.ai_telemetry_events`.

PRs #142-#144 correlated governed agent stages, handoffs, and policy decisions with W3C traces.

PR #147 extended `ReasoningResult` with provider-observed latency, usage, and provider request IDs without estimating missing usage or cost.

PR #150 records model invocation telemetry at the governed router boundary.

PRs #157-#161 hardened provider failure handling and invocation evidence: raw upstream error bodies are redacted; sanitized HTTP status/request IDs may be recorded; routed model and routing-policy evidence are preserved; caller-requested output-token ceilings are auditable.

PR #162 added a strict whitelist projection of model invocation evidence into the trace timeline. Raw telemetry attributes never reach the page.

PR #168 added whitelisted budget admission/lease evidence to the same trace projection.

External OTLP export is not yet implemented because no verified endpoint/backend configuration exists.

### Resource controls and execution safety

PR #137 introduced canonical resource-budget policy versions/effective state and emergency execution-control evidence.

PR #145 enforced PAUSE/KILL execution controls at governed agent run/handoff boundaries.

PR #156 added an optional `ReasoningRequest.maxOutputTokens` provider-side ceiling.

PR #163 binds canonical `PROJECT / PROJECT` `max_output_tokens_per_request` to the governed reasoning invocation. The caller can request a lower ceiling; a higher request is capped; policy-read failure fails closed.

PR #165 introduced atomic PROJECT-scope request admission and concurrency accounting:

- `governance.ai_resource_budget_request_admissions`
- `governance.ai_resource_budget_concurrency_leases`
- `governance.acquire_ai_project_resource_budget_admission(...)`
- `governance.release_ai_project_resource_budget_lease(...)`

The functions serialize admission and project policy-version writes with the same project advisory transaction lock, enforce sliding one-minute request limits and active concurrency, support idempotent correlation IDs, and are service-role-only for mutation.

PR #166 composes those controls into the governed model invocation path. `IntelligentRouteContext` now carries a distinct UUID `executionCorrelationId`; W3C trace context remains observability-only. Rate/concurrency admission occurs against the exact current project policy version before model invocation; denial blocks execution; acquired leases are released in `finally`, with TTL as the backstop. Rate/concurrency-only policies are preserved even when no output-token limit exists.

PRs #167-#168 surface the resulting canonical accounting evidence in Command Center and traces without creating governance authority.

## Current canonical resource-control capability

For `PROJECT / PROJECT` policies, DataNexus can now enforce:

- `max_output_tokens_per_request` before provider invocation;
- `max_requests_per_minute` through atomic admissions;
- `max_concurrent_executions` through atomic concurrency leases.

The following are intentionally not implemented yet:

- `max_cost_usd_per_request` enforcement without authoritative provider/model pricing;
- `max_cost_usd_per_day` enforcement without authoritative pricing plus atomic cost accounting;
- combined PROJECT + AI_SYSTEM + AGENT policy enforcement because cross-scope precedence/aggregation semantics have not been defined.

Do not infer `strictest wins`, `most specific wins`, or any other cross-scope rule without an accepted architecture decision.

## Live target-project state at this checkpoint

Read-only Supabase verification for project `479813aa-72a4-4b12-b72a-74da8d2419ce` returned:

- effective resource-budget policy rows: `0`
- request-admission rows: `0`
- concurrency-lease rows: `0`
- governed retrieval case versions: `0`
- retrieval relevance judgments: `0`
- `RETRIEVAL_RELEVANCE` evaluation results: `0`

This is valid. Runtime capability existing does not imply a policy, label, benchmark result, or admission must exist. Do not seed synthetic state merely to make a feature appear active.

## Current production topology

- Next.js / React application and control-plane runtime: Vercel.
- Canonical governance/catalog/profiling/orchestration/evidence store: Supabase/PostgreSQL.
- Generic JDBC execution runtime: replaceable Java 21/Spring Boot bridge on Render.
- W3C trace context and internal canonical telemetry are live in PostgreSQL.
- Command Center is a read-only governance/observability surface.

Production at this checkpoint is READY on exact SHA `0b4f365144b3f13624db0ab78ff85d6729659738` (merge of PR #168).

## Highest-value next targets

### 1. Canonical AI cost accounting

Define an authoritative provider/model pricing contract before enforcing cost. The design must distinguish observed provider usage from configured price/version/currency/effective dates. Then add atomic per-request/daily project cost accounting keyed to exact policy version and execution correlation. Never calculate governed cost from guessed token prices or telemetry character counts.

### 2. Governed retrieval benchmark data

The infrastructure is complete but the target project has no governed relevance labels. Populate genuine human-reviewed/governed-import judgments through the existing authenticated recorder, then run the governed benchmark and compare reranker candidates. Do not seed pseudo-labels from model output or remediation outcomes.

### 3. Budget scope semantics

Before enforcing `AI_SYSTEM` or `AGENT` resource-budget rows together with project rows, create/accept an explicit ADR for cross-scope precedence or aggregation. The runtime currently enforces only canonical project scope by design.

### 4. External policy engine

Introduce an OPA-backed `PolicyDecisionProvider` only after a real OPA endpoint, deployment, Rego/bundle contract, and operational configuration exist. Do not claim OPA is active beforehand.

### 5. Retrieval authority/temporal normalization

Normalize temporal freshness and authority semantics across `governance.semantic_embeddings.metadata` before adding global temporal/authority weighting. Current metadata is heterogeneous and cannot safely support a universal ranking formula.

### 6. External observability export

Add an OTLP exporter only when a verified backend/endpoint/configuration exists. Internal W3C trace correlation already works and should remain independent from external exporter availability.

## Important files for continuation

- `Architecture/README.md`
- `Architecture/2026-09-08-ADR-006-ai-intelligence-learning-governance-evaluation-and-observability.md`
- `lib/ai/intelligent-router.ts`
- `lib/ai/observable-intelligent-router.ts`
- `lib/ai/governance-intelligent-router.ts`
- `lib/ai/reasoning-provider.ts`
- `lib/ai/reasoning-budget-policy.ts`
- `lib/ai/governance-reasoning-budget-policy.ts`
- `lib/ai/reasoning-budget-admission.ts`
- `lib/ai/governance-reasoning-budget-admission.ts`
- `lib/ai/governance-trace-timeline.ts`
- `lib/ai/trace-invocation-evidence.ts`
- `lib/ai/retrieval-evaluation.ts`
- `lib/ai/retrieval-evaluation-dataset.ts`
- `lib/ai/governance-retrieval-evaluation-dataset.ts`
- `lib/ai/retrieval-benchmark-runner.ts`
- `lib/ai/governance-retrieval-benchmark.ts`
- `lib/governance/policy-decision-provider.ts`
- `lib/governance/governance-policy-decision-provider.ts`
- `supabase/migrations/20260908203507_adr006_resource_budgets_and_execution_controls.sql`
- `supabase/migrations/20260909112000_adr006_atomic_project_budget_admission.sql`

## Continuation discipline

The next engineer/agent should inspect real main, production deployment, live Supabase schema/data, and connected infrastructure before making changes. Continue autonomously using the loop:

`inspect -> implement -> verifier/tests -> PR -> exact-head CI -> merge only green -> verify exact production SHA -> continue`

If a requested feature is blocked, state the exact missing file/schema/data/infrastructure contract instead of approximating it.