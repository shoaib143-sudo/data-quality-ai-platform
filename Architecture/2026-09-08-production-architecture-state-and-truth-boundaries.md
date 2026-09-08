# DataNexus AI production architecture state and truth boundaries

Date: 2026-09-08
Baseline main SHA: `612698462804291c83b86d6d3ba7d7ee1134b1a4`
Production: `https://data-quality-ai-platform.vercel.app/`
Supabase project: `tvjnavjxuehpesxcfvrx`
Primary project: `479813aa-72a4-4b12-b72a-74da8d2419ce`
Databricks source: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`

## Executive state

DataNexus has completed a production E2E execution for the two governed Databricks tables and now reports a 75-capability AI matrix of **72 EVIDENCED / 3 DATA_PENDING / 0 BOOTSTRAP_ONLY / 0 NOT_EVIDENCED**.

The three remaining DATA_PENDING capabilities are #31 Data lineage interpretation, #32 Impact analysis, and #52 Agent based data architect. They depend on source-authoritative Databricks field-lineage evidence that is not currently available to DataNexus.

## Scoped Databricks assets

1. `pub.gold.customer_water_consumption_behavior_profile_metrics`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`

Stable dataset IDs:

- profile: `858d8627-722b-4caa-a473-92ec594cafe5`
- drift: `232244ed-74c0-4b98-99da-d3d7f280efed`

Current governed v3 version IDs:

- profile: `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

## Production execution architecture

### Durable orchestration

The production scheduler evolved from minute-cron serial processing into an event-driven, dependency-aware scheduler.

Current properties:

- durable queue: `orchestration.job_queue`
- event-driven wake through a database-side `pg_net` worker kick
- cron retained as recovery, not primary dispatch
- bounded parallel execution
- source-aware concurrency using governed `source_id`
- stateful AIMD source concurrency control
- persisted DAG edges in `orchestration.job_dependencies`
- dependency-aware claim functions
- failed required predecessors cancel dependent jobs rather than consuming child retries
- critical-path weighting over already-persisted DAG descendants
- workload characterization from governed evidence and historical runtime
- queue-wait and scheduler telemetry
- profile -> DQ fan-out processed through event/outbox convergence

Measured production behavior moved from roughly 53 seconds initial queue wait in the first scheduler canary to about 2 seconds event-driven enqueue-to-claim. Downstream DQ queue waits have been observed around 1-4 seconds. Parallel profiling and DQ execution for the two scoped Databricks tables has been proven in production.

### Profiling execution

Profiling Agent v2.0 remains the authoritative profiling path. Within a profile run, stages remain sequential:

1. `profile_dataset`
2. `execute_metrics`
3. `investigate_profile`

Independent datasets/jobs may execute concurrently subject to scheduler/source capacity.

Automatic sampling is truth-aware:

- explicit dataset sampling policy always wins
- automatic FULL coverage is allowed only when source-observed cardinality and byte-size evidence justify it
- unknown source cardinality uses bounded deterministic sampling
- sampled evidence is marked `SAMPLED_OBSERVATION`
- `full_source_coverage_claimed=false` for sampled runs
- duplicate metrics report `SAMPLE`, not `FULL_DATASET`, when coverage is sampled

For the scoped Databricks tables, current production behavior is a 1,000-row safe sample with reason `UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE`.

### Incremental execution boundary

Incremental eligibility is implemented as a truth-aware planner gate. It does not enable incremental reads unless a connector persists a source-observed, ordering-proven change boundary such as a watermark/CDC cursor.

Current Databricks execution bindings have no authoritative `incremental_boundary` in `profiling.dataset_execution_sources.execution_config`. Therefore the correct planner result is:

- execution mode: `FULL_OR_SAMPLED_REQUIRED`
- reason: `CHANGE_BOUNDARY_UNAVAILABLE`

Do not infer an incremental boundary from timestamps, schema hashes, profile hashes, or sampled data.

### Evidence reuse boundary

Evidence reuse is enabled only where a strong freshness fingerprint exists.

FILE/CSV sources may reuse profiling evidence when actual source bytes have the same SHA-256 and the schema, engine, sampling, configuration, metric contract, dataset version, and project all match. Reuse materializes new evidence atomically through `profiling.reuse_profile_evidence(...)`; it does not point the new run at mutable old evidence. Reuse chains are not allowed.

Databricks/JDBC profiling evidence must not currently be reused based on `catalog.dataset_versions.content_hash`. Investigation showed `catalog.promote_approved_asset()` populates both `content_hash` and `schema_hash` from the discovered asset `structure_hash`. That is structure/schema evidence, not source-content freshness evidence.

### Governance and AI evidence

AI suggestions are advisory and never governance authority. Human approval remains required where policy/control authority is involved.

Capability #59 AI generated governance recommendations is evidenced through `governance.ai_governance_suggestions`. Matrix counts use current recommendation contexts, not all historical audit rows.

Enterprise governance corpus readiness is now real rather than synthetic-only. Two INTERNAL governance documents were explicitly human-approved and activated:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

`governance.governance_knowledge_readiness()` reports approved non-synthetic enterprise material and `policy_authority_ready=true`. Synthetic bootstrap documents must never be treated as enterprise authority.

### Remediation verification boundary

Capability #45 Verification after remediation now requires terminal `VERIFIED` remediation outcomes. Merely tracking or planning remediation is not verification evidence.

A real governed CSV remediation cycle was completed:

- failing HIGH email-format control identified
- workflow passed `policy.approve`
- governed issue/outcome created
- source defect corrected through reviewed PR #98
- production deployment verified
- fresh profiling executed against changed source bytes
- downstream DQ executed
- failed HIGH controls improved from 1 to 0
- tracked issue resolved
- remediation outcome `0929a3b1-eb1d-41fd-999d-122907af6261` formally marked `VERIFIED`

PR #99 changed the matrix contract so #45 counts only `VERIFIED` outcomes.

## 75-capability production state

Current matrix after governance-corpus approval and verified remediation:

- EVIDENCED: 72
- DATA_PENDING: 3
- BOOTSTRAP_ONLY: 0
- NOT_EVIDENCED: 0
- TOTAL: 75

Remaining DATA_PENDING capabilities:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent based data architect

## Source-authoritative lineage blocker

DataNexus must not fabricate Databricks field lineage.

The remaining capabilities require real rows in the governed field-lineage evidence path, including `governance.lineage_column_mappings`, derived from source-observed Databricks lineage. The external blocker remains access to Databricks system lineage, including:

- `USE SCHEMA` on `system.access`
- readable `system.access.table_lineage`
- readable `system.access.column_lineage`

Until those permissions/data are available, inferred lineage, FK relationships, AI suggestions, and human acceptance of AI inference must not be relabeled as source-observed technical lineage.

## Non-negotiable truth boundaries

1. Source physical metadata is source-authoritative.
2. DataNexus governance state is governance-authoritative.
3. Observation is not governance authority.
4. AI recommendation is not human approval.
5. Inferred lineage is not source-observed lineage.
6. Human acceptance of an inference does not convert it into source-observed lineage.
7. Stable dataset identity is preferred over mutable path/name identity.
8. Never fabricate ownership, classification, controls, lineage, transformations, approvals, remediation, quality, or policy evidence.
9. Never weaken RLS/security to clear a warning.
10. Never delete failed/historical evidence merely to make state appear successful.
11. Foreign keys are structural `REFERENCES`; they are not transformation lineage.
12. User authorization to execute/fix work is not blanket approval of DQ recommendations.

## Important merged milestones

- PR #76 Adaptive Scheduler v1
- PR #77 AI Insights workspace
- PR #78 75-capability Control Center
- PR #79 capability #59 governance recommendations
- PR #82 current-context recommendation counting
- PR #83 event-driven durable worker wake
- PR #84 event/outbox convergence for downstream DQ
- PR #85 source-aware scheduling and queue telemetry
- PR #86 workload characterization/runtime estimation
- PR #87 persisted DAG dependencies
- PR #88 unknown workload-size truth fix
- PR #89 critical-path scheduling
- PR #90 stateful adaptive source concurrency
- PR #91 scheduler service-role planner access/fallback
- PR #92 automatic sampling planner
- PR #93 sampled duplicate-metric evidence correction
- PR #94 strong-fingerprint FILE/CSV evidence reuse
- PR #95 preserve source-byte fingerprint authority
- PR #96 incremental eligibility planning
- PR #98 governed CSV source remediation
- PR #99 capability #45 requires VERIFIED remediation evidence

## Next architecture priority

Close the final 3 DATA_PENDING capabilities only through source-authoritative Databricks lineage ingestion. First validate the live connector query path and current Databricks grants. If `system.access` remains denied, report the exact permission/data blocker and do not substitute inferred lineage as authoritative evidence.
