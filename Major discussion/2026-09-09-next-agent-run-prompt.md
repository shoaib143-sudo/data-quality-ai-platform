# DataNexus AI — next-agent run prompt

Use the following prompt to hand active engineering work to another capable agent.

---

You are taking over active engineering work on **DataNexus AI**. Do not restart from scratch and do not ask the user to repeat information already documented. Inspect the real repository, production deployment, production database, and connected infrastructure before making changes. Continue autonomously until you reach a genuine technical/data/authority blocker.

## Project

- Repository: `shoaib143-sudo/data-quality-ai-platform`
- Production: `https://data-quality-ai-platform.vercel.app/`
- Current production/main SHA at handoff: `0b4f365144b3f13624db0ab78ff85d6729659738`
- Supabase project ref: `tvjnavjxuehpesxcfvrx`
- Target DataNexus project UUID: `479813aa-72a4-4b12-b72a-74da8d2419ce`
- Vercel project: `prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR`
- Vercel team: `team_rHi9EXWHJwXXxejgVBYUJFJq`
- Render JDBC service: `datanexus-jdbc-bridge` / `srv-daeh498n74is73dqnskg`

Read these first:

1. `Architecture/README.md`
2. `Architecture/2026-09-08-ADR-006-ai-intelligence-learning-governance-evaluation-and-observability.md`
3. `Architecture/2026-09-09-ADR-006-implementation-state-and-next-targets.md`
4. `Architecture/2026-09-08-production-operating-state-and-continuation.md`
5. This handoff prompt.

## Future state

Build DataNexus into a governed AI/data control plane where models are replaceable workers and DataNexus owns authority, identity, policy, routing, evidence, learning, evaluation, resource controls, audit, observability, and approvals. The system should progressively support autonomous specialist agents, but autonomy must remain evidence-backed, policy-controlled, observable, reversible where appropriate, and clearly separated from human/governance authority.

## Non-negotiable architecture rules

- PostgreSQL/Supabase is authoritative for governance state/evidence.
- Observation != governance authority.
- AI suggestion != human/governed authority.
- Inferred lineage != source-observed lineage.
- W3C trace ID != execution/business identity.
- Execution authorization != DQ/model approval.
- Resource budgets are execution/quota controls, not model approval/deployment authority.
- Never fabricate evidence, provenance, labels, policy, pricing, usage, lineage, or evaluation results.
- Never weaken RLS or bypass governance to make a feature work.
- Command Center remains read-only and `admin.manage` authorized.
- Governance lifecycle remains append-only/versioned; no automatic activation/promotion authority.
- Databricks `system.access` lineage permission work is excluded from this workstream. Do not spend time trying to bypass that external permission boundary.
- Merge only exact-head green CI. After merge, verify the exact merged SHA is READY in production.

## What has already been built

The major ADR-006 work from PRs #131-#168 is merged.

### AI governance / control plane

- Read-only AI Command Center covering governance state, evaluation evidence, learning candidates, routing policies, investigations, audit evidence, resource controls, retrieval readiness, atomic admissions/leases, Explorer, and W3C trace timeline.
- Stable `PolicyDecisionProvider` with fail-closed behavior and exact current policy-version semantics.
- Emergency execution PAUSE/KILL enforcement.

### Model routing / reasoning

- Stable ReasoningProvider/Model Gateway/Intelligent Router boundaries.
- Governed model registry/routing policy/evaluation-aware selection.
- Provider-observed latency/token usage/request ID only; no usage estimation.
- Provider error bodies are redacted; only sanitized HTTP status/request correlation may be observed.
- Optional caller output-token ceiling plus canonical PROJECT-scope output-token enforcement.

### Resource-budget enforcement

PROJECT/PROJECT runtime enforcement is now real:

- `max_output_tokens_per_request` enforced before provider invocation.
- `max_requests_per_minute` enforced atomically.
- `max_concurrent_executions` enforced through atomic leases.
- Exact policy version is used for admission.
- Distinct UUID `executionCorrelationId` is used for execution accounting.
- W3C trace correlation stays separate.
- Acquired concurrency leases are released in `finally`; TTL is the fallback.
- Command Center and trace timeline expose safe read-only admission evidence.

Canonical schema/functions include:

- `governance.ai_resource_budget_policy_versions`
- `governance.ai_resource_budget_policy_effective`
- `governance.ai_resource_budget_request_admissions`
- `governance.ai_resource_budget_concurrency_leases`
- `governance.acquire_ai_project_resource_budget_admission(...)`
- `governance.release_ai_project_resource_budget_lease(...)`

### Retrieval / reranking / evaluation

- Dedicated RerankerProvider seam with deterministic baseline.
- Retrieval relevance evaluation with MRR@K, nDCG@K, Recall@K.
- Canonical append-only governed relevance cases/judgments.
- Only `HUMAN_REVIEWED` / `GOVERNED_IMPORT` label authority.
- Authenticated atomic human relevance-label recording behind `admin.manage`.
- Governed benchmark runner and benchmark execution endpoint.
- Retrieval readiness in Command Center.
- No automatic reranker promotion authority.

### Observability

- Canonical `governance.ai_telemetry_events` with W3C trace fields.
- Governed agent stage/handoff/policy/model invocation correlation.
- Strict whitelisted trace projections; raw telemetry attributes do not reach Command Center.
- Execution correlation, provider request correlation, routing policy, output ceilings, admission/lease evidence, and W3C traces remain separately identified.

## Current live target-project state

At handoff, read-only production queries for project `479813aa-72a4-4b12-b72a-74da8d2419ce` show:

- resource-budget effective rows: `0`
- budget request admissions: `0`
- concurrency leases: `0`
- governed retrieval case versions: `0`
- retrieval relevance judgments: `0`
- retrieval relevance evaluation results: `0`

This is not an error. The runtime capability exists, but no policy/labels/evidence should be invented or seeded simply to make the UI look active.

## Current genuine blockers / unresolved architecture

1. **AI cost enforcement**: no authoritative provider/model pricing contract. Do not enforce `max_cost_usd_per_request` or `max_cost_usd_per_day` using guessed prices or telemetry approximations.
2. **Budget scope composition**: PROJECT, AI_SYSTEM, and AGENT policies exist as independent scopes, but cross-scope precedence/aggregation semantics are not defined. Do not invent `strictest wins` or `most specific wins`.
3. **Model-backed reranker selection**: infrastructure exists, but target project has zero governed relevance labels/results. Do not create pseudo-labels from model output or remediation data.
4. **OPA PDP**: no deployed OPA service, endpoint/config, or Rego/bundle contract exists. Existing in-platform PDP remains canonical.
5. **Temporal/authority retrieval weighting**: `governance.semantic_embeddings.metadata` is heterogeneous and lacks normalized cross-object authority/freshness semantics.
6. **External OTLP export**: internal W3C telemetry is live, but no verified external OTLP endpoint/backend exists.

## Recommended next work, in order

### A. Canonical cost accounting

Design a provider/model pricing contract with explicit currency, unit price, effective version/date, and authoritative source. Keep pricing separate from observed token usage. Once accepted, add atomic project cost accounting keyed to exact budget policy version + execution correlation, then enforce per-request/daily project cost limits. Do not implement until the pricing authority contract is explicit.

### B. Retrieval benchmark data and reranker adoption

Use the existing authenticated human relevance-label recorder to collect genuine governed labels. Run the existing benchmark against current deterministic reranking and candidate model rerankers. Persist metrics through EvaluationEngine. Adopt a model-backed reranker only when DataNexus-specific labeled evidence shows improvement.

### C. Budget scope ADR

Define and accept explicit semantics for how PROJECT, AI_SYSTEM, and AGENT limits compose. Only after that decision should runtime enforce more than PROJECT scope.

### D. OPA / external telemetry / authority-aware retrieval

Implement these only when their missing infrastructure or normalized data contracts are real and verifiable.

## Important files

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

## Operating method

Do not answer with a plan only. Perform the actual engineering work autonomously.

For each slice:

1. Inspect current `main`, production, schema/data, and relevant files first.
2. Cut from exact current main.
3. Implement the smallest complete architecture-safe slice.
4. Add/extend behavioral tests and static verifiers.
5. Open a PR.
6. Validate the exact PR head: ADR-006 checks, Quality Gate, production build, HTTP SLO/JDBC where triggered, and Vercel preview.
7. Fix failures; never merge red/pending CI.
8. Merge with expected-head protection.
9. Verify the exact merge SHA is READY on production.
10. Continue to the next implementable gap.

If blocked, report the exact missing file/schema/data/infrastructure contract. Do not approximate around it.

**Start by re-reading current main and checking whether any PR/branch landed after SHA `0b4f365144b3f13624db0ab78ff85d6729659738`. Then continue the highest-value safe unfinished slice.**

---
