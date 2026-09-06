# AI-assisted lineage suggestions productionization

**Date:** 2026-09-06

## Problem

Module #3 source-authoritative lineage is still externally blocked because the Databricks principal cannot read `system.access.table_lineage` and `system.access.column_lineage` without `USE SCHEMA` on `system.access`.

The platform already has rich current metadata, including field names, catalog identities, namespaces, profiling/governance context, and multiple real JDBC sources. The question was whether AI could use that metadata to suggest likely lineage without fabricating observed lineage.

## Decision

Yes, but only as a separately governed inference layer.

DataNexus now distinguishes:
- `AI_INFERRED_METADATA`: reviewable suggestion only
- `HUMAN_CONFIRMED_AI_INFERRED`: separately promoted human-confirmed dependency
- source-observed lineage: authoritative source evidence, still unavailable for the blocked Databricks path

No AI-generated candidate is allowed to claim `observed_lineage=true`, `source_authoritative_lineage=true`, or clear Module #3.

## Implementation

PR #40 added:
- `LINEAGE` to the governed AI suggestion type model
- `lineage.manage` as the review authority for lineage suggestions
- metadata inference using the enabled `architect_agent`
- pinned inference label `metadata-lineage-heuristics-v1`
- confidence and explicit metadata-only evidence
- a server-side `/api/lineage/suggestions` action boundary
- `/lineage/suggestions` review workspace
- Accept / Reject with required human review note
- separate promotion to a governed manual edge
- production posture verifier
- Quality Gate truth-boundary contract

The generator uses naming and structural signals such as `_id` / `_key`, normalized target entity names, target keys, and namespace proximity. These are heuristics, not source transformation evidence.

## Production defects found and repaired

Production integration testing found two implementation defects before the capability was declared complete:

1. The canonical enabled agent key is `architect_agent`, not `architect`.
2. The initial promotion function used unsafe PL/pgSQL composite-row assignment forms. The final production function uses alias expansion (`s.*`, `a.*`, `la.*`) for row variables.

Because one migration name had already been recorded before its corrected function body was applied, an explicit follow-up migration reapplied the corrected production function rather than pretending the earlier migration had run with different content.

## Verification

The production transactional integration test exercised:

`Generate → inspect truth boundary → Accept → prove zero automatic lineage mutation → Promote → prove HUMAN_CONFIRMED_AI_INFERRED → prove no source-observed field mapping created → posture verifier → rollback`

The rollback restored:
- 0 temporary suggestions from the test
- 65 pre-existing lineage edges
- 0 column mappings
- 0 human-confirmed AI-inferred edges

After deployment, DataNexus generated 50 real metadata-derived candidates for the target project. Final state:
- suggestions: 50
- review status `SUGGESTED`: 50
- accepted: 0
- rejected: 0
- human promoted: 0
- truth-boundary violations: 0
- automatic-authority violations: 0
- lineage edges unchanged: 65
- source-observed column mappings unchanged: 0
- database API security: valid
- audit chain: valid
- Vercel production: READY
- platform readiness: READY after the free Render JDBC instance was awakened

## Module #3 remains blocked

AI lineage assistance is not a workaround for source-authoritative lineage ingestion.

The remaining authoritative blocker is unchanged:
- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- `USE SCHEMA` on `system.access`
- `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`

When Databricks access becomes available, real observed lineage can be ingested alongside, but never silently replaced by, the inferred suggestion layer.
