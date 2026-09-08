# DataNexus AI production architecture state and truth boundaries

Date: 2026-09-08
Baseline main: `612698462804291c83b86d6d3ba7d7ee1134b1a4`
Project: `479813aa-72a4-4b12-b72a-74da8d2419ce`

## Purpose

This document records the production architecture reached after the two-table Databricks E2E acceptance, adaptive scheduler work, AI capability operationalization, enterprise governance corpus approval, and a governed remediation/reprofile/verification cycle.

It is intended to be a durable architectural checkpoint, not a claim that every capability is source-authoritatively evidenced.

## Production topology

- Vercel hosts the DataNexus application and orchestration/control-plane APIs.
- Supabase is the durable governance/control plane and stores catalog, profiling, DQ, workflow, remediation, knowledge, orchestration and AI evidence.
- Native Databricks/JDBC execution supplies physical source data for the scoped Databricks assets.
- The generic JDBC bridge remains a replaceable execution runtime, not governance authority.
- Durable work is coordinated through `orchestration.job_queue`, outbox events, persisted job dependencies, and bounded workers.

## Scoped Databricks assets

Source ID: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`

1. `pub.gold.customer_water_consumption_behavior_profile_metrics`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`

Stable governed dataset IDs:

- profile: `858d8627-722b-4caa-a473-92ec594cafe5`
- drift: `232244ed-74c0-4b98-99da-d3d7f280efed`

Current governed v3 dataset-version IDs:

- profile: `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

## Scheduler architecture now in production

The original worker model had minute-scale queue boundaries and serial processing of claimed jobs. Production now uses:

1. database-triggered event wake-up with cron retained as recovery;
2. bounded parallel dispatch;
3. source-aware concurrency using governed `source_id` rather than URLs or credentials;
4. stateful AIMD-style source concurrency control;
5. persisted `orchestration.job_dependencies` edges;
6. claim-time dependency enforcement and truthful dependency cancellation;
7. critical-path weighting over already-persisted DAG descendants;
8. workload characterization with explicit evidence quality;
9. truth-aware automatic sampling;
10. strong-fingerprint profiling evidence reuse for eligible FILE/CSV sources;
11. incremental-execution eligibility telemetry without pretending an unavailable change boundary exists.

Measured production results include event-driven profiling queue waits around 1.7 to 2.2 seconds in the scoped acceptance/canary runs, compared with roughly 53 seconds before event-driven dispatch. Profile-to-DQ fan-out is also event-driven.

### Dependency semantics

Persisted job dependencies are scheduler structure only. They are not physical/source lineage.

A `SUCCESS` dependency blocks the child until its predecessor succeeds. If the predecessor becomes `DEAD` or `CANCELLED`, the dependent child is cancelled without consuming its own retry attempts. This avoids falsely representing dependency failure as child execution failure.

## Profiling truth boundaries

### Sampling

For the scoped Databricks tables, source-authoritative row cardinality and byte size are unavailable. Therefore production profiling uses a bounded sample and records:

- `coverage_scope = SAMPLED_OBSERVATION`
- `full_source_coverage_claimed = false`
- planner reason `UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE`

A connector returning exactly the requested cap does not convert the observation into a full-source scan.

### Evidence reuse

FILE/CSV reuse is allowed only with a strong fingerprint based on actual source bytes plus exact schema/configuration/engine/metric contract. Production CSV canaries proved reuse with `SOURCE_BYTES_SHA256` authority.

Databricks/JDBC reuse is not enabled from `catalog.dataset_versions.content_hash`. `catalog.promote_approved_asset()` currently derives that value from the discovered asset `structure_hash`, so it is schema/structure evidence, not a source-content freshness fingerprint.

### Incremental execution

Incremental execution is not activated unless the execution source persists a source-observed, ordering-proven change boundary such as a watermark/cursor/CDC token. The scoped Databricks execution sources currently do not have such evidence in `profiling.dataset_execution_sources.execution_config`.

The truthful planner result is therefore:

- `FULL_OR_SAMPLED_REQUIRED`
- `CHANGE_BOUNDARY_UNAVAILABLE`

## AI and governance architecture

### AI Insights

`/ai-insights` surfaces evidence-backed health, deterministic findings, DQ investigation, predictive risk, pending controls and AI governance suggestions. Protected governance evidence is read server-side after project authorization.

AI recommendations remain advisory. Human acceptance of an AI recommendation does not make it source authority.

### 75-capability control center

`/ai-capabilities` operationalizes the 75-capability matrix using live evidence. The matrix is evidence-state reporting, not a claim that every capability executes for every dataset.

Current production state after the governance-corpus and remediation work:

- 72 `EVIDENCED`
- 3 `DATA_PENDING`
- 0 `BOOTSTRAP_ONLY`
- 0 `NOT_EVIDENCED`

The three pending capabilities are #31 Data lineage interpretation, #32 Impact analysis, and #52 Agent based data architect.

### Capability #59

AI-generated governance recommendations are backed by `governance.ai_governance_suggestions`. Recommendation identity uses stable evidence state, while the capability matrix counts current recommendation contexts rather than all historical audit rows.

### Enterprise governance corpus

Two INTERNAL enterprise governance documents were approved through the governed `policy.approve` path:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

They are approved, non-synthetic enterprise material and make policy authority ready. Synthetic bootstrap material must never be promoted merely to clear a capability status.

### Capability #45

Capability #45 is now evidenced by a real governed remediation lifecycle, not by the existence of an action-tracking row.

The matrix contract was hardened so only remediation outcomes with status `VERIFIED` count as evidence.

The production verification corrected a real blank email in the governed CSV fixture, executed a fresh profile and DQ run against changed source bytes, reduced one failed HIGH control to zero failed controls, resolved the tracked issue, and persisted a verified remediation outcome.

## Source lineage truth boundary

The remaining 3/75 gap is external/source-authoritative lineage evidence.

Do not infer or promote AI-inferred lineage as Databricks source-observed lineage. The required source evidence is still blocked by Databricks access to:

- `system.access.table_lineage`
- `system.access.column_lineage`
- the required `USE SCHEMA`/object privileges on `system.access`

Until that evidence is ingested into the governed lineage model, capabilities #31, #32 and #52 must remain `DATA_PENDING`.

## Non-negotiable authority rules

- Physical/source metadata is source-authoritative only when actually observed from the source.
- DataNexus governance state is authoritative for DataNexus governance decisions.
- Observation is not governance authority.
- AI recommendation is not human approval.
- Inferred lineage is not source-observed lineage.
- Human acceptance of AI inference does not transform it into source-observed lineage.
- Stable identity is preferred over mutable path identity.
- Foreign keys are structural `REFERENCES`, not transformations.
- Failed evidence must not be deleted merely to make acceptance green.
- RLS/security must not be weakened to clear warnings.
- DQ proposals remain disabled until governed approval.

## Current architectural next step

The primary remaining capability closure is Databricks source-authoritative table and column lineage ingestion. The next agent should first re-check current main and production state, then exercise the native lineage collector. If Databricks still rejects `system.access`, report the exact privilege failure and required grant rather than fabricating lineage.