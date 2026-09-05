# DataNexus AI — Current Project State

> Current durable checkpoint. Treat this file, the repository, Supabase migration history, and the latest dated file under `Major discussion/` as the primary continuity sources. `PROJECT_STATE_v2.md` is historical and should not be used as the current implementation baseline.

## 1. Project identity

- Project: `data-quality-ai-platform`
- Product name: **DataNexus AI**
- GitHub: `shoaib143-sudo/data-quality-ai-platform`
- Branch: `main`
- Production: `https://data-quality-ai-platform.vercel.app`
- Supabase project ref: `tvjnavjxuehpesxcfvrx`
- Main demo project: `479813aa-72a4-4b12-b72a-74da8d2419ce`

## 2. Current Git / CI / production baseline

Current verified `main` before this state update:

```text
d3378631412edefdfee180a21cb8224646f8acd4
Gate native Databricks connector readiness
```

Quality Gate:

```text
run:        33962072205
run number: 1021
status:     completed
conclusion: success
head SHA:   d3378631412edefdfee180a21cb8224646f8acd4
```

Matching Vercel production deployment:

```text
dpl_29nsT3dhvK5dBdEindWuk24z3psE
state: READY
target: production
```

Repository operational risks remain:

- `main` is not branch protected
- required checks are not enforced through branch protection
- commits are unsigned

## 3. Platform capability state

The core production platform now includes:

- governed datasource onboarding
- CSV / file ingestion
- native PostgreSQL connector
- native Databricks connector
- generic JDBC bridge abstraction for other JDBC engines
- durable metadata discovery
- profiling and data-quality execution
- investigations and predictions
- governed specialized AI agents
- agent memory / learning
- semantic governance knowledge
- governance knowledge graph
- data contracts / certification readiness
- governed autonomy
- enterprise governance knowledge intake with human review boundaries
- Governance Control Intelligence
- automated governance evidence collection
- continuous control reconciliation
- governance finding → native issue projection
- governance intelligence brief
- specialist-agent governance intelligence consumption
- table-level lineage
- transformation lineage
- governed field-lineage ingestion
- Databricks system lineage integration path

Do not rebuild completed modules unless a live defect proves a specific layer is broken.

## 4. Native Databricks connector

Databricks no longer depends on the generic JDBC bridge.

Primary implementation:

```text
supabase/functions/dgp-databricks-connector/index.ts
```

Production Edge Function:

```text
slug:       dgp-databricks-connector
status:     ACTIVE
version:    1
verify_jwt: true
```

Native flow:

```text
DataNexus Web UI
 -> secure credential route
 -> Supabase Vault
 -> dgp-databricks-connector
 -> Unity Catalog metadata
 -> SQL Statement Execution
 -> Databricks system lineage
 -> Catalog Discovery
 -> governance lineage persistence
```

Recent native Databricks commits:

```text
122b82be  Add native Databricks connector edge function
5943d2ce  Route Databricks credentials through Supabase Vault
e95036f1  Use native Databricks edge connector
b3723ba3  Persist authoritative Databricks field lineage
36b91863  Report native Databricks connector readiness
d3378631  Gate native Databricks connector readiness
```

Production readiness currently reports:

```text
databricks_connector: READY
```

The generic JDBC bridge may remain DEGRADED. That does not block native PostgreSQL or native Databricks.

## 5. Databricks testing status

**Not complete.**

The native connector implementation is production-ready, but the requested real Web UI test has not yet been completed.

Current live evidence:

```text
registered Databricks datasources: 0
Databricks discovery runs:          0
real field lineage column mappings: 0
```

Requested test target:

```text
Catalog: dbw_clinixir
Schema:  PUB
```

The user has two Databricks workspaces available. The first has supplied SQL warehouse connection details and is the immediate test target. Do not store workspace credentials, PATs, personal passwords, service-role credentials, or bearer tokens in GitHub.

The previous password and PAT shared in chat must be treated as exposed. Do not copy their values into any repository artifact. Use a rotated PAT directly through the Web UI / approved secret boundary.

Detailed acceptance criteria and the full handover are in:

```text
Major discussion/2026-09-05-databricks-native-connector-testing-checkpoint-and-handover.md
```

## 6. Databricks field-lineage truth boundary

The connector can obtain real lineage from Databricks system lineage sources, including:

```text
system.access.table_lineage
system.access.column_lineage
```

Authoritative column mappings are persisted into:

```text
governance.lineage_column_mappings
```

Mappings sourced from Databricks column lineage are marked with authoritative provenance.

No synthetic or guessed column mapping may be inserted merely to clear the formal AI Governance Intelligence gate.

If Databricks permissions or source history do not expose real column lineage, keep the blocker open and record the exact limitation.

## 7. Formal AI Governance Intelligence state

Latest verified main demo project result:

```text
status:                    PARTIAL
failure_count:             0
partial_or_external_count: 2
```

Only remaining formal blockers:

```text
REAL_FIELD_LINEAGE_DATA_NOT_INGESTED
REAL_GOVERNANCE_CORPUS_NOT_INGESTED
```

Current field lineage:

```text
status:          DATA_PENDING
column_mappings: 0
```

Current enterprise governance corpus:

```text
status:                  BOOTSTRAP_ONLY
non_synthetic_documents: 0
```

Other major formal checks pass, including:

- semantic RAG
- audit integrity
- knowledge graph
- memory and learning
- governed autonomy
- specialized agents
- governance knowledge
- quality intelligence
- human review boundary
- CDEs
- contracts / certification
- investigation / prediction
- cross-agent collaboration
- quality-rule human approval
- Governance Control Intelligence

Latest audit-chain verification contained 634 events with zero failures.

## 8. Governance Control Intelligence

Current state:

```text
status:                PASS
mode:                  READY_PENDING_AUTHORITY
proposed_controls:     5
active_controls:       0
evaluations:           0
open_findings:         0
stale_evaluation_gaps: 0
```

Core lifecycle:

```text
Governance document
 -> requirement
 -> PROPOSED control
 -> human review
 -> ACTIVE control
 -> authoritative evidence
 -> evaluation
 -> finding
 -> governance issue
 -> agent reasoning
```

The five current control proposals remain intentionally non-authoritative because the internal source documents do not yet have genuine source-of-record / current-status / organizational approval authority established.

Never approve them merely because a demo actor technically has `policy.approve`.

## 9. Governance documents and authority blocker

Four real documents were previously ingested as pending candidates/references, producing 29 source-derived requirements.

Internal candidates include:

- Maybank CDE Identification Methodology
- Business Glossary / Data Dictionary Framework

External references include:

- EDMA Global DM Benchmark 2026
- PwC Data Governance / DA Leader Delivery Playbook 2019

They remain DRAFT / PENDING for enterprise-authority purposes.

To clear the enterprise governance corpus blocker, obtain at least one genuine organization-authoritative document with:

1. real source-of-record / provenance
2. confirmation that the document is current / approved
3. genuine organizational approval authority

Do not fabricate provenance or approval.

## 10. Governance control engine state

Implemented capabilities include:

- proposal generation from source-derived requirements
- human review boundary
- scope binding
- evidence collection
- evaluation
- findings
- findings projected into native governance issues
- automated evidence collection
- continuous reconciliation
- five-minute control evaluation SLO
- control posture read model
- deterministic governance intelligence brief
- specialist-agent consumption

Current policy contract:

```text
PROPOSE_FROM_REQUIREMENTS_HUMAN_APPROVE_BEFORE_ACTIVE_CONTINUOUS_AUTHORITATIVE_EVIDENCE_EVALUATION
```

## 11. Agent state

Eight governed production agent roles are enabled and have been exercised successfully in the formal gate.

Specialist roles consume deterministic governance intelligence through the shared specialist composition boundary.

Agent reasoning rules include:

- only ACTIVE + APPROVED controls support authoritative conclusions
- proposed controls remain non-authoritative
- formal blockers cannot be inferred away
- never fabricate enterprise policy approval, provenance, attestation, transformation lineage, evidence, or ownership

## 12. Semantic / RAG state

Formal semantic RAG currently passes with 229 persisted embeddings.

The production readiness endpoint can still show a generic semantic-provider DEGRADED state because an external `GOVERNANCE_EMBEDDING_URL` is not configured. This does not mean the formal governance semantic corpus is empty; the formal gate has persisted embeddings and passes.

Do not confuse generic readiness provider configuration with the formal semantic governance gate.

## 13. Immediate work queue

Priority order:

### 1. Complete the real Databricks Web UI test

Use the deployed native connector. Do not add another connector unless a real live defect proves it is necessary.

Expected sequence:

```text
Web UI connection
 -> secure PAT provisioning
 -> dbw_clinixir catalog discovery
 -> PUB schema discovery
 -> save datasource
 -> Catalog Discovery job
 -> metadata persistence
 -> table lineage
 -> column lineage
 -> formal gate verification
```

### 2. Fix only real defects found in that run

If the connection fails, identify the exact layer:

- PAT / Vault
- SQL warehouse / HTTP path
- Unity Catalog permission
- SQL Statement Execution
- system lineage permission / availability
- DataNexus persistence

Do not guess.

### 3. Clear field-lineage blocker only with real source evidence

A single genuine mapping in production is sufficient for the current formal count-based gate, but it must come from real Databricks lineage or another genuine transformation artifact.

### 4. Clear enterprise governance corpus blocker only with real authority

Obtain a genuinely authoritative internal governance source and complete the governed human review path.

## 14. Working rules

1. Verify live state before changing code.
2. Do not fabricate data to close a formal gate.
3. Do not store secrets in GitHub.
4. Use the smallest fix for a proven defect.
5. Run Quality Gate after meaningful code changes.
6. Verify the matching Vercel deployment is READY.
7. Re-run live database checks after production changes.
8. Preserve old project decisions in dated Major Discussion files.
9. Write a new checkpoint after the real Databricks exercise.
10. Treat current production evidence as stronger than old assumptions in historical state files.

## 15. Next handover source

The detailed continuation prompt is embedded in:

```text
Major discussion/2026-09-05-databricks-native-connector-testing-checkpoint-and-handover.md
```

A new agent should read that file before continuing Databricks testing.
