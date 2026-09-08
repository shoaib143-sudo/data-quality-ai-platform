# DataNexus AI E2E operating state and continuation

**Date:** 2026-09-08  
**Status:** Production checkpoint after two-table Databricks E2E, 75-capability matrix, scheduler optimization, enterprise corpus approval, and verified remediation cycle

## Release boundary

Production `main` at this checkpoint:

```text
612698462804291c83b86d6d3ba7d7ee1134b1a4
```

This is the merge of PR #99, which tightened capability #45 so only `VERIFIED` remediation outcomes count as evidence.

Production architecture remains:

- Vercel: application/control-plane runtime
- Supabase/PostgreSQL: authoritative governance/control plane
- native Databricks connector: Databricks execution and source metadata
- Render Java 21/Spring Boot JDBC bridge: replaceable JDBC execution runtime, not governance authority

## Target production scope

Project:

```text
479813aa-72a4-4b12-b72a-74da8d2419ce
```

Databricks source:

```text
f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b
```

Two governed acceptance datasets:

1. `pub.gold.customer_water_consumption_behavior_profile_metrics`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`

Stable dataset IDs:

- profile: `858d8627-722b-4caa-a473-92ec594cafe5`
- drift: `232244ed-74c0-4b98-99da-d3d7f280efed`

Current governed v3 version IDs:

- profile: `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

## Authority and evidence boundaries

These boundaries are non-negotiable:

- source physical metadata is source-authoritative;
- DataNexus governance state and governed decisions are DataNexus-authoritative;
- observation is not governance authority;
- AI recommendation is not human approval;
- inferred lineage is not source-observed lineage;
- human acceptance of AI inference does not turn it into source-observed lineage;
- stable identity is preferred over mutable path identity;
- FK/REFERENCES structure is structural lineage, not transformation logic;
- sampled profiling evidence must never be represented as full-source coverage;
- source-content reuse requires a strong freshness fingerprint, not a schema/structure hash;
- failed or historical evidence is retained rather than deleted to make acceptance appear clean.

## Final two-table E2E acceptance

A fresh acceptance run was executed on the current production scheduler for both Databricks v3 datasets.

Both profiling jobs were enqueued together and claimed event-driven in approximately 1.739 seconds. Both profiling branches and their downstream DQ jobs succeeded on first attempt.

| Dataset | Rows observed | Columns | Findings | Quality score | Proposed rules | Enabled rules |
|---|---:|---:|---:|---:|---:|---:|
| drift metrics | 1,000 | 22 | 12 | 0.5455 | 8 | 0 |
| profile metrics | 1,000 | 29 | 17 | 0.5494 | 8 | 0 |

Profiling coverage is intentionally represented as:

```text
coverage_scope = SAMPLED_OBSERVATION
planner_reason = UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE
full_source_coverage_claimed = false
```

The two Databricks execution sources do not currently carry a source-authoritative CDC/watermark boundary. Incremental planning therefore correctly reports:

```text
execution_mode = FULL_OR_SAMPLED_REQUIRED
reason = CHANGE_BOUNDARY_UNAVAILABLE
```

## Adaptive Scheduler architecture now in production

The scheduler evolved from minute-cron serial execution to an event-driven, bounded-parallel orchestration layer.

Production capabilities include:

- event-driven durable queue wake-up with cron retained as recovery;
- bounded parallel dispatch;
- multi-round drain so newly created downstream work can run in the same worker convergence cycle;
- source-aware concurrency using stable governed `source_id`;
- AIMD-style adaptive source concurrency with governed min/max limits;
- workload characterization from real evidence with explicit UNKNOWN states;
- persisted `orchestration.job_dependencies` DAG edges;
- dependency-aware claim blocking and truthful child cancellation on failed required predecessors;
- critical-path weighting over already-persisted DAG descendants;
- queue-wait and scheduler telemetry;
- automatic sampling that respects explicit human policy and never fabricates source cardinality;
- incremental eligibility telemetry that requires source-observed, ordering-proven change boundaries.

Measured production improvements:

- original two-table profile-to-final-DQ reference: about 185.5 seconds from first profiling claim;
- Scheduler v1 canary: about 93.6 seconds, roughly 49.6% faster;
- event-driven enqueue-to-profile claim: approximately 2.1 seconds versus roughly 53.5 seconds in the cron-bound v1 canary;
- recent downstream DQ queue waits: approximately 0.9 to 3 seconds.

## Profiling evidence reuse

Truth-aware evidence reuse is production-enabled for FILE/CSV only when strong source-byte evidence exists.

The FILE/CSV loader computes SHA-256 from actual loaded source bytes. Reuse requires exact matching of source-byte hash, schema, configuration, engine/sampling/metric contract, dataset version and project. Reuse chains are not used as source evidence.

A production CSV canary proved direct execution followed by `REUSED` execution with:

```text
content_hash_authority = SOURCE_BYTES_SHA256
reuse_fingerprint_authority = SOURCE_BYTES_SHA256
```

Databricks/JDBC reuse remains intentionally ineligible because `catalog.promote_approved_asset()` currently writes the discovered asset `structure_hash` into `catalog.dataset_versions.content_hash` and `schema_hash`. That is structural/schema evidence, not source-content freshness evidence.

## 75-capability AI matrix

After the final two-table E2E run, enterprise governance corpus approval, governance intelligence refresh, and verified remediation cycle, the live matrix is:

| Status | Count |
|---|---:|
| EVIDENCED | 72 |
| DATA_PENDING | 3 |
| BOOTSTRAP_ONLY | 0 |
| NOT_EVIDENCED | 0 |
| Total | 75 |

Capability #59, AI-generated governance recommendations, is `EVIDENCED` from current recommendation contexts in `governance.ai_governance_suggestions` rather than historical row volume.

Capability #45, verification after remediation, is `EVIDENCED` only from a real `VERIFIED` remediation outcome after PR #99.

## Enterprise governance corpus

Two real INTERNAL enterprise documents were approved through the governed `policy.approve` path and are now `ACTIVE/APPROVED`:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

They are non-synthetic enterprise material. `governance.governance_knowledge_readiness(...)` now reports policy authority ready with two approved non-synthetic documents. This moved the previous policy/knowledge `BOOTSTRAP_ONLY` capabilities into real evidence.

AI or synthetic bootstrap content must not be promoted to enterprise policy authority without the governed review path.

## Verified remediation cycle and capability #45

A real failing HIGH email-format control on the governed CSV lifecycle fixture was selected for remediation. The source defect was one blank email for `CUST-0011 / Karen Goh`.

The remediation workflow passed its required `policy.approve` gate. A governed remediation issue/outcome was created with `production_mutation_performed=false` until the source change was independently reviewed and deployed.

PR #98 changed the one source row to `karen.goh@example.com`, updated the fixture contract, passed the full Quality Gate, merged, and reached production.

A fresh profile was then executed against the changed source bytes. The changed byte hash prevented reuse of the pre-remediation profile. Automatic downstream DQ execution showed:

```text
before: 1 failed HIGH control
after:  0 failed controls
```

The tracked issue was resolved with deployment evidence and remediation outcome `0929a3b1-eb1d-41fd-999d-122907af6261` became `VERIFIED` after all verification checks passed.

PR #99 then hardened the capability matrix so #45 counts only `VERIFIED` remediation outcomes, not merely `ACTION_TRACKED` rows.

## Remaining 3/75 capability gap

Only these capabilities remain `DATA_PENDING`:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent based data architect

Their evidence domain is real field-level lineage, principally `governance.lineage_column_mappings`.

The blocker remains external to DataNexus application logic:

```text
DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED
required privilege: USE SCHEMA on system.access
required objects:
  system.access.table_lineage
  system.access.column_lineage
data blocker: REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
inference_allowed_as_source_authority = false
```

Do not clear these capabilities with AI inference, accepted suggestions, FK structure, or manually fabricated column mappings.

## Important PR sequence

Major production increments in this phase:

- #76 Adaptive Scheduler v1
- #77 evidence-backed AI Insights workspace
- #78 operational 75-capability AI matrix UI
- #79 evidence-backed capability #59 governance recommendations
- #81 protected AI Insights evidence access fix
- #82 current-context recommendation count semantics
- #83 event-driven durable queue wake-up
- #84 event-driven outbox/DQ convergence
- #85 source-aware concurrency and queue telemetry
- #86 workload characterization/runtime estimation
- #87 persisted durable job DAG dependencies
- #88 unknown workload-size truth fix
- #89 critical-path scheduling
- #90 stateful adaptive source concurrency
- #91 service-role scheduler planner access with safe fallback
- #92 truth-aware automatic sampling
- #93 sampled duplicate-metric evidence-scope fix
- #94 truth-aware FILE/CSV profile evidence reuse
- #95 preserve source-byte hash authority
- #96 truth-aware incremental eligibility planning
- #98 governed remediation source correction
- #99 require VERIFIED remediation evidence for capability #45

## Continuation order

1. Re-check current `main`, Vercel production SHA, and Supabase migration state before making changes.
2. Focus on the remaining three lineage-dependent capabilities only if the Databricks account can expose `system.access.table_lineage` and `system.access.column_lineage` to the configured connector principal.
3. If access is granted, ingest source-observed table and column lineage through the existing lineage ingestion path and populate governed evidence without relabeling inferred mappings as source-observed.
4. Re-run the exact two-table lineage enrichment and regenerate the 75-capability matrix. Target is 75/75 only if real field-lineage evidence satisfies the matrix contracts.
5. If access is still denied, stop lineage closure and report the exact Databricks grant/object blocker. Do not fabricate evidence.
6. Preserve the event-driven scheduler, sampling, reuse, incremental, governance, remediation, RLS and audit truth boundaries during all future optimization work.

## Completion definition

The current platform is production-closed for the two-table non-lineage E2E path and 72/75 AI capabilities. The remaining completion criterion is real Databricks source-authoritative field-lineage ingestion sufficient to evidence #31, #32 and #52.
