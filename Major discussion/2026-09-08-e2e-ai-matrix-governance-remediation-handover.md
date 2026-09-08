# DataNexus AI E2E, 75-capability matrix, governance and remediation handover

Date: 2026-09-08
Repository: `shoaib143-sudo/data-quality-ai-platform`
Production app: `https://data-quality-ai-platform.vercel.app/`
Baseline main when this handover was written: `612698462804291c83b86d6d3ba7d7ee1134b1a4`
Supabase project ref: `tvjnavjxuehpesxcfvrx`
Target project: `479813aa-72a4-4b12-b72a-74da8d2419ce`

## Executive status

The requested DataNexus E2E path has been exercised in production for the two scoped Databricks tables on the current scheduler/profiling stack. The 75-capability AI matrix is operational and refreshed from production evidence.

Current matrix state:

- 75 total
- 72 EVIDENCED
- 3 DATA_PENDING
- 0 BOOTSTRAP_ONLY
- 0 NOT_EVIDENCED

The only remaining capability gap is source-authoritative Databricks lineage evidence for capabilities #31, #32 and #52.

## Two-table production acceptance

Scoped tables:

1. `pub.gold.customer_water_consumption_behavior_drift_metrics`
2. `pub.gold.customer_water_consumption_behavior_profile_metrics`

The latest final acceptance rerun used governed v3 versions and the production durable orchestration path.

Observed results:

| Table | Profiling | DQ | Sample rows | Columns | Findings | Score | Proposed controls | Enabled |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| drift metrics | succeeded | succeeded | 1,000 | 22 | 12 | 0.5455 | 8 | 0 |
| profile metrics | succeeded | succeeded | 1,000 | 29 | 17 | 0.5494 | 8 | 0 |

Both profiling jobs were claimed event-driven in roughly 1.7 seconds and downstream DQ was materialized automatically. Proposed controls remain disabled because no human DQ-control approval was granted.

The 1,000 rows are a bounded sample. They are not represented as the full Databricks table.

## Scheduler progression and decisions

The initial production benchmark showed substantial cron-boundary and serial-processing delay. The scheduler was progressively changed to:

- bounded parallel execution;
- event-driven durable queue wake-up with cron as recovery;
- event-driven outbox/DQ fan-out;
- source-aware concurrency;
- stateful AIMD source concurrency;
- persisted job dependencies;
- truthful dependency cancellation;
- critical-path weighting over persisted DAG work;
- workload characterization with evidence quality;
- truth-aware automatic sampling;
- incremental eligibility telemetry.

Production canaries demonstrated profiling enqueue-to-claim near 2 seconds instead of roughly 53 seconds in the earlier cron-bound canary. Same-source profiling and DQ branches were proven concurrent within governed source limits.

## Sampling and source-size decision

A major truth decision was not to use profiled row counts as source cardinality. `catalog.dataset_versions.row_count` can reflect the observed profiling sample and is therefore not a safe source-size estimate.

The Databricks tables currently have no source-authoritative row/byte estimate, so automatic sampling stays bounded and reports `SAMPLED_OBSERVATION`.

## Profiling evidence reuse decision

Strong reuse is enabled only when freshness identity is strong enough.

FILE/CSV sources can establish a SHA-256 hash of actual source bytes. Production canaries proved a second identical CSV run can reuse a directly executed completed run while preserving:

- source-byte hash authority `SOURCE_BYTES_SHA256`;
- exact schema/configuration/profile signature;
- cloned metrics/findings/score into a new run;
- explicit `execution_mode=REUSED` and source-run reference.

Databricks reuse remains ineligible because the current catalog `content_hash` is derived from `structure_hash`, not source-content freshness.

## Incremental execution decision

No live execution source currently persists an authoritative CDC cursor, partition watermark or equivalent change boundary. Incremental reads are therefore not activated.

For the scoped Databricks source, the planner truthfully reports:

`FULL_OR_SAMPLED_REQUIRED / CHANGE_BOUNDARY_UNAVAILABLE`

Do not infer incremental safety from timestamps, schema hashes or profiling signatures.

## AI Insights and 75-capability matrix

The AI Insights workspace surfaces real production evidence: health, deterministic findings, investigation, predictive risk, pending controls and governance recommendations. It explicitly labels AI suggestions as advisory.

The 75-capability Control Center calls the live capability matrix and shows evidence status/count/source. It distinguishes real enterprise evidence from synthetic bootstrap content.

Capability #59, AI-generated governance recommendations, is EVIDENCED from `governance.ai_governance_suggestions`. The matrix counts current recommendation contexts, not every historical recommendation row.

## Enterprise governance corpus work

The user explicitly approved two existing INTERNAL governance documents through the governed approval path:

1. Business Glossary and Data Dictionary Framework
2. CDE Identification Methodology

Both are now ACTIVE/APPROVED, non-synthetic enterprise material. This changed governance knowledge readiness to policy-authority-ready and moved the previously BOOTSTRAP_ONLY policy/knowledge capabilities into EVIDENCED state.

Important decision: synthetic bootstrap material was not treated as enterprise authority.

## Governed remediation and capability #45

A real remediation lifecycle was completed using the governed CSV lifecycle fixture because the two scoped Databricks tables have zero enabled DQ controls and auto-approving their proposals would violate the governance boundary.

The selected real defect was one blank email for `CUST-0011 / Karen Goh`, causing the approved HIGH email-format control to fail.

Lifecycle:

1. user explicitly approved the `policy.approve` remediation workflow gate;
2. a governed remediation issue/outcome was created with `production_mutation_performed=false`;
3. draft PR #98 changed only the bad source row;
4. the file-onboarding regression contract was updated because its previous test intentionally required the bad value;
5. PR #98 passed the complete Quality Gate and was merged as `8129f1d6e233d6f1bcae4a3790fb8cfcfeeb38dd`;
6. exact remediation commit was verified READY in production;
7. issue resolution was recorded with source-change evidence;
8. a fresh profile was executed against the changed source bytes, not reused;
9. downstream DQ ran automatically;
10. failed HIGH controls improved from 1 to 0;
11. remediation outcome `0929a3b1-eb1d-41fd-999d-122907af6261` became VERIFIED;
12. PR #99 hardened capability #45 so only VERIFIED remediation outcomes count as evidence.

PR #99 merged as `612698462804291c83b86d6d3ba7d7ee1134b1a4`.

Capability #45 now has exactly one valid verified-remediation evidence context.

## Current 72/75 state

EVIDENCED: 72

DATA_PENDING:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent based data architect

These three depend on real field-lineage evidence in the governed lineage model.

## Remaining external lineage blocker

The native Databricks lineage path must ingest source-observed lineage from Databricks system tables. Previous production attempts were blocked by access to:

- `system.access.table_lineage`
- `system.access.column_lineage`
- `USE SCHEMA` and related object permissions on `system.access`

The known blocker code is `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`.

Do not replace this with AI-inferred lineage and then mark #31/#32/#52 as source-evidenced. Inferred lineage may be advisory, but it remains a different authority class.

## Important identifiers

- repository: `shoaib143-sudo/data-quality-ai-platform`
- project: `479813aa-72a4-4b12-b72a-74da8d2419ce`
- Databricks source: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`
- drift dataset: `232244ed-74c0-4b98-99da-d3d7f280efed`
- profile dataset: `858d8627-722b-4caa-a473-92ec594cafe5`
- drift v3: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`
- profile v3: `f55b8039-5777-4595-b128-59e3624e6dd4`
- verified remediation outcome: `0929a3b1-eb1d-41fd-999d-122907af6261`

## Required operating style for continuation

The next agent should execute, not merely propose. It should:

1. re-resolve current GitHub main and exact production deployment before making claims;
2. inspect live Supabase state before changing schema/data;
3. use existing governed RPCs and workflows rather than bypassing them;
4. create focused branches/PRs for code or migration changes;
5. require focused CI plus full Quality Gate before merge;
6. apply production migrations only after exact-head CI is green;
7. verify exact-main Vercel deployment after merge;
8. run production canaries and inspect persisted evidence;
9. preserve all truth/authority boundaries;
10. report an exact file/schema/external privilege blocker if execution cannot continue.

## Immediate next task

Close the final 3/75 capability gap if and only if Databricks source-authoritative lineage is available.

Trace the native lineage collector and run it for the scoped Databricks source. Verify actual records land in the governed table/column lineage evidence model. Then refresh the capability matrix and require #31/#32/#52 to become EVIDENCED from those source-observed records.

If Databricks still denies `system.access`, stop at that external boundary and provide the exact Databricks grant required. Do not fabricate or promote inferred lineage.