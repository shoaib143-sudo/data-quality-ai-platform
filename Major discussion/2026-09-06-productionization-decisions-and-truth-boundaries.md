# 2026-09-06 Productionization Decisions and Truth Boundaries

## Purpose

This record captures the major decisions made while moving DataNexus AI from completed governance modules toward productionized operation.

It is intentionally separate from implementation status. The goal is to preserve why certain boundaries exist so future work does not accidentally undo them.

## 1. Module #3 lineage remains deliberately blocked

Module #3 is not to be worked around until the required Databricks `system.access` permissions are available.

The missing access prevents authoritative ingestion from:

- `system.access.table_lineage`
- `system.access.column_lineage`

Decision:

- keep Module #3 formally blocked;
- retain `REAL_FIELD_LINEAGE_DATA_NOT_INGESTED`;
- do not infer or fabricate field lineage;
- do not substitute path heuristics or synthetic mappings for source lineage evidence.

This is a deliberate truth boundary, not an unfinished convenience feature.

## 2. Governance corpus: trustworthy public references are valid evidence, but not internal authority

The governance corpus may include trustworthy public material such as NIST frameworks and standards.

Origin naming should make provenance obvious, for example:

```text
ext-nist-*
```

Decision:

- public/official material can be ingested as real `EXTERNAL_REFERENCE` evidence;
- it must not be represented as a company-authored or internally approved policy;
- human approval remains a separate authority concept;
- verifier/read-model semantics should distinguish external reference corpus from adopted internal governance authority.

This avoids the false choice between calling trustworthy public standards “synthetic” and falsely treating them as enterprise policy.

## 3. AI-system inventory: synthetic systems are allowed only with explicit provenance

Synthetic/demo AI systems may be created to exercise lifecycle governance.

Naming convention:

```text
int-*  real internal systems
ext-*  external/provider/public systems
syn-*  synthetic/demo/test systems
```

Current synthetic examples use:

```text
syn-demo-*
```

Decision:

- synthetic systems remain visibly synthetic in both machine identifiers and human-readable names;
- synthetic evidence cannot silently become production authority;
- no human approval is fabricated;
- DRAFT is the safe default until exact-version approval occurs through the governed review path.

## 4. Semantic embeddings: use the existing governed Supabase provider

Production already has a Supabase Edge Function:

```text
governance-embed
```

using:

```text
gte-small
384 dimensions
```

Decision:

- treat this governed Supabase function as the built-in semantic embedding provider;
- `GOVERNANCE_EMBEDDING_URL` remains an optional self-hosted override, not a mandatory prerequisite;
- readiness must reflect the provider actually in use rather than reporting a stale “provider not configured” warning when semantic embeddings are functioning.

This keeps semantic capability inside the existing Supabase operational boundary and avoids introducing an unnecessary external API key.

## 5. Generic JDBC remains a separate runtime

The primary DataNexus application remains on Vercel.

The generic JDBC bridge is a Java 21 / Spring Boot Docker service and therefore runs separately, currently on Render.

Decision:

```text
Vercel DataNexus
      |
      +--> Supabase control plane
      +--> native Databricks connector
      +--> Generic JDBC Bridge (Render for now)
                                  |
                                  +--> enterprise JDBC sources
```

Render is not a strategic dependency. It is the current container host. The bridge must remain portable.

The detailed architecture decision is recorded in:

`Architecture/2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md`

## 6. Temporary JDBC credential model due infrastructure constraints

A dedicated secret manager cannot currently be enabled in the user’s infrastructure.

Decision:

- support a temporary server-side environment credential mode;
- keep Infisical/managed secret resolution as the preferred long-term direction;
- never place credentials in Git, browser-visible variables, JDBC URLs or ordinary governance tables.

Temporary bridge variables:

```text
JDBC_CREDENTIAL_MODE=environment
JDBC_CREDENTIAL_REF=primary-jdbc
JDBC_CREDENTIAL_USERNAME=<server-side value>
JDBC_CREDENTIAL_PASSWORD=<server-side value>
JDBC_BRIDGE_TOKEN=<server-side value>
```

Vercel only needs:

```text
JDBC_BRIDGE_URL
JDBC_BRIDGE_TOKEN
```

The database account should be least privilege and preferably read-only for discovery/profiling.

## 7. Multi-schema and multi-table access is essential

DataNexus must not assume one schema or table per connection.

Decision:

- one authorized connection can discover/profile multiple schemas and tables;
- scope selection happens at discovery/governance level;
- source-qualified identities must prevent collisions across catalogs/schemas;
- lineage and impact analysis must eventually operate across these scopes when source-authoritative lineage is available.

## 8. Supabase Auth leaked-password protection is a plan-level limitation

The Supabase project is currently on the Free plan and the leaked-password-protection control is not available there.

Decision:

- do not weaken unrelated controls to hide the advisor warning;
- keep the finding visible as a plan/account-tier limitation;
- distinguish “platform security posture verifier is valid” from “Supabase advisor has no findings.”

The latter is not currently true.

## 9. Security posture reporting must preserve tool-specific truth

There are two distinct security views:

1. DataNexus database/API security posture verifier.
2. Supabase security advisor.

Decision:

- report each independently;
- never claim the Supabase advisor is clean while pre-existing findings remain;
- remediate genuine unsafe cases but do not blindly alter intentional service-only/RLS patterns simply to eliminate linter output.

## 10. Runtime incident: first Render JDBC deploy

The first Render JDBC deployment successfully built the Docker image but failed at Spring application startup.

The non-fatal Docker warning was:

```text
appuser's uid 10001 is greater than SYS_UID_MAX 999
```

The actual fatal error was:

```text
CredentialStore: No default constructor found
```

Decision/resulting engineering rule:

- distinguish build warnings from runtime failures;
- add a full Spring application-context startup test to JDBC CI;
- keep container user non-root while removing avoidable UID warnings;
- do not ask users to change infrastructure variables when the failure is demonstrably application code.

## 11. Operational priority after module completion

Ignoring Module #3, the preferred productionization sequence is:

```text
Governance corpus truth
  -> semantic readiness
  -> security hardening
  -> AI-system operationalization
  -> generic JDBC activation
  -> full non-lineage acceptance scenario
```

The objective is not to add more nominal modules. It is to turn the completed governance control plane into a production-ready operating system with real evidence and transparent blockers.

## Standing principles reaffirmed

- Source physical metadata remains source-authoritative.
- DataNexus is authoritative for governance decisions/state/history/derived intelligence.
- Observation is separate from governed authority.
- AI suggestion is separate from human/governed authority.
- No invented lineage, classification, ownership, policy, control or approval.
- Stable identity is preferred over path-only identity.
- PostgreSQL/Supabase remains the authoritative control plane.
- Search, analytics and graph capabilities are projections.
- External infrastructure remains replaceable through stable contracts.
