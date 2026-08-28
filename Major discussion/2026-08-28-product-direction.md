# DataNexus AI Product Direction

**Date:** 2026-08-28

## Product name

The working product name is **DataNexus AI**.

**Tagline:** From Data Intelligence to Autonomous Data Governance.

## Strategic end state

The product should begin as an **AI powered Data Intelligence platform**. It should accumulate knowledge about the enterprise data estate, establish trust through evidence and verification, and progressively transition into an **Autonomous Data Governance platform**.

The long term operating loop is:

`Observe → Understand → Detect → Investigate → Decide → Act → Verify → Learn`

## Personas

DataNexus AI is intended to support all five major personas:

1. Data Engineers
2. Data Stewards / Data Governance teams
3. Data Architects
4. Enterprise Leadership
5. Cross persona users through role aware experiences

## Critical data priorities

Initial attention should favour:

1. Critical datasets
2. Critical data elements
3. Regulatory data
4. PII / sensitive data
5. Financial data
6. Customer data
7. Operational data

Criticality should influence risk scoring, AI permissions, escalation, and autonomy decisions.

## Data source strategy

The eventual target is **all relevant data sources**. The implementation starts with CSV and database tables, then expands into unstructured data and logs.

The architecture must not assume that CSV or relational tables are the permanent scope. It should support structured, semi structured, unstructured, API, event, and log sources over time.

## Unstructured data

Unstructured data is a first class requirement because governance knowledge can live in policies, standards, procedures, contracts, regulatory documents, reports, and similar material.

A key future flow is:

`Policy / Standard → Governance requirement → Critical Data Element → Dataset / Column → Profiling result → Quality rule → Violation → AI investigation → Remediation`

## AI autonomy guard rails

### Safe to automate initially

- Generate descriptions
- Suggest rules
- Classify columns
- Detect anomalies
- Generate profiling summaries

### Human approval initially required

- Modify data
- Delete records
- Change schemas
- Execute remediation
- Change governance policies
- Alter production pipelines

The architecture should nevertheless support progressive autonomy. Actions can move from recommendation, to approval based execution, to policy controlled autonomous execution as evidence and confidence increase.

## AI agent direction

Agents should eventually be able to investigate problems, explain causes, predict impact, recommend corrective actions, execute governed actions, verify outcomes, and learn from results.

Agent operations should have explicit identity, permissions, scope, action catalogue, risk classification, autonomy level, policy evaluation, evidence, decision records, action records, verification, rollback where appropriate, human override, and emergency disable capability.

## Data estate knowledge

The platform should progressively build a durable understanding of relationships among:

- Policies
- Business definitions
- Data domains
- Critical data elements
- Datasets
- Columns
- Pipelines
- Profiling results
- Quality rules
- Incidents
- AI investigations
- Remediation actions
- Outcomes

This can evolve into a Data Estate Knowledge Graph conceptually, even if the first implementation uses relational and vector capabilities.

## Infrastructure direction

The preferred approach is open source / free first, with modular components that can be replaced or introduced as scale requires.

Initial and candidate technologies discussed include Next.js, Supabase/PostgreSQL, pgvector, Python profiling, Great Expectations, ydata-profiling, Unstructured, Ollama, LangGraph, Open Policy Agent, OpenTelemetry, Airbyte, OpenMetadata, OpenLineage, dbt Core, Prefect, Grafana, Loki, Tempo, and other open source components as appropriate.

The platform should not introduce every component immediately. Infrastructure should be introduced in phases to avoid unnecessary operational complexity.
