# DataNexus AI production operating state and continuation

**Date:** 2026-09-06  
**Status:** Current production checkpoint  
**Scope:** Architecture, governance authority, evidence state, runtime boundaries, and continuation path

## Purpose

This checkpoint records the architecture that is actually operating after the governance-module productionization work. It is not a design target. Where a capability is still blocked or only partially released, that state is called out explicitly.

## Current operating topology

```text
Users
  |
  v
Vercel: DataNexus Next.js application / API
  |
  +--> Supabase / PostgreSQL
  |      - authoritative governance control plane
  |      - catalog identity and version state
  |      - governance decisions, evidence, audit, workflows and AI authority state
  |
  +--> Native Databricks connector
  |      - source metadata discovery
  |      - source-authoritative lineage path remains externally blocked
  |
  +--> Generic JDBC bridge on Render
         - Java 21 / Spring Boot
         - portable JDBC data-plane runtime
         - PostgreSQL, SQL Server, MySQL, MariaDB, Databricks, Snowflake,
           Redshift, Oracle and Generic JDBC
```

Vercel remains the application and control-plane runtime. Render is only the current host for the portable JVM JDBC bridge and is replaceable without moving DataNexus governance authority.

## Authoritative-state boundaries

The production architecture follows these boundaries:

- source physical metadata remains source-authoritative;
- DataNexus is authoritative for governance decisions, governed state, history and derived intelligence;
- stable identities are preferred over mutable path-only identities;
- observation is not governance authority;
- AI suggestion is not human or governed authority;
- external governance references are real corpus evidence but do not confer internal policy authority;
- inferred lineage is not source-observed lineage;
- PostgreSQL / Supabase remains the authoritative control plane;
- search, graph and analytical capabilities remain rebuildable projections.

## Production catalog and enterprise acceptance evidence

The current production non-lineage enterprise verifier reports:

| Evidence | Current production state |
|---|---:|
| Current physical assets | 321 |
| Current fields | 4,089 |
| Distinct current identities | 321 |
| Null current identities | 0 |
| Physical versions | 395 |
| Published catalog assets | 321 |
| Observed sources | 2 |
| Complete discovery-manifest sources | 2 |
| Accepted Generic JDBC sources | 2 |
| Multi-namespace evidence | true |

`governance.verify_non_lineage_enterprise_acceptance(...)` currently returns `NON_LINEAGE_ENTERPRISE_ACCEPTANCE_PASSED` with `valid=true`.

The accepted scope is Modules #1, #2 and #4 through #15. Module #3 is explicitly excluded rather than silently treated as complete.

## Governance module state

### Production accepted

- #1 Metadata Catalog & Discovery
- #2 Metadata Identity / Version / Change Detection
- #4 Business Glossary / Semantics
- #5 Ownership & Stewardship
- #6 Classification & Privacy
- #7 Data Quality
- #8 Policy & Controls
- #9 Governance Workflow / Remediation
- #10 Data Contracts / Change Governance
- #11 Audit / Evidence / Reporting
- #12 AI-assisted Governance
- #13 Governance Intelligence
- #14 Autonomous Governance Agents
- #15 Governance for AI Systems

These modules are included in the production non-lineage enterprise acceptance verifier and currently pass their governed posture checks.

### Module #3: source-authoritative lineage

Module #3 remains `BLOCKED_EXTERNAL`.

Exact blocker:

```text
DATABRICKS_SYSTEM_ACCESS_PERMISSION_REQUIRED
required privilege: USE SCHEMA on system.access
required source objects:
  system.access.table_lineage
  system.access.column_lineage
data blocker: REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
```

No architecture component is permitted to infer source-authoritative lineage to clear this blocker.

## AI-assisted lineage architecture

DataNexus now has a separate governed inference layer for metadata-derived lineage suggestions. The production posture verifier currently reports:

- state: `AI_LINEAGE_SUGGESTION_BOUNDARY_GOVERNED`
- valid: `true`
- generated suggestions: 50
- accepted suggestions: 0
- human-promoted dependencies: 0
- truth-boundary violations: 0
- automatic-authority violations: 0
- authority effect: `NO_AUTOMATIC_LINEAGE_MUTATION`
- source-authoritative lineage claimed: `false`
- Module #3 blocker cleared: `false`

The allowed evidence classes are documented in ADR-004. A reviewed and separately promoted suggestion becomes `HUMAN_CONFIRMED_AI_INFERRED`; it still does not become source-observed lineage.

## Generic JDBC production architecture

Generic JDBC is no longer only a connector implementation. Production acceptance now verifies real source evidence through `catalog.verify_jdbc_source_acceptance(...)`.

Acceptance requires:

- real discovery-run evidence;
- frozen discovery scope;
- stable, non-duplicate current identities;
- current catalog projection matching physical discovery;
- physical version evidence;
- repeat-scan evidence and idempotency;
- multi-namespace evidence when required;
- credential-reference configuration without inline secret material;
- no secret material in JDBC URLs.

The current production enterprise verifier reports two observed JDBC sources and two accepted JDBC sources, including multi-namespace evidence.

## Security posture

The DataNexus database/API security verifier is valid. The Supabase advisor must still be reported separately.

Current remaining Supabase security-advisor warnings are:

- four authenticated `app_private` SECURITY DEFINER membership helpers used for RLS evaluation;
- leaked-password protection disabled on the current Supabase Free plan.

The earlier SECURITY DEFINER-view errors, browser-executable internal catalog helper warnings, and the targeted service-only RLS-without-policy findings were remediated. The advisor is therefore improved but not clean.

## Source lifecycle versus operational evidence

An additional productionization increment is currently in PR #42, `Govern source operational readiness evidence`.

Its authority rule is:

```text
catalog.data_sources.status = configured lifecycle state
catalog.source_operational_readiness = derived observation evidence
```

The derived projection does not rewrite lifecycle state.

Current evidence states are:

- `UNOBSERVED`
- `DISCOVERY_IN_PROGRESS`
- `LAST_DISCOVERY_FAILED`
- `OBSERVED_EMPTY`
- `OBSERVED_READY`
- `EVIDENCE_INCONSISTENT`

The production database migration for this increment is already applied and `catalog.verify_source_operational_readiness()` currently reports:

- `valid=true`
- total sources: 7
- `OBSERVED_READY`: 2
- `UNOBSERVED`: 5
- all violation counters: 0
- authority semantics: `DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE`

At this checkpoint PR #42 remains open. Its head is `1eac7b1eb0237a8ccf8d90ccb6d8539937bd0604`, Quality Gate is green, the other PR workflows are green, and its Vercel preview is READY. Merge, main-CI verification and post-merge production deployment verification remain to be completed.

## Current release boundary

Current `main` at this checkpoint:

```text
19538f47773fd71810d084b4445229041b61762d
```

Vercel production is READY at that SHA.

PR #42 is therefore implemented, migrated to the production database and preview-validated, but not yet merged into the production application release. Do not describe its UI/read-model changes as production-released until the merge and Vercel production verification are complete.

## Continuation path

The next agent should continue in this order:

1. Finish PR #42: inspect the exact diff, confirm CI, merge, verify main CI, verify the Vercel production SHA, rerun source-operational-readiness and non-lineage enterprise acceptance verifiers.
2. Keep Module #3 untouched until the Databricks permission becomes available.
3. Continue real Generic JDBC onboarding and acceptance when non-secret source metadata is available. One connection must be able to cover multiple schemas and tables when its database permissions allow it.
4. Surface operational-readiness and evidence state consistently through source onboarding, discovery and governance reporting without changing configured lifecycle state.
5. Continue production acceptance and evidence UX using governed read models rather than adding parallel sources of truth.
6. Continue safe security hardening only where it does not break required RLS semantics or hide account-tier limitations.
7. Re-run full non-lineage enterprise acceptance after every material control-plane or catalog change.

## Related decisions

- `2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md`
- `2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md`
- `../Major discussion/2026-09-06-productionization-decisions-and-truth-boundaries.md`
- `../Major discussion/2026-09-06-ai-assisted-lineage-suggestions.md`
- `../Major discussion/2026-09-06-progress-checkpoint-and-agent-handover.md`
