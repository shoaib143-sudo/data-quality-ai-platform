# ADR-004: AI-assisted lineage truth boundary

**Date:** 2026-09-06  
**Status:** Accepted  
**Scope:** DataNexus lineage intelligence and governance authority

## Context

DataNexus can observe rich catalog metadata before a source exposes authoritative transformation lineage. The current Databricks lineage integration remains externally blocked because the DataNexus principal does not have `USE SCHEMA` on `system.access`, so real `system.access.table_lineage` and `system.access.column_lineage` evidence cannot yet be ingested.

Users still benefit from metadata-derived dependency suggestions, but those suggestions must never be represented as source-observed lineage or used to clear `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`.

## Decision

DataNexus supports a separate AI-assisted lineage suggestion layer with an explicit evidence and authority boundary.

### Evidence classes

1. **Source-observed lineage**
   - produced from authoritative source lineage or transformation evidence
   - remains the only evidence class that can satisfy the real field-lineage ingestion requirement

2. **AI-inferred metadata lineage suggestion**
   - origin: `AI_INFERRED_METADATA`
   - authority: `SUGGESTION_ONLY`
   - `observed_lineage=false`
   - `source_authoritative_lineage=false`
   - no automatic mutation of authoritative lineage

3. **Human-confirmed AI-inferred dependency**
   - origin: `HUMAN_CONFIRMED_AI_INFERRED`
   - requires an explicit accepted review plus a separate promotion action by an actor with `lineage.manage`
   - remains non-observed and non-source-authoritative after promotion

### Generation

The governed Architect Agent reads current catalog metadata and produces candidate field dependencies using the pinned inference label `metadata-lineage-heuristics-v1`.

Current signals include:
- source column `_id` or `_key` suffix
- normalized target entity/table-name match
- target key presence
- same-namespace or cross-namespace evidence

Generation records confidence and evidence in the existing governed AI suggestion model. Generation itself does not create lineage edges or column mappings.

### Review and promotion

Human review uses the shared AI governance review primitive. `LINEAGE` suggestions require `lineage.manage` for review.

Acceptance alone has no lineage mutation effect. Promotion is a separate database-authorized action and creates only a governed manual dependency edge labeled `HUMAN_CONFIRMED_AI_INFERRED`.

No AI suggestion or human-confirmed inferred dependency is written to source-observed field mappings.

### Security boundary

Generation, promotion, and posture-verification database functions are service-only RPCs. `PUBLIC`, `anon`, and `authenticated` execute privileges are revoked. The browser authenticates the user, while the server-side API invokes service-boundary RPCs that independently verify project capability for the accountable actor.

### Module #3 boundary

This capability does **not** complete Module #3.

The following remain true until real Databricks lineage is ingested:
- `DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED`
- required privilege: `USE SCHEMA` on `system.access`
- `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`
- source-authoritative lineage is not inferred

## Alternatives considered

### Populate lineage automatically from matching metadata
Rejected. It would collapse inference and observation and create false source authority.

### Treat accepted AI suggestions as observed lineage
Rejected. Human confidence does not convert derived metadata evidence into source-observed transformation evidence.

### Disable lineage functionality until Databricks permission is granted
Rejected. It unnecessarily withholds useful, clearly labeled decision support.

## Consequences

### Positive
- useful lineage hypotheses are available before source lineage access is granted
- human governance remains explicit
- every suggestion retains evidence, confidence, review status, and provenance
- the authoritative lineage blocker remains truthful
- existing governance review and audit primitives are reused

### Costs
- users must distinguish observed and inferred evidence classes
- inferred suggestions can be wrong and therefore require review
- promotion adds a human-confirmed dependency but still cannot satisfy source-lineage completeness

## Production evidence

PR #40 introduced and production-validated the capability. Transactional production testing proved the sequence:

`Generate → Accept → verify no automatic mutation → Promote → verify HUMAN_CONFIRMED_AI_INFERRED → rollback`

The rollback restored the exact baseline. After release, 50 real metadata-derived suggestions were generated as pending review. All remained `SUGGESTED`; zero were accepted or promoted automatically, lineage-edge and column-mapping counts did not change, the audit chain remained valid, database API security remained valid, and the only governance-intelligence partial blocker remained `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`.
