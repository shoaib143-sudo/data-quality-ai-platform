# DataNexus AI production operating state and continuation

**Date:** 2026-09-07  
**Status:** Current production checkpoint  
**Scope:** Architecture, governance authority, evidence state, runtime boundaries, and continuation path

## Current release boundary

Current production `main`:

```text
21cbd1735f958bf0126d59f33f8bb855cd8e56e1
```

The matching Vercel production deployment is `READY`, and `/api/health/ready` reports all components `READY`, including database, agents, semantic embeddings, native Databricks connector, Generic JDBC bridge, queue, outbox, governance contracts, and security.

PostgreSQL / Supabase remains the authoritative control plane. Vercel remains the application/control-plane runtime. Render remains a replaceable Java 21 / Spring Boot JDBC data-plane runtime and does not own governance authority.

## Authoritative-state boundaries

Production continues to enforce these boundaries:

- source physical metadata remains source-authoritative;
- DataNexus is authoritative for governance decisions, governed state, history, evidence, and derived intelligence;
- stable identities are preferred over mutable path-only identities;
- observation is not configuration authority;
- observation is not governance authority;
- AI suggestion is not human or governed authority;
- external references do not automatically confer internal enterprise authority;
- inferred lineage is not source-observed lineage;
- search, graph, and analytical capabilities remain rebuildable projections.

## Production non-lineage enterprise acceptance

`governance.verify_non_lineage_enterprise_acceptance(...)` returns:

```text
state = NON_LINEAGE_ENTERPRISE_ACCEPTANCE_PASSED
valid = true
```

Current target-project catalog evidence:

| Evidence | Production state |
|---|---:|
| Current physical assets | 570 |
| Current fields | 7,120 |
| Distinct current identities | 570 |
| Null current identities | 0 |
| Physical versions | 644 |
| Published catalog assets | 570 |
| Observed sources | 3 |
| Complete discovery-manifest sources | 3 |
| Generic JDBC sources | 3 |
| Observed / accepted JDBC sources | 3 |
| Multi-namespace JDBC sources | 3 |
| Repeat-scan-stable JDBC sources | 3 |

Enterprise acceptance now also embeds `catalog.verify_project_source_operational_readiness(project_id)` and requires that project-scoped operational evidence be internally consistent. It does **not** require every configured source to be observed.

Accepted scope remains Modules #1, #2 and #4 through #15.

## Module #3 remains externally blocked

Module #3 is deliberately excluded from accepted scope and remains:

```text
state: BLOCKED_EXTERNAL
blocker: DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED
required privilege: USE SCHEMA on system.access
required source objects:
  system.access.table_lineage
  system.access.column_lineage
data blocker: REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
inference allowed as source authority: false
```

No AI suggestion, human review of an AI suggestion, or metadata inference may clear this blocker or be relabeled as source-observed lineage.

## Source lifecycle and operational evidence

Configured lifecycle state and observed operational evidence are separate production contracts:

```text
catalog.data_sources.status = configured lifecycle authority
catalog.source_operational_readiness = derived discovery evidence
```

The target project currently has six configured sources:

- 3 `OBSERVED_READY`;
- 3 `UNOBSERVED`;
- 0 evidence inconsistencies;
- 0 ready-without-assets violations;
- 0 unobserved-with-evidence violations.

`catalog.verify_project_source_operational_readiness(project_id)` reports `PROJECT_SOURCE_OPERATIONAL_READINESS_GOVERNED` with `valid=true`.

The database-global compatibility verifier remains unchanged and currently sees seven sources total, with three `OBSERVED_READY` and four `UNOBSERVED`.

Authority semantic:

```text
DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE
```

This boundary is surfaced through source onboarding, discovery, governance reporting, and enterprise acceptance.

## Generic JDBC evidence

All three observed JDBC sources pass `catalog.verify_jdbc_source_acceptance(...)`.

Production evidence now proves:

- real connector execution;
- complete discovery manifests;
- frozen discovery scope;
- stable identities;
- catalog projection matching current physical discovery;
- physical version evidence;
- repeat-scan stability;
- multi-namespace discovery;
- server-side credential references without inline secret material;
- no automatic mutation of source configuration from discovery evidence.

A newly exercised PostgreSQL JDBC source produced 249 assets, 3,031 fields, and 16 namespaces. Two subsequent governed scans returned all 249 objects unchanged with zero additions, changes, missing objects, or removals.

`catalog.verify_jdbc_discovery_evidence(project_id)` currently reports three observed sources, three multi-namespace sources, and three repeat-scan-stable sources with zero violations.

## Discovery execution audit evidence

The durable execution layer now records discovery start and terminal outcome evidence for every discovery run, including system-originated runs that do not impersonate a human user.

The database-level trigger on `catalog.discovery_runs` emits correlated SYSTEM audit evidence for execution start and success/failure. Existing user-triggered queue intent evidence remains separate.

The latest production audit-chain verification is valid with zero chain failures.

## Governance reporting

Governance exports preserve dataset-grain CSV output while carrying source evidence only through exact `data_source_id` bindings. JSON exports additionally include a complete project-level source evidence collection so configured sources without dataset bindings are still visible.

Exported source evidence includes lifecycle state, operational state, discovery status, current asset count, JDBC namespace/repeat-scan/identity/projection facts, and explicit authority semantics. Credential references, JDBC URLs, passwords, and secret material are not exported.

## Security posture

`governance.verify_database_api_security_posture()` remains valid.

The Supabase security advisor is **not** clean. The expected residual warnings remain exactly:

- authenticated execution of `app_private.is_org_admin(...)` for RLS evaluation;
- authenticated execution of `app_private.is_org_member(...)` for RLS evaluation;
- authenticated execution of `app_private.is_project_admin(...)` for RLS evaluation;
- authenticated execution of `app_private.is_project_member(...)` for RLS evaluation;
- leaked-password protection disabled because the current Supabase plan does not expose that control.

The four `app_private` helpers are retained intentionally for RLS evaluation. `app_private` is not exposed through PostgREST. Do not weaken RLS or misreport these warnings as remediated.

The remaining performance-advisor backlog is intentionally deferred where tables are empty or evidence does not justify additional indexes. The latest inspection found the flagged `catalog.catalog_field_change_events` table still empty, so no speculative index was added.

## Production increments completed since the previous checkpoint

- PR #42 separated configured source lifecycle from operational discovery evidence.
- PR #44 exposed governed JDBC discovery evidence and repeat-scan facts.
- PR #45 propagated governed source evidence into governance reporting.
- PR #46 removed onboarding language that conflated `ACTIVE` lifecycle with operational readiness.
- A real Generic JDBC source was discovered across 16 namespaces and proven repeat-scan stable.
- PR #62 added durable SYSTEM audit evidence for discovery execution.
- PR #63 added project-scoped source operational-readiness verification while preserving the global verifier.
- PR #64 integrated project-scoped source operational-readiness consistency into non-lineage enterprise acceptance.

## Continuation path

Continue in this order:

1. Keep Module #3 untouched until the exact Databricks `system.access` privilege is granted and real source field-lineage data can be ingested.
2. Continue real connector onboarding only when non-secret source metadata and server-side credentials already exist; preserve multi-schema / multi-table discovery for one connection where permissions allow it.
3. Continue production acceptance and evidence UX by extending governed read models, not by creating parallel authority stores.
4. Apply security hardening only where it preserves required RLS semantics and accurately reports account-tier limitations.
5. Apply performance changes only when row volume, query shape, or measured execution evidence justifies them.
6. Re-run project readiness, JDBC evidence, database/API security, audit-chain, and full non-lineage enterprise acceptance after every material control-plane or catalog change.
7. Treat the Module #3 Databricks privilege and real lineage ingestion requirement as the remaining external architecture blocker, not as a reason to fabricate lineage evidence.

## Related decisions

- `2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md`
- `2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md`
- `2026-09-06-production-operating-state-and-continuation.md` for the previous checkpoint
- `../Major discussion/2026-09-06-productionization-decisions-and-truth-boundaries.md`
- `../Major discussion/2026-09-06-ai-assisted-lineage-suggestions.md`
