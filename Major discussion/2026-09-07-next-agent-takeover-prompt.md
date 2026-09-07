# DataNexus AI — Next Agent Takeover Prompt

Use this prompt to hand the project to another implementation agent.

---

You are taking over active engineering work on **DataNexus AI**. Do not restart the project from scratch and do not ask the user to repeat information already captured here. Work from the real repository, production schema, connected tooling, and current evidence.

## Project

- Repository: `shoaib143-sudo/data-quality-ai-platform`
- Production: `https://data-quality-ai-platform.vercel.app/`
- Supabase project ref: `tvjnavjxuehpesxcfvrx`
- DataNexus target project UUID: `479813aa-72a4-4b12-b72a-74da8d2419ce`
- Generic JDBC bridge runs on Render service `datanexus-jdbc-bridge`
- Render service ID: `srv-daeh498n74is73dqnskg`
- Vercel project ID: `prj_Wg1fgyXWUN99I4zlWrtlU9si6yfR`
- Current main SHA at handover: `68d8ca47f946d34f22760e99fa69d4ce5f47154b`

Do not reveal, retrieve into chat, or hardcode secrets. Never expose PATs, service-role keys, bridge tokens, JDBC credentials, credential refs, passwords, or credential-bearing URLs.

## User operating instruction

The user has approved autonomous implementation. Expected behavior:

inspect real repo/schema → understand authority/evidence model → implement → test → PR → repair CI → migrate only if necessary → merge verified head → exact-main CI → deploy → production verify → continue to next step.

Do not stall with planning-only responses when implementation is possible. Stop only for a genuine technical/external/business-authority blocker, and identify the exact file/function/schema/object/permission causing it.

## Required truth boundaries

- source physical metadata = source authoritative
- DataNexus governance state = DataNexus authoritative
- observation != configuration/governance authority
- AI suggestion != human authority
- inferred lineage != source-observed lineage
- human acceptance of an AI suggestion does not make it source-observed
- stable identity > mutable path identity
- do not invent lineage, transformation logic, ownership, classification, controls, approvals, quality evidence, or remediation evidence

## Wider architecture state

All implementable enterprise architecture modules were production-closed through the previous operating-state checkpoint except source-authoritative Databricks technical/field lineage.

Existing external Databricks blocker:

- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- requires `USE SCHEMA on system.access`
- objects `system.access.table_lineage`, `system.access.column_lineage`
- data blocker `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`
- `inference_allowed_as_source_authority=false`

Do not try to clear this with AI inference. It does not block SQLite work.

## Existing architecture

- Vercel application/control plane
- Supabase governance/control plane
- native Databricks connector
- Java 21 / Spring Boot generic JDBC bridge on Render
- Render is execution runtime, not governance authority
- one JDBC connection must support multiple schemas/tables where source permissions allow

## SQLite / Chinook objective

The user supplied DBeaver's Chinook SQLite sample and asked for an exhaustive DataNexus E2E run:

- ingest/onboard
- metadata discovery
- profiling
- PK/FK metadata
- lineage
- transformations
- rule suggestions
- quality execution
- repeat/reconciliation
- audit/evidence
- final acceptance

SQLite is file-backed. A local DBeaver Windows path is not reachable from the cloud bridge. Production uses a pinned upstream DBeaver Chinook artifact with checksum verification in the bridge build.

## Independent Chinook oracle

Verified source shape:

- 11 user tables
- 64 columns
- 15,607 total rows
- 11 declared FKs
- 10 explicit indexes + 1 SQLite auto-index
- 0 views
- 0 triggers

Important row counts:

- Album 347
- Track 3,503
- InvoiceLine 2,240
- PlaylistTrack 8,715

All declared PKs/composite PKs are non-null and duplicate-free. All 11 declared FKs have zero orphan violations.

Transformation truth boundary:

- source SQL transformations = 0
- structural FK lineage = 11 source-observed `REFERENCES` edges

Do not call FKs transformations.

## SQLite implementation already merged

### PR #66

Initial SQLite JDBC support:

- Xerial driver
- SQLite engine recognition
- read-only SQLite path
- schemaless discovery
- PK metadata
- FK metadata
- source-observed structural `REFERENCES` lineage
- SQLite profiling compatibility work
- exact fixture validation

### PR #67

Production Xerial imported-key bug fix:

- Xerial `DatabaseMetaData.getImportedKeys(...)` crashed on Chinook
- SQLite now uses `PRAGMA foreign_key_list(...)`
- other engines retain JDBC metadata
- exact Chinook regression verifies 11 FKs

### PR #68

Profiling metric namespace fix:

- `lib/profiling/metric-engine.ts` was defaulting missing JDBC schema to `public`
- SQLite is schemaless
- deployed fix uses no schema for SQLite, retains `public` fallback for non-SQLite JDBC
- PR changed only one production file
- full Quality Gate passed
- merged to current main SHA `68d8ca47f946d34f22760e99fa69d4ce5f47154b`
- exact Vercel production deployment reached READY

## Production discovery state

After #67, real discovery succeeded.

Production evidence:

- 13 observed objects
- 11 user tables
- 2 SQLite system metadata objects: `sqlite_schema` and auto-index metadata for `PlaylistTrack`
- 64 user columns
- 11 FK records
- 12 PK column rows because `PlaylistTrack` has a composite PK
- zero null identity keys
- 13 distinct object identities
- exactly 11 structural lineage edges
- zero transformations

Three successful observations were obtained after repair.

Repeat #2 and #3 each produced:

- 13 observed
- 13 unchanged
- 0 added
- 0 changed
- 0 missing
- 0 removed

Lineage remained exactly 11 edges.

## Governed dataset promotion already done

Only the 11 user tables were promoted. The SQLite system objects were not promoted.

Current production dataset versions:

- Album `f90abfb8-3e58-447f-9ff2-79ee1d70eb2d`
- Artist `b15d1feb-e1cd-412a-b66e-9319ebb434a9`
- Customer `0dee17dd-c931-454a-918b-eed157b47d78`
- Employee `5487b558-398f-4a3f-8951-d773e7661e91`
- Genre `2edc1dc7-4085-492b-8dbe-20df30f59127`
- Invoice `5ff3c554-f2a7-46e6-ae3e-da567a998716`
- InvoiceLine `37a45a2e-c4a0-48eb-9e7f-909fe4961156`
- MediaType `b7e0d673-9586-49d4-a387-8dad0b238aab`
- Playlist `75a3b419-c399-4001-bf61-c6ab53928776`
- PlaylistTrack `d3ca5058-a9fe-4b6c-8946-98d886e49ffc`
- Track `6cce2caf-31b6-47fc-b162-c1073ef59280`

Each is `AVAILABLE` with an active JDBC execution source.

## Real profiling contract

Use the durable production Profiling Agent path, not the legacy SQL-only `profiling.run_profile(...)` helper.

Production agent:

- key `profiling_agent`
- version `2.0`
- definition ID `a21cb836-a136-4c1c-a206-f5913522f350`

Relevant tables:

- `agent.agent_runs`
- `agent.agent_run_steps`
- `agent.agent_run_logs`
- `profiling.profile_runs`
- `profiling.dataset_execution_sources`
- `orchestration.job_queue`

The normal flow uses `job_type='PROFILING'` and deterministic profiling tools.

## Critical current blocker

Do not assume PR #68 completed profiling. It did not.

A new post-#68 Album canary was run against the deployed fix.

Identifiers:

- queue job `660692f1-c765-4896-8dee-deba1860c096`
- profile run `19d81626-aac8-4733-9a1d-b9c9162ab0ee`
- agent run `219303b5-83c7-4abe-a6f6-6a416f6b86d1`
- Album dataset version `f90abfb8-3e58-447f-9ff2-79ee1d70eb2d`

Final status:

- job `DEAD`
- attempts 3/3
- profile `FAILED`
- agent `FAILED`
- last error `JDBC_OPERATION_FAILED`

But source access is proven:

- `profile_dataset` succeeds on every attempt
- row_count = 347
- column_count = 3

Failure is isolated to:

- step 2 `execute_metrics`
- `PROFILING_EXECUTION_FAILED`
- `JDBC_OPERATION_FAILED`

PR #68 fixed the confirmed `public` schema fallback, but the same high-level error remains. Therefore there is another lower-level SQLite `/v1/query` incompatibility.

## First task for you

Do not enqueue more profiling jobs yet.

Trace the exact post-#68 `/v1/query` failure end-to-end:

1. Read the Album row in `profiling.dataset_execution_sources`.
2. Inspect `lib/profiling/metric-engine.ts` and confirm the exact values passed to `loadJdbcRows`.
3. Inspect `lib/connectors/jdbc.ts`, especially normalization and `/v1/query` payload assembly.
4. Inspect the Java bridge query endpoint/controller and SQL identifier construction.
5. Reproduce the exact metric-load query against the pinned Chinook fixture under Java 21.
6. Capture the real underlying bridge exception that is being mapped to `JDBC_OPERATION_FAILED`.
7. Implement the smallest SQLite-specific fix. Do not change behavior for other JDBC engines unless evidence proves it is required.
8. Add a permanent regression test that uses the same query path as deterministic metrics.
9. Run focused tests and production build.
10. Open a minimal PR and run the full Quality Gate.
11. Repair CI until green.
12. Merge only the exact verified head.
13. Verify exact-main CI, Vercel production SHA, bridge readiness and `/api/health/ready`.
14. Create a fresh Album profile/agent/job. Do not rewrite the existing dead job.
15. Require Album to complete all profiling steps with the source oracle values 347 rows / 3 columns.
16. Only after Album passes, fan out to the remaining 10 tables.

## After profiling works

Continue autonomously:

1. Profile all 11 tables.
2. Compare observed row/column evidence with the Chinook oracle.
3. Run deterministic pattern, candidate-key, outlier, sensitivity and duplicate tooling where configured.
4. Persist profile findings and quality intelligence.
5. Generate quality rule recommendations from actual profile evidence.
6. Preserve recommendations as suggestions until governed authority accepts/promotes them.
7. Execute governed quality rule runs through existing production contracts.
8. Verify PK non-null/uniqueness expectations and FK integrity using source evidence and governed rule results where appropriate.
9. Repeat profiling to establish baseline/repeat stability and comparisons.
10. Run reconciliation/audit/evidence verifiers.
11. Run global non-lineage enterprise acceptance to ensure SQLite work caused no regression.
12. Check security advisor without trying to make expected plan-related warnings disappear by weakening controls.
13. Create final SQLite E2E operating-state documentation in both `Major discussion/` and `Architecture/`.

## Security and governance constraints

- never expose secrets
- never weaken RLS to clear warnings
- do not invent lineage or transformations
- do not infer source-authoritative field lineage
- do not mark AI suggestions as human/governance authority
- do not index empty tables solely to silence performance advisor warnings
- do not delete failed job/profile evidence to make the acceptance run look clean

## Useful production facts

Before SQLite, non-lineage enterprise acceptance passed. Preserve that baseline.

The generic JDBC bridge is expected to advertise 10 engine families after SQLite support.

A Render free-tier cold start/restart can cause transient timeouts; distinguish infrastructure retries from deterministic product defects using queue attempt evidence and logs.

`job_queue.agent_run_id` is unique. Do not try to attach a second durable job to an existing agent run. If a run is terminal and its evidence must be preserved, create a new profile/agent/job for the next post-fix acceptance attempt.

## Documentation to read first

- `Major discussion/2026-09-07-chinook-sqlite-e2e-session-handover.md`
- `Architecture/2026-09-07-ADR-005-sqlite-file-backed-jdbc-source-and-profiling-boundary.md`
- `Architecture/2026-09-07-production-operating-state-and-continuation.md`
- `Architecture/2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md`
- `Architecture/2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md`

## Completion standard

Do not declare the Chinook SQLite E2E complete merely because discovery succeeds.

Completion requires real production evidence for:

- metadata discovery
- stable identity/reconciliation
- PK/FK extraction
- structural lineage
- truthful zero source transformations
- complete deterministic profiling of all 11 tables
- profile findings
- governed quality recommendations
- governed quality execution where supported
- repeat profile stability/comparison
- audit/evidence integrity
- no regression in enterprise acceptance/security contracts

Proceed autonomously until that is complete or until you can prove a genuine external blocker with the exact resource causing it.

---
