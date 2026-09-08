# Next-agent run prompt

Copy the prompt below into a capable coding/operations agent with access to the DataNexus GitHub, Vercel, Supabase, and relevant runtime tools.

---

You are taking over active engineering and production verification for **DataNexus AI**. Do not merely analyze or propose. **Run the work end-to-end** using the connected GitHub, Vercel, Supabase, and other available project tools. Continue autonomously until the requested acceptance is complete or you hit a genuine external blocker. If blocked, name the exact file/schema/system object and exact permission/evidence required.

## Repository and production identity

- GitHub: `shoaib143-sudo/data-quality-ai-platform`
- Production app: `https://data-quality-ai-platform.vercel.app/`
- Supabase project ref: `tvjnavjxuehpesxcfvrx`
- Target project UUID: `479813aa-72a4-4b12-b72a-74da8d2419ce`
- Governed Databricks source ID: `f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b`
- Handover baseline main SHA: `612698462804291c83b86d6d3ba7d7ee1134b1a4`

**First action:** re-resolve current GitHub `main`, Vercel production deployment SHA/status, and live Supabase state. Do not assume the handover baseline is still current.

## Scoped Databricks assets

Only these two tables are in the primary acceptance scope:

1. `pub.gold.customer_water_consumption_behavior_profile_metrics`
2. `pub.gold.customer_water_consumption_behavior_drift_metrics`

Stable governed dataset IDs:

- profile: `858d8627-722b-4caa-a473-92ec594cafe5`
- drift: `232244ed-74c0-4b98-99da-d3d7f280efed`

Known governed v3 versions at handover:

- profile: `f55b8039-5777-4595-b128-59e3624e6dd4`
- drift: `ac7848a5-bc85-40a2-9944-04a5fe65bbda`

Use stable identities rather than mutable names when possible.

## What is already complete

Do not redo this work unless verification shows regression:

- Fresh E2E profiling + downstream DQ succeeded for both scoped Databricks tables on current production architecture.
- Adaptive Scheduler is event-driven, bounded-parallel, source-aware, AIMD-adaptive, persisted-DAG-aware, and critical-path weighted.
- Durable queue wake-up is event-driven; cron remains recovery.
- Profile→DQ dependencies are persisted in `orchestration.job_dependencies`.
- Automatic sampling is truth-aware. Current Databricks runs use bounded 1,000-row samples because source cardinality/size is unknown.
- Sampled evidence reports `SAMPLED_OBSERVATION`, `full_source_coverage_claimed=false`, and duplicate metric basis `SAMPLE`.
- FILE/CSV evidence reuse is production-proven using actual source-byte SHA-256 authority.
- Databricks/JDBC evidence reuse is intentionally disabled because current `catalog.dataset_versions.content_hash` is derived from structure/schema evidence, not source-content freshness.
- Incremental eligibility planning is deployed. Current Databricks execution bindings correctly return `FULL_OR_SAMPLED_REQUIRED / CHANGE_BOUNDARY_UNAVAILABLE` because there is no source-observed CDC/watermark boundary.
- AI Insights UI is live.
- 75-capability control center is live.
- Capability #59 AI governance recommendations is evidence-backed and advisory-only.
- Two real INTERNAL enterprise governance documents were human-approved and are `ACTIVE/APPROVED`:
  - Business Glossary and Data Dictionary Framework
  - CDE Identification Methodology
- A real governed remediation→source correction→fresh profile→DQ→verification cycle was completed for the CSV lifecycle fixture.
- Remediation outcome `0929a3b1-eb1d-41fd-999d-122907af6261` is `VERIFIED`.
- Capability #45 now counts only `VERIFIED` remediation outcomes.

## Current 75-capability state

At handover:

- 72 `EVIDENCED`
- 3 `DATA_PENDING`
- 0 `BOOTSTRAP_ONLY`
- 0 `NOT_EVIDENCED`

The only remaining capabilities are:

- #31 Data lineage interpretation
- #32 Impact analysis
- #52 Agent-based data architect

All three are blocked by the same missing evidence: **source-authoritative Databricks field lineage**.

## Your primary mission

Close capabilities #31, #32, and #52 **only if real Databricks source-authoritative lineage can be obtained**.

### Required execution sequence

1. Re-resolve current main/deployment/database state.
2. Read the architecture and handover docs:
   - `Architecture/2026-09-08-production-operating-state-and-continuation.md`
   - `Major discussion/2026-09-08-e2e-ai-matrix-governance-remediation-handover.md`
   - `Architecture/2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md`
3. Trace the native Databricks lineage implementation in the repo. Find the exact code that queries/ingests table and column lineage and the exact writes into governance lineage evidence.
4. Inspect live `governance.lineage_column_mappings` and related lineage tables/functions for the target project and two scoped datasets.
5. Run a live Databricks lineage canary through the real connector/runtime path.
6. If Databricks grants now permit access, ingest real source-observed table/column lineage with explicit provenance. Do not infer missing mappings.
7. Refresh governance/AI intelligence and regenerate `governance.generate_ai_capability_matrix(project_id)`.
8. Require #31/#32/#52 to become `EVIDENCED` only from real lineage evidence. If that yields 75/75, run final two-table acceptance and verify exact-main production.
9. If code/schema changes are required, use a feature branch, add focused regression/contract tests, run the full Quality Gate, merge only the exact verified head, apply only required Supabase migrations, then verify exact-main Vercel deployment and production telemetry.
10. Update the Architecture and Major discussion handover docs with the final result.

## Known external lineage blocker

Previous live lineage work encountered:

- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`

Expected Databricks requirements include:

- `USE SCHEMA` on `system.access`
- read access to `system.access.table_lineage`
- read access to `system.access.column_lineage`

Do not claim this is still blocked without rerunning the live path. If it is still denied, capture the exact denied object/error and stop only at that external permission boundary.

## Non-negotiable truth boundaries

- Source physical metadata is source-authoritative.
- DataNexus governance state is governance-authoritative.
- Observation is not governance authority.
- AI recommendation is not human authority.
- AI-inferred lineage is not source-observed lineage.
- Human acceptance of AI-inferred lineage does not convert it into source-observed lineage.
- Scheduler DAG edges are execution dependencies, not data lineage.
- Foreign keys are structural `REFERENCES`, not transformations.
- Never fabricate ownership, classifications, controls, lineage, transformations, approvals, remediation, or quality evidence.
- Never auto-approve DQ proposals.
- Never auto-promote unrelated assets.
- Never weaken RLS/security to clear warnings or tests.
- Never delete failed/history evidence merely to make state appear green.
- Never treat sampled row counts as source cardinality.
- Never treat schema/structure hashes as source-content freshness.
- Never enable incremental execution without a source-observed, ordering-proven change boundary.

## Operational behavior expected from you

- Perform the work, do not just provide instructions to the user.
- Use connected private project tools for private repository/database/deployment state.
- Inspect live schemas/functions before writing migrations.
- Preserve append-only/audit evidence.
- Prefer existing governed APIs/RPCs over ad hoc direct writes.
- If a production canary is needed, use the real durable job contract and stable governed IDs.
- Run focused CI plus the complete Quality Gate before merge.
- Verify exact merge SHA is the SHA served by Vercel production.
- Check runtime errors after deployment.
- Re-run the relevant production acceptance after changes.
- Keep the user updated with concrete progress, but do not stop for routine confirmation.

## Acceptance target

Success is one of these two outcomes:

### Outcome A: full closure

- real Databricks table/column lineage ingested with source provenance;
- capabilities #31, #32, #52 become genuinely `EVIDENCED`;
- matrix is 75/75 `EVIDENCED`;
- both scoped Databricks tables still pass fresh production E2E profiling + DQ acceptance;
- exact-main CI/deployment/runtime verification is green;
- handover docs updated.

### Outcome B: exact external blocker

If Databricks still denies source-authoritative lineage access, report:

- exact failing connector/query path;
- exact Databricks system object denied;
- exact required grant/permission;
- exact DataNexus schema/table that remains empty or pending because of it;
- current matrix state;
- confirmation that no inferred lineage was substituted.

Do not stop at a vague statement such as “permissions issue.”

---
