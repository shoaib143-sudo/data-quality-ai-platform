# DataNexus AI production operating state and continuation

Date: 2026-09-08
Baseline main SHA: `2f9d51354ff7ebe06023df9696e9f6a745529c1c`

## Purpose

This document records the production architecture and truth boundaries after the September 8 E2E acceptance, scheduler optimization, AI capability, governance-corpus, remediation-verification, profiling-audit, Databricks-lineage revalidation, and ADR-006 AI runtime-governance work. It is intended to let the next engineer continue from evidence rather than reconstructing the platform from chat history.

## Production topology

- Vercel hosts the DataNexus application/control plane.
- Supabase is the governance, catalog, profiling, orchestration, evidence, and authorization control plane.
- Native Databricks integration is used for the governed Databricks source.
- A Java 21/Spring Boot JDBC bridge on Render remains a replaceable execution runtime, not a governance authority.
- Durable orchestration is based on `orchestration.job_queue`, outbox processing, persisted dependencies, event-driven worker wake-up, and cron as recovery.

## Scoped Databricks acceptance assets

Project: `479813aa-72a4-4b12-b72a-74da8d2419ce`

Governed Databricks source: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`

Tables:

1. `pub.gold.customer_water_consumption_behavior_profile_metrics`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`

Stable dataset identities:

- profile: `858d8627-722b-4caa-a473-92ec594cafe5`
- drift: `232244ed-74c0-4b98-99da-d3d7f280efed`

Current governed v3 versions used in acceptance:

- profile: `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

## Latest two-table E2E acceptance

A fresh latest-main acceptance was run for both governed v3 Databricks tables through the real durable Profiling Agent v2.0 and downstream DQ path.

Observed results:

| Asset | Profiling | DQ | Observed rows | Columns | Findings | Quality score | Proposed controls | Enabled controls |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| drift metrics | succeeded | succeeded | 1,000 | 22 | 12 | 0.5455 | 8 | 0 |
| profile metrics | succeeded | succeeded | 1,000 | 29 | 17 | 0.5494 | 8 | 0 |

Both profiling jobs were claimed event-driven in about 1.739 seconds. Downstream DQ fan-out completed automatically. The 1,000 rows are explicitly `SAMPLED_OBSERVATION`, not full-source cardinality evidence.

## September 8 live lineage revalidation and profiling-audit closure

A release-state live canary was executed at approximately 2026-09-08 13:31 UTC against the governed Databricks source and the selected object `pub.gold.customer_water_consumption_behavior_profile_metrics` through the deployed `dgp-databricks-connector` using its governed Supabase Vault `credential_ref`.

The connector successfully reached Databricks and attempted both authoritative queries, but Databricks rejected both:

- `system.access.column_lineage`: `[INSUFFICIENT_PERMISSIONS] User does not have USE SCHEMA on Schema 'system.access'. SQLSTATE: 42501`
- `system.access.table_lineage`: `[INSUFFICIENT_PERMISSIONS] User does not have USE SCHEMA on Schema 'system.access'. SQLSTATE: 42501`

The connector returned HTTP 200 because lineage availability is represented as explicit warnings rather than transport failure. It returned zero transformations, `complete=false`, and correctly identified `system.access.column_lineage` and `system.access.table_lineage` as the authoritative sources. This proves the remaining lineage gap is an external Databricks authorization boundary, not a missing DataNexus native-query implementation.

The production profiling audit path introduced by PR #106 was also revalidated directly in Supabase:

- 43 completed profile runs exist across production and all 43 have corresponding `PROFILING_RUN_COMPLETED` audit events.
- The target DataNexus project has 41 `PROFILING_RUN_COMPLETED` audit events and all 41 are chain-version-3 rows with non-null sequence and event hash.
- The target project's chain-version-3 segment contains 364 hashed rows with zero broken links and zero missing hashes.
- Older chain-version-1 rows intentionally predate sequence numbering, and chain-version-2 contains two historical discontinuities. Those legacy states must not be misreported as a current chain-version-3 integrity failure.

No audit repair migration is required for the current v3 acceptance path.

## Adaptive scheduler architecture

The scheduler evolved from minute-cron serial processing to the following production model:

- event-driven durable queue wake-up with cron retained as recovery;
- bounded parallel execution;
- project capacity policy enforcement;
- source-aware concurrency using stable governed `source_id`;
- AIMD-style adaptive source concurrency;
- persisted `orchestration.job_dependencies` DAG edges;
- dependency-aware claim blocking and failure propagation;
- bottom-level critical-path weighting over persisted downstream jobs;
- workload characterization from observed execution history;
- queue-wait and planner telemetry;
- truth-aware automatic sampling;
- truth-aware incremental eligibility planning.

Measured production improvements include roughly 2-second initial queue waits versus roughly 53 seconds in the earlier cron-bound canary. Same-source profiling and DQ branches have been proven to execute concurrently within governed source limits.

### DAG truth boundary

`orchestration.job_dependencies` is scheduler structure. It is not source lineage. Profile-to-DQ dependencies are persisted as execution dependencies and must never be presented as Databricks-observed technical lineage.

## Sampling truth boundary

Automatic sampling follows these rules:

- explicit dataset sampling policy wins;
- auto-FULL is permitted only when source-observed row and byte evidence justify it;
- unknown source cardinality remains a bounded deterministic sample;
- current Databricks tables report `UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE`;
- `full_source_coverage_claimed=false` for those sampled observations;
- duplicate metric basis is `SAMPLE`, not `FULL_DATASET`, when coverage is sampled.

Do not use profiled row counts as source cardinality.

## Evidence reuse

Strong evidence reuse is production-proven for FILE/CSV sources only.

Eligibility requires a direct executed source run and exact compatible fingerprints, including actual source-byte SHA-256 authority. Reused evidence is materialized atomically into a new profile run and records its source run and fingerprint authority.

For native/JDBC Databricks, reuse remains deliberately ineligible. `catalog.promote_approved_asset()` currently derives `catalog.dataset_versions.content_hash` from the discovered structure hash, so that value is schema/structure evidence, not source-content freshness evidence. It must not be used to infer unchanged Databricks contents.

## Incremental execution

Incremental eligibility planning is deployed, but current Databricks execution bindings are not eligible.

Required evidence includes a source-observed, ordering-proven change boundary such as a monotonic watermark/CDC cursor with known previous/current values. Current `profiling.dataset_execution_sources.execution_config` contains no authoritative incremental boundary for the two scoped Databricks tables.

Expected planner result:

- execution mode: `FULL_OR_SAMPLED_REQUIRED`
- reason: `CHANGE_BOUNDARY_UNAVAILABLE`

Do not infer a change boundary from timestamps, schema hashes, profile hashes, or sampled data.

## AI and governance state

The AI Insights workspace and 75-capability control center are production features. Governance recommendations are advisory only and do not become governance authority by being generated or accepted.

The current matrix after governance-corpus approval and verified remediation is:

- 75 total capabilities
- 72 `EVIDENCED`
- 3 `DATA_PENDING`
- 0 `BOOTSTRAP_ONLY`
- 0 `NOT_EVIDENCED`

Capability #59, AI-generated governance recommendations, is evidenced from current recommendation contexts rather than historical row volume.

## ADR-006 production AI runtime and routing governance

The September 8 ADR-006 implementation is now production-live through a sequence of verified exact-head releases. The latest production main SHA is `2f9d51354ff7ebe06023df9696e9f6a745529c1c`, deployed by Vercel deployment `dpl_9xScAraxc48zTVvN7HyeK5g8Evnh` to the canonical `data-quality-ai-platform.vercel.app` alias.

Production slices now present:

- `ReasoningProvider` and environment-backed Model Gateway remain the replaceable runtime provider boundary.
- `RetrievalProvider` provides governed retrieval projection behavior.
- `TelemetryProvider` persists append-only AI runtime telemetry in `governance.ai_telemetry_events` and rejects prompt/completion/hidden-reasoning payloads.
- `EvaluationEngine` persists append-only automated evaluation evidence in `governance.ai_evaluation_results` and exposes the read-only `governance.ai_evaluation_scorecard(...)` projection.
- `ModelRegistry` reads governed current AI-system versions and attaches evaluation scorecards without creating lifecycle authority.
- `Intelligent Router` ranks only already-routing-eligible governed candidates by measured evaluation evidence and fails closed on registry failure or when ACTIVE governed candidates cannot be executed.
- governed routing-policy versions are persisted in `governance.ai_routing_policy_versions` and can further restrict routing by task, sensitivity, risk, explicit AI-system allowlist, minimum evaluation score, minimum scored evidence count, and environment-fallback permission.

Key release points:

- PR #114: TelemetryProvider
- PR #115: EvaluationEngine
- PR #116: governed ModelRegistry
- PR #117: evaluation-aware Intelligent Router
- PR #118: governed routing-policy enforcement

Routing authority remains human-controlled. The existing `governance.review_ai_system_version(...)` path requires `policy.approve`; an exact current version becomes `ACTIVE` only after human `APPROVED`, while registration of a new current version returns the system to `DRAFT`. Automated evaluation, telemetry, model ranking, and routing policy cannot activate or approve a model.

Current target-project truth:

- four registered AI systems exist, all synthetic/demo and `DRAFT`;
- zero governed AI-system versions are currently routing-eligible;
- zero `governance.ai_routing_policy_versions` rows exist for the target project;
- zero governed AI-system lifecycle assessments existed at the time the EvaluationEngine slice was validated;
- therefore the environment Model Gateway remains the actual reasoning runtime path today when the Intelligent Router is used, because no human-approved ACTIVE governed candidate exists and no explicit routing policy has been published.

Routing-policy publication is append-only governance evidence. `governance.publish_ai_routing_policy(...)` requires a human reviewer with `policy.approve`, validates any AI-system allowlist against the same project, and writes an `AI_ROUTING_POLICY_PUBLISHED` audit event. Authenticated project members can read routing-policy rows but cannot publish them. Service role can append but cannot update/delete. `governance.resolve_ai_routing_policy(...)` is a service-role-only `SECURITY INVOKER` read path.

No routing policy should be manufactured merely to exercise the feature, and synthetic DRAFT models must not be activated to make routing appear governed. User authorization to continue engineering work is not AI-system approval or routing-policy approval.

## Enterprise governance corpus

Two non-synthetic INTERNAL enterprise documents were approved through the governed `policy.approve` path and are now `ACTIVE/APPROVED`:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

This moved policy/knowledge capabilities from bootstrap-only to enterprise-backed evidence. Human approval was required and recorded. Synthetic bootstrap material was not elevated into enterprise authority.

## Capability #45 remediation verification

Capability #45 is now backed by a real verified remediation, not merely an action-tracked row.

The governed CSV lifecycle fixture contained a blank email for `CUST-0011 / Karen Goh`, causing one HIGH email-format control failure. The remediation workflow was human-approved, a governed issue/outcome was created, and PR #98 changed the source row to a valid email. A fresh profile and downstream DQ run executed against a new source-byte hash rather than reusing the old bad evidence.

Verification result:

- before: 1 failed HIGH control
- after: 0 failed controls
- tracked issue: resolved
- remediation outcome: `VERIFIED`
- outcome ID: `0929a3b1-eb1d-41fd-999d-122907af6261`

PR #99 hardened `governance.generate_ai_capability_matrix(...)` so capability #45 counts only `VERIFIED` remediation outcomes.

## Remaining three capability gaps

Only these remain `DATA_PENDING`:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent-based data architect

The exact blocker is source-authoritative Databricks field lineage. The September 8 live canary confirmed that the configured production Databricks identity can reach the workspace and execute governed connector requests, but Databricks denies both authoritative lineage queries with SQLSTATE `42501` because the identity lacks `USE SCHEMA` on `system.access`.

Required Databricks access/evidence:

- `USE SCHEMA` on `system.access`
- read access to `system.access.table_lineage`
- read access to `system.access.column_lineage`

Until that evidence is ingested, `governance.lineage_column_mappings` must not be populated with fabricated source-authoritative mappings. It currently contains zero mappings. AI inference, FK relationships, human acceptance, or scheduler DAG edges do not satisfy this boundary.

When the Databricks grant is changed, rerun the existing native lineage path before making any code changes. Only a successful source-observed result with real column mappings can clear capabilities #31/#32/#52.

## Non-negotiable truth and governance rules

1. Source physical metadata is source-authoritative.
2. DataNexus governance state is governance-authoritative.
3. Observation is not governance authority.
4. AI recommendation is not human authority.
5. Inferred lineage is not source-observed lineage.
6. Human acceptance of an AI inference does not convert it into source-observed lineage.
7. Stable identity is preferred over mutable path identity.
8. Never fabricate ownership, classification, controls, lineage, transformations, approvals, remediation, or quality evidence.
9. Never weaken RLS/security to make tests pass.
10. Never delete failed evidence merely to make platform state look successful.
11. Foreign keys are structural `REFERENCES`, not transformations.
12. User authorization to execute/fix is not approval of DQ suggestions, AI-system lifecycle approval, or routing-policy approval.
13. Do not auto-promote unrelated assets, auto-approve DQ recommendations, activate synthetic AI systems, or publish routing policy without the required human governance authority.

## Continuation order

The next agent should:

1. Re-resolve current GitHub main, Vercel production SHA, and Supabase state before making claims.
2. Treat the ADR-006 runtime stack as production-live: provider boundaries, telemetry, evaluation, governed model registry, Intelligent Router, and governed routing-policy contract are present.
3. Preserve current AI authority truth: the target project has zero ACTIVE governed models and zero routing-policy rows unless fresh evidence shows otherwise. Do not activate or publish merely to exercise the path.
4. Treat the native Databricks lineage implementation as present and the September 8 live canary as proof of the current external authorization boundary.
5. Do not synthesize lineage or weaken evidence authority while `system.access` remains denied.
6. After the Databricks identity receives `USE SCHEMA` on `system.access` plus read access to `system.access.table_lineage` and `system.access.column_lineage`, rerun the live native lineage canary immediately.
7. If access is available, ingest the returned source-observed table and column lineage through `governance.ingest_lineage_batch_atomic`, verify real rows in `governance.lineage_column_mappings`, refresh governance intelligence, regenerate the 75-capability matrix, and require 75/75 only if the evidence is genuinely present.
8. Preserve the current profiling audit acceptance: completion events are covered and the active chain-version-3 segment has zero broken links.
9. Continue ADR-006 observability by attaching route-decision/fail-closed outcomes to the existing TelemetryProvider if doing so can be implemented without prompt/hidden-reasoning capture and without changing routing authority.
10. Run full CI, merge only exact verified heads, apply migrations only when required, verify exact-main deployment, and rerun production acceptance after changes.
