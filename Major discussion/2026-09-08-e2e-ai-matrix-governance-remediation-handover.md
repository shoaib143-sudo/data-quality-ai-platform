# September 8 E2E, AI capability matrix, governance, and remediation handover

## Executive state

DataNexus has completed a fresh production E2E execution for the two scoped Databricks tables and has moved the 75-capability AI matrix to **72/75 EVIDENCED**. The remaining three capabilities are all blocked by the same external source-authoritative Databricks field-lineage evidence boundary.

Baseline production main at this handover: `612698462804291c83b86d6d3ba7d7ee1134b1a4`.

## What was delivered

### 1. Two-table production E2E

The following governed Databricks tables were run through current production profiling and downstream DQ:

- `pub.gold.customer_water_consumption_behavior_profile_metrics`
- `pub.gold.customer_water_consumption_behavior_drift_metrics`

Both profiling and DQ branches succeeded. The final acceptance used stable dataset/version identities rather than mutable names.

Results:

- drift: 1,000 observed rows, 22 columns, 12 findings, score 0.5455, 8 proposed controls, 0 enabled;
- profile: 1,000 observed rows, 29 columns, 17 findings, score 0.5494, 8 proposed controls, 0 enabled.

No DQ proposal was auto-approved. The 1,000 rows are sampled observations, not source cardinality.

### 2. Adaptive scheduler and orchestration

The original dominant bottleneck was cron-bound serial durable-job processing. The scheduler was evolved through multiple production-proven stages:

- bounded parallel dispatch;
- event-driven `job_queue` wake-up with cron recovery;
- convergence across job queue and outbox so profile completion can materialize DQ immediately;
- source-aware concurrency;
- queue-wait telemetry;
- workload characterization;
- persisted DAG dependencies;
- dependency failure propagation;
- critical-path weighting;
- AIMD adaptive source concurrency;
- automatic sampling planner;
- incremental eligibility planner.

Measured initial queue wait dropped from roughly 53 seconds in the earlier canary to about 2 seconds in production event-driven runs. Downstream DQ waits were also reduced to low-single-digit seconds.

### 3. AI Insights and 75-capability control center

Production UI now includes:

- evidence-backed AI Insights;
- health/findings/investigation/risk/proposed-control views;
- explicit advisory-only governance recommendation boundary;
- operational 75-capability matrix with evidence status and evidence sources.

Capability #59 was implemented from `governance.ai_governance_suggestions`. Historical recommendation rows remain preserved, while the matrix uses current recommendation contexts rather than historical volume.

### 4. Governance corpus

The platform already had governed enterprise-document ingestion/review functions. Two real INTERNAL documents were advanced through the actual human `policy.approve` gate:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

They are now non-synthetic, `ACTIVE/APPROVED` enterprise governance evidence. This moved five policy/knowledge capabilities from `BOOTSTRAP_ONLY` to `EVIDENCED`.

### 5. Real remediation verification for capability #45

A real failing HIGH email-format control on the governed CSV lifecycle fixture was selected rather than manufacturing a Databricks remediation where no controls were enabled.

Defect:

- `CUST-0011 / Karen Goh` had a blank email.

Governed lifecycle:

1. existing remediation workflow reached `policy.approve`;
2. user explicitly approved the workflow;
3. governed issue and remediation outcome were created with `production_mutation_performed=false`;
4. draft PR #98 contained the one-row source correction;
5. Quality Gate exposed a verifier that intentionally expected the bad fixture, so that contract was updated to the approved corrected value;
6. PR #98 passed full CI and merged;
7. exact-main production deployment was verified;
8. issue resolution was recorded with source-change evidence;
9. a fresh profile ran against a new source-byte hash;
10. downstream DQ ran automatically;
11. failed HIGH controls improved from 1 to 0;
12. formal remediation verification passed all checks;
13. outcome `0929a3b1-eb1d-41fd-999d-122907af6261` became `VERIFIED`.

PR #99 then hardened the capability matrix so #45 counts only `VERIFIED` remediation outcomes. This prevents an `ACTION_TRACKED` row from falsely evidencing verification-after-remediation.

## Current 75-capability state

- EVIDENCED: 72
- DATA_PENDING: 3
- BOOTSTRAP_ONLY: 0
- NOT_EVIDENCED: 0
- Total: 75

Remaining `DATA_PENDING` capabilities:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent-based data architect

All three depend on real field-lineage evidence in `governance.lineage_column_mappings`.

## Remaining external blocker

Databricks source-authoritative lineage is still blocked by access to system lineage tables.

Required evidence/access:

- `USE SCHEMA` on `system.access`
- read access to `system.access.table_lineage`
- read access to `system.access.column_lineage`

Known blocker identifiers from prior live runs include:

- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`

Do not replace this evidence with AI-inferred lineage. AI inference may be useful as advisory evidence, but it cannot satisfy source-authoritative lineage capability evidence.

## Evidence reuse decision

A key architectural decision was made while optimizing profiling:

- FILE/CSV can reuse profiling evidence only when actual source bytes are SHA-256 fingerprinted and the compatible profiling contract matches.
- Databricks/JDBC cannot reuse evidence from `catalog.dataset_versions.content_hash`, because current promotion code derives that value from `structure_hash`. It is not source-content freshness evidence.

This is intentional. Stale evidence reuse is worse than recomputation.

## Incremental execution decision

Incremental execution is eligibility-gated, not assumed.

Current Databricks execution bindings have no source-observed CDC token, monotonic watermark, partition boundary, or equivalent change cursor in `profiling.dataset_execution_sources.execution_config`.

Therefore the truthful result is:

- `FULL_OR_SAMPLED_REQUIRED`
- `CHANGE_BOUNDARY_UNAVAILABLE`

No timestamp/schema/profile hash is allowed to stand in for a real source change boundary.

## Important PR sequence

The September 7-8 implementation included the following major merged PRs:

- #76 Adaptive Scheduler v1
- #77 AI Insights UI
- #78 75-capability control center
- #79 evidence-backed governance recommendations
- #82 current recommendation count semantics
- #83 event-driven durable queue wake-up
- #84 event-driven outbox/DQ fan-out
- #85 source-aware concurrency and queue telemetry
- #86 workload characterization
- #87 persisted DAG dependencies
- #88 unknown workload-size evidence fix
- #89 critical-path scheduling
- #90 stateful adaptive source concurrency
- #91 scheduler service-role planner access and safe fallback
- #92 automatic sampling planner
- #93 sampled duplicate-metric evidence correction
- #94 truth-aware FILE/CSV profiling evidence reuse
- #95 source-byte hash authority preservation
- #96 incremental eligibility planning
- #98 governed CSV remediation source correction
- #99 require verified remediation evidence for capability #45

## Rules the next agent must preserve

- Never auto-approve DQ proposals.
- Never fabricate Databricks lineage.
- Never convert AI inference into source authority.
- Never treat sampled rows as full-source coverage.
- Never use structure/schema hashes as source-content freshness.
- Never weaken RLS or grants merely to make CI pass.
- Never delete failed/history evidence to improve status counts.
- Keep human approval and AI recommendation as separate authority classes.
- Use stable dataset/source IDs for acceptance and orchestration.
- Merge only exact CI-verified heads and verify exact-main production deployment.

## Immediate next run

The next agent should start by re-resolving current main and production state, then focus on the Databricks lineage path. It should identify the exact native lineage query and ingestion code, execute a live canary, and either:

1. ingest real table/column lineage and refresh the matrix to 75/75 if Databricks access is now available, or
2. stop only at the exact external Databricks grant boundary, naming the denied system object and required grant.
