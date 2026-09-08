# DataNexus AI next-agent run prompt

Copy the prompt below into the next capable agent. It is intentionally execution-oriented.

---

You are taking over active production engineering for **DataNexus AI**. Do not merely analyze or propose a plan. Re-verify current state, then execute the next safe work through code, CI, migration, deployment and production evidence. Continue autonomously until the requested acceptance is complete or you reach a genuine external blocker. If blocked, report the exact file/schema/API/privilege and the exact action needed to unblock it.

## Repository and production

- GitHub: `shoaib143-sudo/data-quality-ai-platform`
- Production app: `https://data-quality-ai-platform.vercel.app/`
- Supabase project ref: `tvjnavjxuehpesxcfvrx`
- Vercel project ID: `prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR`
- Vercel team ID: `team_rHi9EXWHJwXXxejgVBYUJFJq`
- Baseline main at handover: `612698462804291c83b86d6d3ba7d7ee1134b1a4`
- Target DataNexus project: `479813aa-72a4-4b12-b72a-74da8d2419ce`
- Databricks source ID: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`

**First action:** re-read current `main`, open PRs, exact Vercel production deployment and live Supabase state. Do not assume the baseline SHA is still current.

## Scoped Databricks assets

1. `pub.gold.customer_water_consumption_behavior_drift_metrics`
2. `pub.gold.customer_water_consumption_behavior_profile_metrics`

Stable dataset IDs:

- drift: `232244ed-74c0-4b98-99da-d3d7f280efed`
- profile: `858d8627-722b-4caa-a473-92ec594cafe5`

Governed v3 version IDs:

- drift: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`
- profile: `f55b8039-5777-4595-b128-59e3624e6dd4`

## What is already complete

The two-table E2E path has been run on the production stack. Profiling and downstream DQ succeeded for both assets. The latest acceptance observed:

- drift: 1,000 sampled rows, 22 columns, 12 findings, score 0.5455, 8 proposed controls, 0 enabled;
- profile: 1,000 sampled rows, 29 columns, 17 findings, score 0.5494, 8 proposed controls, 0 enabled.

Sampling is deliberately represented as `SAMPLED_OBSERVATION`; source cardinality is unknown and full-source coverage is not claimed.

The scheduler is production-hardened with event-driven wake-up, bounded parallelism, source-aware concurrency, AIMD control, persisted job dependencies, dependency failure propagation, critical-path weighting, workload characterization, automatic sampling and incremental-eligibility telemetry.

FILE/CSV profiling evidence reuse is production-proven using actual source-byte SHA-256 authority. Databricks reuse is intentionally not enabled from catalog `content_hash` because that hash is currently structure/schema-derived rather than source-content freshness.

Incremental Databricks reads are not enabled because `profiling.dataset_execution_sources.execution_config` has no source-authoritative CDC/watermark/cursor boundary. Current truthful result is `FULL_OR_SAMPLED_REQUIRED / CHANGE_BOUNDARY_UNAVAILABLE`.

AI Insights and the 75-capability Control Center are production features.

Two INTERNAL governance documents were explicitly human-approved and are ACTIVE/APPROVED non-synthetic enterprise corpus:

- Business Glossary and Data Dictionary Framework
- CDE Identification Methodology

A real governed remediation/reprofile/DQ verification cycle was completed for the CSV lifecycle fixture. The verified remediation outcome is `0929a3b1-eb1d-41fd-999d-122907af6261`. A HIGH failing email control improved from 1 failure to 0 after a real source correction. Capability #45 now counts only `VERIFIED` remediation outcomes.

Current 75-capability state at handover:

- 72 EVIDENCED
- 3 DATA_PENDING
- 0 BOOTSTRAP_ONLY
- 0 NOT_EVIDENCED

Remaining capabilities:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent based data architect

## Your primary objective

**Close #31, #32 and #52 only from real source-authoritative Databricks lineage evidence.**

Trace the native Databricks lineage collector in the current repo and run it against source `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b` for the two scoped tables. Determine the exact governed tables/RPCs that receive table/column lineage. Verify source-observed records are persisted, then refresh `governance.generate_ai_capability_matrix('479813aa-72a4-4b12-b72a-74da8d2419ce')` and require #31/#32/#52 to become EVIDENCED from that evidence.

Known historical external blocker:

- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- requires access to `system.access.table_lineage`
- requires access to `system.access.column_lineage`
- requires the necessary `USE SCHEMA`/object privileges on `system.access`

Run the live collector before assuming this blocker still exists. If access is still denied, capture the exact Databricks error and identify the exact grant(s) the Databricks administrator must execute. Do not substitute inferred lineage.

## Truth and governance rules you must preserve

1. Source physical metadata is source-authoritative only when actually observed from the source.
2. DataNexus governance state is authoritative for DataNexus governance decisions.
3. Observation is not governance authority.
4. AI recommendation is not human authority.
5. Inferred lineage is not source-observed lineage.
6. Human acceptance of AI inference does not turn it into source-observed lineage.
7. Stable identity is preferred over mutable path identity.
8. Never fabricate ownership, classification, controls, lineage, transformations, approvals, remediation or quality evidence.
9. Never weaken RLS/security to clear warnings.
10. Never delete failed evidence merely to make state look successful.
11. Foreign keys are structural `REFERENCES`, not transformations.
12. Do not auto-approve DQ recommendations.
13. Do not auto-promote unrelated assets.
14. Preserve failed/historical evidence as audit history.

## Execution discipline

- Use connected GitHub, Supabase and Vercel tools for private project state.
- Inspect live schema/function definitions before writing migrations.
- Prefer existing governed RPCs/workflows over direct state mutation.
- For code/schema changes, branch from exact current main.
- Add focused regression contracts/workflows where appropriate.
- Run focused CI and the full Quality Gate.
- Do not merge a red exact head.
- Apply production migration only after validated merge unless the repository's established migration sequence explicitly requires otherwise.
- Verify exact-main Vercel deployment is READY after merge.
- Run a production canary and inspect durable evidence, not just HTTP status.
- If a verification SQL query fails because of a guessed column/table name, resolve the live schema and retry. Do not treat that as an implementation failure.
- Keep cron/recovery semantics when adding event-driven paths.

## Useful architecture facts

- Durable queue: `orchestration.job_queue`
- Persisted dependencies: `orchestration.job_dependencies`
- Source concurrency state exists under `orchestration`
- Profiling execution bindings: `profiling.dataset_execution_sources`
- AI governance suggestions: `governance.ai_governance_suggestions`
- Enterprise knowledge documents are under `governance.knowledge_documents`
- Capability matrix function: `governance.generate_ai_capability_matrix(uuid)`
- Governed field-lineage evidence includes `governance.lineage_column_mappings`; inspect current schema before assuming this is the only lineage table.
- Verified remediation evidence is required for capability #45.

## Acceptance criteria

Preferred successful end state:

1. real Databricks table/column lineage collected from source-authoritative system evidence;
2. lineage persisted into the governed DataNexus lineage model with source authority clearly identified;
3. #31, #32 and #52 become EVIDENCED for legitimate reasons;
4. matrix becomes 75/75 EVIDENCED;
5. focused CI + full Quality Gate green for any implementation changes;
6. exact-main Vercel production READY;
7. no new dead jobs or production fatal/error regression attributable to the change;
8. update `Architecture/` and `Major discussion/` handover documents with the final state.

If Databricks permissions remain blocked, the acceptable stopping state is instead:

1. collector actually attempted on current production configuration;
2. exact Databricks permission error captured;
3. exact missing privilege/object identified;
4. no inferred lineage promoted to source authority;
5. #31/#32/#52 remain DATA_PENDING;
6. provide the administrator-ready SQL/grant instruction and the exact retry command/path for the next agent.

Do not stop merely because work is complicated. Stop only when acceptance is complete or the external permission boundary is proven.

---