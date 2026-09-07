# ADR-005 — SQLite File-Backed JDBC Source and Profiling Boundary

Date: 2026-09-07
Status: Accepted for connector/discovery architecture; profiling runtime still has an unresolved production defect

## Context

DataNexus AI supports a generic JDBC architecture in which the application/governance control plane remains in Vercel + Supabase and a replaceable Java 21 JDBC runtime runs on Render.

SQLite introduces a material difference from network JDBC databases: it is file-backed. A local DBeaver path is not remotely reachable by the cloud bridge, even though DBeaver can open the database through JDBC locally.

The user supplied the DBeaver Chinook sample database for a full end-to-end DataNexus exercise covering ingestion, metadata, profiling, lineage, transformations, rule recommendations, quality execution, audit evidence, reconciliation, and final acceptance.

## Decision 1 — SQLite is supported as a file-backed JDBC engine, not as a fake network database

The generic JDBC runtime may support SQLite through the Xerial JDBC driver, but the runtime must receive a durable database file that is reachable from the bridge.

A local client path such as a Windows DBeaver workspace path is not a production source location.

For the Chinook acceptance fixture, the production bridge build uses a pinned upstream DBeaver Chinook artifact and verifies its checksum. This gives deterministic artifact identity without pretending that the production bridge can read the user's workstation filesystem.

Long-term product onboarding for arbitrary user SQLite files should use a governed durable upload/object-storage/mount contract rather than accepting local filesystem paths from the browser.

## Decision 2 — SQLite is schemaless

SQLite should not inherit PostgreSQL's `public` schema fallback.

Rules:

- explicit schema metadata remains authoritative if one genuinely exists
- SQLite discovery and query execution must permit no schema
- non-SQLite JDBC engines may retain their current fallback behavior where appropriate
- do not invent a namespace merely to satisfy a generic interface

PR #68 applied this principle to `lib/profiling/metric-engine.ts`.

## Decision 3 — source-native metadata may be used when the JDBC driver is defective

The Xerial driver used in production throws an internal error when `DatabaseMetaData.getImportedKeys(...)` is called against the Chinook fixture.

Therefore:

- SQLite FK extraction uses `PRAGMA foreign_key_list(...)`
- all other JDBC engines continue to use standard JDBC imported-key metadata
- the SQLite path is regression-tested against the exact Chinook fixture

This is not inference. `PRAGMA foreign_key_list` is source-declared structural metadata.

## Decision 4 — foreign keys are structural lineage, not SQL transformations

Chinook has:

- 11 declared FK relationships
- 0 views
- 0 triggers

DataNexus therefore persists 11 source-observed `REFERENCES` lineage edges and zero source SQL transformations.

No AI or human workflow may relabel those FK edges as transformation lineage.

## Decision 5 — system metadata is discoverable but not automatically promoted as user datasets

Production discovery observes 13 objects for Chinook:

- 11 user tables
- `sqlite_schema`
- SQLite auto-index metadata for `PlaylistTrack`

Only the 11 user tables were promoted to governed DataNexus datasets. System objects remain discovery/catalog evidence only.

## Decision 6 — discovery does not automatically grant dataset execution authority

Discovery and profiling are separate governed stages.

The observed catalog assets were promoted through the existing human-governed promotion contract, producing 11 `AVAILABLE` dataset versions and active JDBC execution sources.

This preserves the authority boundary between observing a source object and authorizing it for downstream execution.

## Decision 7 — real profiling acceptance must use the durable Profiling Agent path

The production acceptance run must use:

- Profiling Agent `2.0`
- `agent.agent_runs`
- `profiling.profile_runs`
- `orchestration.job_queue`
- real JDBC source execution

The legacy SQL function `profiling.run_profile(...)` is not sufficient for this acceptance because it depends on existing snapshots and does not prove the live SQLite execution path.

## Verified production state

SQLite connector/discovery capability is working in production.

Verified:

- exact production fixture identity
- SQLite JDBC engine support
- read-only runtime access
- schemaless catalog discovery
- 11 user tables
- 64 user columns
- 11 declared FKs
- 12 PK column rows due to one composite PK
- 11 source-observed structural lineage edges
- zero SQL transformations
- stable repeat reconciliation across three observations
- governed promotion of all 11 user tables
- live source profiling access for Album returning 347 rows and 3 columns

## Current unresolved defect

The post-PR #68 Album canary proves source access works but deterministic metrics do not.

Current production evidence:

- job: `660692f1-c765-4896-8dee-deba1860c096`
- profile run: `19d81626-aac8-4733-9a1d-b9c9162ab0ee`
- agent run: `219303b5-83c7-4abe-a6f6-6a416f6b86d1`
- job status: `DEAD`
- attempts: 3 / 3
- row_count persisted: 347
- column_count persisted: 3
- `profile_dataset`: succeeds
- `execute_metrics`: fails with `JDBC_OPERATION_FAILED`

PR #68 fixed one confirmed defect, the unconditional `public` schema fallback in `lib/profiling/metric-engine.ts`, but the same high-level error remains after deployment.

The next implementation must isolate the lower-level `/v1/query` failure before creating more profiling jobs.

## Required investigation boundary

Inspect, in order:

1. active `profiling.dataset_execution_sources` for the Album version
2. `lib/profiling/metric-engine.ts` payload passed to `loadJdbcRows`
3. `lib/connectors/jdbc.ts` normalization and `/v1/query` request
4. bridge query controller and identifier/schema handling
5. Xerial/SQLite SQL actually executed by the bridge
6. exact bridge exception/error mapping that becomes `JDBC_OPERATION_FAILED`

Add a permanent regression test that exercises the same query path as `execute_metrics`, not merely discovery or validation.

## Consequences

Positive:

- SQLite can be represented truthfully within the generic JDBC architecture
- source metadata remains source-authoritative
- structural lineage is available without invented transformations
- repeat discovery is stable and idempotent
- the file-backed nature of SQLite is explicit instead of hidden

Costs:

- SQLite requires engine-specific handling at several seams
- generic assumptions about namespaces are unsafe
- driver metadata APIs may require source-native fallbacks
- production profiling cannot be declared supported until deterministic metric execution is fixed

## Non-goals

This ADR does not:

- claim source SQL transformation lineage where none exists
- grant arbitrary local workstation filesystem access to the production bridge
- make AI inference source-authoritative
- bypass human promotion/governance
- weaken RLS or credential handling
- declare the Chinook E2E run complete

## Related implementation

- PR #66: initial SQLite JDBC support and structural lineage
- PR #67: SQLite `PRAGMA foreign_key_list` hotfix
- PR #68: schemaless metric namespace fallback
- current main at pause: `68d8ca47f946d34f22760e99fa69d4ce5f47154b`

## Related handover

See `Major discussion/2026-09-07-chinook-sqlite-e2e-session-handover.md` and `Major discussion/2026-09-07-next-agent-takeover-prompt.md`.
