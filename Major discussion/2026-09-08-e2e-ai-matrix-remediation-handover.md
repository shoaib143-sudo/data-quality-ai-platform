# DataNexus AI E2E execution, AI matrix, governance and remediation handover

Date: 2026-09-08
Repository: `shoaib143-sudo/data-quality-ai-platform`
Production baseline main: `612698462804291c83b86d6d3ba7d7ee1134b1a4`

## Purpose

This is the operational handover for another engineering agent. It captures what was actually completed, what was measured in production, the important decisions/truth boundaries, and the exact remaining work.

## Production identifiers

- Supabase project ref: `tvjnavjxuehpesxcfvrx`
- DataNexus project: `479813aa-72a4-4b12-b72a-74da8d2419ce`
- Databricks source: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`
- production app: `https://data-quality-ai-platform.vercel.app/`
- Vercel team: `team_rHi9EXWHJwXXxejgVBYUJFJq`
- Vercel project: `prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR`
- generic JDBC bridge: Render service `datanexus-jdbc-bridge`

Target tables:

1. `pub.gold.customer_water_consumption_behavior_profile_metrics`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`

Stable datasets and current v3 versions:

- profile dataset `858d8627-722b-4caa-a473-92ec594cafe5`, version `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift dataset `232244ed-74c0-4b98-99da-d3d7f280efed`, version `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

## Final two-table E2E acceptance

A fresh latest-main E2E acceptance was run for both Databricks v3 datasets through the real durable scheduler path.

Both profiling jobs were enqueued together and claimed event-driven in about 1.739 seconds. Both profiling branches succeeded on first attempt and automatically fanned out to DQ, whose jobs also succeeded on first attempt.

Observed final profiling evidence:

| Asset | Rows observed | Columns | Findings | Quality score | Proposed controls | Enabled |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| drift metrics | 1,000 | 22 | 12 | 0.5455 | 8 | 0 |
| profile metrics | 1,000 | 29 | 17 | 0.5494 | 8 | 0 |

Important interpretation: the 16 proposals are recommendations, not executed controls. Enabled count remains 0 unless governed approval occurs.

Sampling evidence is `SAMPLED_OBSERVATION`, with reason `UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE` and `full_source_coverage_claimed=false`.

Incremental planner result for both Databricks jobs is `FULL_OR_SAMPLED_REQUIRED / CHANGE_BOUNDARY_UNAVAILABLE` because no source-authoritative CDC/watermark boundary is present.

## Scheduler progression and measured result

The original clean reference run exposed minute-cron and serial claimed-job delays. The scheduler was progressively upgraded:

- bounded parallel rounds
- event-driven `job_queue` wake via `pg_net`
- event/outbox convergence so profile completion can create and claim DQ without waiting for another cron boundary
- source-aware concurrency
- AIMD source concurrency controller
- persisted DAG dependencies and failure propagation
- critical-path weighting
- workload characterization and runtime estimates
- queue-wait telemetry
- safe planner fallback
- truth-aware automatic sampling
- incremental eligibility telemetry

Measured initial queue wait improved from roughly 53 seconds in the early v1 canary to roughly 2 seconds in event-driven production canaries. A prior two-table scheduler canary reduced first-profile-claim to final-DQ completion from about 185.5 seconds to about 93.6 seconds, roughly 49.6% faster, before later event-driven improvements removed most initial queue wait.

## AI Insights and 75-capability matrix

Production UI now includes:

- `/ai-insights`
- `/ai-capabilities`

AI Insights shows evidence-backed health, deterministic findings, DQ investigation, probable causes, business impact, predictive risk, pending control proposals and governance recommendations. It explicitly states AI suggestions are not governance authority.

The 75-capability Control Center is backed by `governance.generate_ai_capability_matrix(project_id)` and reports evidence source/count rather than a static marketing checklist.

Current matrix after all work in this handover:

- 72 EVIDENCED
- 3 DATA_PENDING
- 0 BOOTSTRAP_ONLY
- 0 NOT_EVIDENCED

Capability #59 AI generated governance recommendations is EVIDENCED using current recommendation contexts in `governance.ai_governance_suggestions`, not total historical rows.

## Enterprise governance corpus work

Initially, only synthetic bootstrap knowledge was approved, so policy-aware capabilities correctly remained `BOOTSTRAP_ONLY`.

Two real INTERNAL documents were then explicitly human-approved through the governed review path:

1. Business Glossary and Data Dictionary Framework
2. CDE Identification Methodology

They are now `ACTIVE/APPROVED`, non-synthetic enterprise material. `governance.governance_knowledge_readiness()` reports `policy_authority_ready=true`. The existing semantic-refresh trigger is responsible for downstream indexing/refresh.

This moved the former knowledge-bootstrap capabilities to EVIDENCED. Do not revert to treating synthetic bootstrap material as policy authority.

## Governed remediation and capability #45

A real remediation-verification lifecycle was completed using the governed CSV lifecycle fixture because the two Databricks target datasets have zero enabled DQ controls and auto-approving a Databricks DQ proposal would violate governance boundaries.

The real defect was one blank email for `CUST-0011 / Karen Goh`, causing an approved HIGH email-format control to fail.

Lifecycle:

1. remediation workflow `ef2b9d28-0e5b-453b-877a-5827985eacbc` passed the required human `policy.approve` gate
2. governed issue and remediation outcome were created
3. PR #98 changed the source row to `karen.goh@example.com`
4. PR #98 passed the full Quality Gate and was deployed
5. production source change was confirmed
6. issue was resolved with source-change evidence
7. a fresh profile was executed against the changed source bytes; reuse was correctly not used because the SHA-256 changed
8. downstream DQ executed automatically
9. failed HIGH controls improved from 1 to 0
10. remediation outcome `0929a3b1-eb1d-41fd-999d-122907af6261` became `VERIFIED`
11. PR #99 hardened the matrix so #45 counts only `VERIFIED` outcomes, not `ACTION_TRACKED`/planned remediation

Capability #45 is therefore genuinely EVIDENCED with evidence count 1.

## Evidence reuse decision

FILE/CSV evidence reuse is production-proven and safe only because `loadFileSource()` hashes actual source bytes with SHA-256. Reuse requires strong matching fingerprints and materializes a new evidence set atomically through `profiling.reuse_profile_evidence(...)`.

Do not enable Databricks/JDBC reuse from `catalog.dataset_versions.content_hash`. Investigation proved that promotion writes discovery `structure_hash` into both dataset-version `content_hash` and `schema_hash`; it is not source-content freshness evidence.

If Databricks later exposes an immutable snapshot/version/content token, add it as an explicit source-authoritative freshness fingerprint rather than overloading the current structure hash.

## Remaining three capabilities

Only these remain DATA_PENDING:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent based data architect

They depend on source-authoritative field lineage, including evidence in `governance.lineage_column_mappings`.

Known Databricks blocker:

- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- requires `USE SCHEMA` on `system.access`
- requires readable `system.access.table_lineage`
- requires readable `system.access.column_lineage`
- `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`

A lineage-enrichment job may succeed operationally while still having no source-authoritative field lineage. Do not claim those capabilities are evidenced merely because the job completed.

## Important decisions that must survive handover

- source physical metadata is source-authoritative
- DataNexus governance state is governance-authoritative
- AI recommendation is advisory, not approval
- observation is not authority
- inferred lineage is not source-observed lineage
- human acceptance of inference does not turn it into source-observed lineage
- foreign keys are structural references, not transformations
- stable IDs are preferred over mutable names/paths
- do not fabricate ownership/classification/control/lineage/transformation/remediation/quality evidence
- do not weaken RLS/security to clear tests or warnings
- do not delete historical failures/audit rows to make state look green
- user authorization to execute/fix work is not blanket DQ recommendation approval
- sampled observations must never be labeled full-source coverage
- incremental execution requires a real source-observed change boundary
- evidence reuse requires a real freshness fingerprint
- #45 requires verified post-remediation improvement, not a remediation plan

## Current continuation task

Close #31/#32/#52 if and only if real Databricks source lineage can be ingested.

Recommended sequence:

1. re-resolve current GitHub main and exact production Vercel SHA
2. inspect the current native Databricks lineage connector/query path
3. query the live governed lineage tables for the two scoped datasets
4. run a lineage canary against the Databricks source
5. if `system.access` is denied, capture the exact Databricks error and exact missing grants; do not substitute inferred lineage
6. if access is available, ingest table/column lineage with source-observed provenance
7. populate/refresh governed field-lineage evidence without fabricating transformations
8. regenerate the 75-capability matrix
9. require #31/#32/#52 to move from DATA_PENDING to EVIDENCED only when their evidence rows actually exist
10. rerun production contract checks and exact-main deployment verification

## Definition of done for the next agent

The next agent is done only when one of these is true:

A. all 75 capabilities are EVIDENCED from truthful production evidence, with #31/#32/#52 backed by real Databricks source-observed field lineage; or

B. the agent has reproduced a specific external Databricks blocker and documented the exact required permission/object, while leaving the matrix at 72/3 rather than fabricating evidence.
