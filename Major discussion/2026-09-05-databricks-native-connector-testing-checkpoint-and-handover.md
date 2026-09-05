# 2026-09-05 Databricks Native Connector Testing Checkpoint and Handover

## Executive status

**Databricks testing is not fully complete yet.**

The native Databricks connector is implemented, deployed, CI-gated, and reported READY in production. The remaining work is the real end-to-end Web UI exercise against the user-provided Databricks environment, specifically the `dbw_clinixir.PUB` target.

As of the latest live verification on 2026-09-05:

| Item | Status |
| --- | --- |
| Native Databricks connector implementation | COMPLETE |
| Supabase Edge Function deployment | ACTIVE |
| Web UI Databricks form | READY |
| Supabase Vault credential path | READY |
| Unity Catalog metadata path | READY |
| Databricks SQL Statement Execution path | READY |
| Databricks system table lineage path | READY |
| Authoritative column lineage persistence | IMPLEMENTED |
| Production readiness component | READY |
| Latest Quality Gate | PASS |
| Matching Vercel production deployment | READY |
| Real Databricks connection saved in production | **NOT DONE** |
| Real Databricks metadata discovery run | **NOT DONE** |
| `dbw_clinixir.PUB` production scan | **NOT DONE** |
| Real field lineage mappings in production | **0** |

Do not claim the Databricks testing exercise is complete until the Web UI has saved a real connection and a real discovery run has scanned the requested target.

## Current Git and production checkpoint

Current `main` head at the time of this checkpoint:

```text
d3378631412edefdfee180a21cb8224646f8acd4
Gate native Databricks connector readiness
```

Latest relevant commit sequence:

```text
122b82be  Add native Databricks connector edge function
5943d2ce  Route Databricks credentials through Supabase Vault
e95036f1  Use native Databricks edge connector
b3723ba3  Persist authoritative Databricks field lineage
36b91863  Report native Databricks connector readiness
d3378631  Gate native Databricks connector readiness
```

Earlier Web UI and lineage fixes that remain relevant:

```text
1f931fd7  Fix Databricks Web UI JDBC connection flow
5887404b  Honor transformation-aware lineage edge identity
21b57aad  Harden JDBC bridge readiness and Databricks catalog wiring
```

Latest GitHub Quality Gate:

```text
Run ID:     33962072205
Run number: 1021
Head SHA:   d3378631412edefdfee180a21cb8224646f8acd4
Status:     completed
Conclusion: success
```

Current matching Vercel production deployment:

```text
Deployment ID: dpl_29nsT3dhvK5dBdEindWuk24z3psE
Target:        production
State:         READY
Commit SHA:    d3378631412edefdfee180a21cb8224646f8acd4
Canonical URL: https://data-quality-ai-platform.vercel.app
```

Current production readiness reports:

```text
databricks_connector: READY
```

with the detail that the native path includes Supabase Vault, Unity Catalog metadata, SQL Statement Execution, and Databricks system lineage.

The generic JDBC bridge can still report DEGRADED because it is not fully configured. That no longer blocks Databricks. Native PostgreSQL and native Databricks remain available independently of the generic bridge.

## Why the architecture changed

The initial Databricks Web UI test exposed a real infrastructure problem: the application originally routed Databricks through the generic JDBC bridge, but no Render bridge service was deployed in the connected Render workspace.

Rather than require a separate Docker service only to complete Databricks onboarding, DataNexus now has a native Databricks connector implemented as a Supabase Edge Function.

Current Databricks path:

```text
DataNexus Web UI
  -> /api/datasets/source/credentials
  -> Supabase Vault credential reference
  -> dgp-databricks-connector
  -> Databricks Unity Catalog APIs
  -> Databricks SQL Statement Execution API
  -> system.access.table_lineage / system.access.column_lineage
  -> DataNexus catalog discovery
  -> governance lineage persistence
```

This preserves the same Web UI requirement while removing the Databricks dependency on the generic JDBC bridge.

## Native Databricks connector

Primary implementation:

```text
supabase/functions/dgp-databricks-connector/index.ts
```

The production Edge Function is active as:

```text
slug:       dgp-databricks-connector
status:     ACTIVE
version:    1
verify_jwt: true
```

The function supports these connector actions:

```text
health
credential
catalog
validate
query
lineage
```

### Security boundary

The connector:

- stores credentials in Supabase Vault using a generated `DGP_*` credential reference
- does not require the Databricks PAT to be stored in datasource metadata
- rejects embedded credentials in the JDBC URL
- restricts target hosts to Databricks hostname families
- requires a SQL warehouse HTTP path and extracts the warehouse identity from it
- requires authenticated Supabase Edge Function invocation
- uses the stored PAT as a bearer token only when calling the target Databricks APIs
- does not commit raw credentials to GitHub

A password and PAT were previously pasted into chat during testing. Their values must never be copied into GitHub, issues, logs, documentation, or source code. Treat previously pasted credentials as exposed and rotate them before production use. Replacement secrets should be entered only through the DataNexus Web UI or an approved secret-management boundary.

## Metadata discovery behavior

For Databricks, the native connector uses Unity Catalog APIs to retrieve real schemas, tables, views, and visible columns.

The intended test scope is:

```text
Catalog: dbw_clinixir
Schema:  PUB
```

The user has two Azure Databricks workspaces available. The first workspace has supplied SQL warehouse connection details and is the immediate test target. Do not place workspace hostnames, personal account credentials, PAT values, or other connection secrets into the public repository.

The discovery pipeline persists real discovered assets into `catalog.discovered_assets` and records the discovery outcome in `catalog.discovery_runs`.

## Databricks lineage behavior

For Databricks, discovery now attempts lineage for Databricks objects, not only SQL views.

The native connector can use Databricks system lineage sources, including:

```text
system.access.table_lineage
system.access.column_lineage
```

Structured Databricks lineage is persisted with authoritative provenance. Column mappings created from Databricks system lineage are marked with:

```text
authoritative_source: system.access.column_lineage
```

The catalog discovery code persists real mappings into:

```text
governance.lineage_column_mappings
```

No column mappings may be invented merely to close the formal gate. If Databricks does not expose real column-level lineage for the scanned objects, the field-lineage blocker must remain open.

## Live production data state

Live database checks at this checkpoint show:

```text
Registered Databricks sources:       0
Databricks discovery runs:           0
Real field lineage column mappings:  0
```

Therefore the connector implementation is ready, but the actual connection and scan have not yet been exercised in production.

## Formal AI Governance Intelligence gate

Latest direct production verification for the main demo project:

```text
Project:                   479813aa-72a4-4b12-b72a-74da8d2419ce
Status:                    PARTIAL
Failure count:             0
Partial/external count:    2
```

Only two blockers remain:

```text
REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
REAL_GOVERNANCE_CORPUS_NOT_INGESTED
```

Field lineage remains:

```text
status:          DATA_PENDING
column_mappings: 0
```

Enterprise governance corpus remains:

```text
status:                  BOOTSTRAP_ONLY
non_synthetic_documents: 0
```

Governance Control Intelligence remains healthy:

```text
status:               PASS
mode:                 READY_PENDING_AUTHORITY
proposed_controls:    5
active_controls:      0
evaluations:          0
open_findings:        0
stale_evaluation_gaps: 0
```

Do not activate pending governance controls or approve pending enterprise documents merely to make the gate pass.

## Databricks Web UI test acceptance criteria

The testing exercise is complete only after all applicable steps below are verified with real production evidence:

1. Open the production DataNexus Web UI.
2. Select `Databricks Unity Catalog` from the datasource form.
3. Enter the SQL warehouse server hostname and HTTP path.
4. Enter a rotated PAT directly in the Web UI. Do not paste it into chat or GitHub.
5. Set catalog `dbw_clinixir`.
6. Run `Test connection & discover`.
7. Confirm `PUB` is returned as a real schema.
8. Select `PUB` and run discovery again.
9. Confirm real tables/views are returned.
10. Select one real object and use `Save & make ready`.
11. Verify a Databricks datasource now exists in `catalog.data_sources` with `connection_kind=databricks` and only a credential reference, never the raw PAT.
12. Navigate to Catalog Discovery and queue a discovery run for the saved source.
13. Verify `catalog.discovery_runs` reaches `COMPLETED`.
14. Verify discovered assets and columns for `dbw_clinixir.PUB` were persisted.
15. Verify real Databricks table lineage if available.
16. Verify real Databricks column lineage if available.
17. Verify `governance.lineage_column_mappings` only contains mappings backed by authoritative Databricks lineage.
18. Re-run `governance.verify_ai_governance_intelligence(...)`.
19. Close the field-lineage blocker only if real column mappings are greater than zero and the ingestion evidence is genuine.

If the target workspace does not expose `system.access.column_lineage`, record the actual permission/data limitation and keep the blocker open. Do not create synthetic mappings.

## Expected failure categories during the real test

If the UI test fails, distinguish the failure layer before changing code:

### Credential failure

Examples:

- invalid/revoked PAT
- PAT does not have access to the workspace
- credential reference cannot be resolved from Supabase Vault

### SQL warehouse failure

Examples:

- incorrect HTTP path
- warehouse stopped or unavailable
- principal lacks warehouse use permission

### Unity Catalog failure

Examples:

- catalog not visible
- `PUB` not visible
- missing `USE CATALOG`, `USE SCHEMA`, `BROWSE`, or object access

### System lineage failure

Examples:

- `system.access.table_lineage` not available to the principal
- `system.access.column_lineage` not available to the principal
- requested objects have no captured column lineage

Do not interpret these failures as connector implementation defects until the actual response proves that layer is broken.

## Remaining broader platform blockers

### Field lineage

The engine and native Databricks ingestion path are implemented. The blocker is now real source data: a genuine production mapping still has not been ingested.

### Enterprise governance authority

Four real documents were previously ingested as pending references/candidates, producing 29 source-derived requirements and five proposed controls. They remain intentionally non-authoritative until genuine source-of-record/current-status and organizational approval authority are established.

The platform must not fabricate provenance, approval, ownership, attestation, policy authority, evidence, or lineage.

## Operational repository risks

Known repository operational risks remain:

- `main` is not branch protected
- required checks are not enforced through branch protection
- commits are unsigned

These are repository governance risks, not the reason Databricks testing is incomplete.

## Immediate next action

Do not build another Databricks connector. Do not reintroduce a Render/JDBC dependency for Databricks.

The immediate next action is the real Web UI exercise against `dbw_clinixir.PUB` using the native connector already deployed in production.

If the user supplies a rotated PAT through the UI and executes the test, inspect the resulting datasource, discovery run, discovered assets, lineage transformations, lineage edges, and column mappings. Fix only concrete defects observed from the live run.

---

# New-agent handover prompt

Use the following prompt when handing this project to a new engineering agent.

```text
You are taking over DataNexus AI in repository:
shoaib143-sudo/data-quality-ai-platform

Read these files first:
1. PROJECT_STATE.md
2. Major discussion/README.md
3. Major discussion/2026-09-05-databricks-native-connector-testing-checkpoint-and-handover.md
4. Architecture/2026-09-04-ADR-002-polyglot-data-platform-and-knowledge-architecture.md

Then inspect the actual current main branch and live production state before making changes.

CURRENT CHECKPOINT

Current verified main before this handover document was created:
d3378631412edefdfee180a21cb8224646f8acd4
Gate native Databricks connector readiness

Quality Gate #1021 / run 33962072205 passed on that SHA.
The matching Vercel production deployment was READY.
Production readiness reports databricks_connector: READY.
Supabase Edge Function dgp-databricks-connector is ACTIVE, version 1, verify_jwt=true.

IMPORTANT: DATBRICKS IMPLEMENTATION IS READY BUT REAL TESTING IS NOT COMPLETE.

Latest live database evidence showed:
- zero registered Databricks datasources
- zero Databricks discovery runs
- zero real governance.lineage_column_mappings for the main demo project

The immediate user-requested exercise is:
Web UI -> Databricks connection -> dbw_clinixir -> PUB -> metadata discovery -> real lineage -> formal gate verification.

Do not bypass the Web UI merely to claim connection success. The user explicitly wants connection establishment from the DataNexus Web UI as a testing exercise.

NATIVE DATABRICKS ARCHITECTURE

Use the existing native path:
DataNexus Web UI
-> secure credential route
-> Supabase Vault
-> dgp-databricks-connector
-> Unity Catalog metadata
-> Databricks SQL Statement Execution
-> system.access.table_lineage / system.access.column_lineage
-> DataNexus discovery and governance lineage persistence.

Do not require the generic JDBC bridge for Databricks. The bridge may remain DEGRADED for other JDBC engines and does not block native Databricks.

Key files:
- supabase/functions/dgp-databricks-connector/index.ts
- lib/connectors/jdbc.ts
- lib/catalog/discovery.ts
- app/datasets/jdbc-source-form.tsx
- app/api/datasets/source/credentials/route.ts
- app/api/datasets/source/discover/route.ts
- app/api/datasets/source/register/route.ts
- app/api/health/ready/route.ts
- scripts/verify-native-databricks-connector.mjs

Relevant recent commits:
- 122b82be Add native Databricks connector edge function
- 5943d2ce Route Databricks credentials through Supabase Vault
- e95036f1 Use native Databricks edge connector
- b3723ba3 Persist authoritative Databricks field lineage
- 36b91863 Report native Databricks connector readiness
- d3378631 Gate native Databricks connector readiness

SECURITY

A personal password and PAT were previously pasted into chat. Never copy or commit those values. Treat them as exposed. Use only a rotated token entered directly in the Web UI or another approved secret-entry boundary. Do not reveal service-role credentials, Supabase Vault secrets, PATs, passwords, or bearer tokens.

TRUTH BOUNDARIES

Never fabricate:
- Databricks column lineage
- governance policy authority
- document provenance/current status
- human approval
- attestation
- control evidence
- ownership
- compliance conclusions

If system.access.column_lineage returns no real mappings, the field-lineage blocker remains open.

FORMAL AI GOVERNANCE STATE

Main demo project:
479813aa-72a4-4b12-b72a-74da8d2419ce

Latest gate state before this handover:
- status PARTIAL
- failure_count 0
- partial_or_external_count 2
- field lineage blocker: REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
- enterprise corpus blocker: REAL_GOVERNANCE_CORPUS_NOT_INGESTED
- field lineage mappings: 0
- non-synthetic authoritative governance documents: 0
- Governance Control Intelligence: PASS / READY_PENDING_AUTHORITY
- proposed controls: 5
- active controls: 0

Your first job is NOT more speculative coding. Execute or support the real Web UI Databricks test. Inspect live evidence after each step. If a concrete defect appears, fix the smallest affected layer, rerun Quality Gate, verify matching Vercel production deployment, then retry the exact failed step.

SUCCESS CRITERIA

The Databricks testing exercise is complete only when:
1. a real Databricks source is saved from the Web UI,
2. dbw_clinixir.PUB metadata discovery completes,
3. real assets and columns are persisted,
4. real lineage is ingested if Databricks exposes it,
5. any column mappings are backed by system.access.column_lineage or another genuine transformation artifact,
6. the formal gate is rerun,
7. no blocker is closed using fabricated data.

If a blocker is caused by Databricks permissions or absent source lineage, state that exact external/data blocker rather than inventing an implementation fix.
```

## Preservation rule

This checkpoint records the current engineering and test boundary. Future changes should append a newer dated checkpoint rather than deleting this record. If the Databricks test succeeds, record the exact datasource ID, discovery run ID, counts, lineage evidence, formal gate result, commit SHA, CI run, and production deployment in the next checkpoint, without storing secrets.
