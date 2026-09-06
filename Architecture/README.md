# DataNexus AI Architecture

This folder is the source of truth for current architecture, architecture decisions, diagrams, infrastructure requirements, and significant architecture changes.

## Architecture principles

1. Build toward DataNexus AI's long term autonomous governance vision while using human guard rails during development and early production stages.
2. Keep ingestion, profiling, intelligence, agents, governance, and execution modular.
3. Prefer open source / free technologies where practical.
4. Make external infrastructure components replaceable through stable DataNexus interfaces.
5. Treat identity, tenancy, permissions, policy, risk, audit, evidence, verification, and rollback as architectural concerns rather than UI concerns.
6. Design operations so both the UI and governed AI agents can invoke them.
7. Do not over provision infrastructure before scale requires it.

## Current target architecture

```text
                         DataNexus AI
                              │
                 ┌────────────┴────────────┐
                 │                         │
            Web Application          AI / Agent Layer
                 │                         │
            Next.js / React          Agent Orchestrator
                 │                         │
                 └────────────┬────────────┘
                              │
                     Intelligence Layer
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
  Data Profiling         Knowledge / RAG       AI Reasoning
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                         Data Platform
                              │
      ┌───────────────┬───────┼───────┬──────────────┐
      │               │       │       │              │
  Relational       Files    Logs   Documents       APIs
      │               │       │       │              │
      └───────────────┴───────┼───────┴──────────────┘
                              │
                         Governance
                              │
              Policies / RBAC / Audit / Risk
```

## Current implementation increment

The latest accepted implementation priority remains documented in:

- `2026-08-29-ADR-001-initial-vertical-slice-and-investigation-agent.md`

The latest long-term data-platform architecture recommendation is documented in:

- `2026-09-04-ADR-002-polyglot-data-platform-and-knowledge-architecture.md`

Production runtime separation for Generic JDBC is documented in:

- `2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md`

The AI-assisted lineage evidence and authority boundary is documented in:

- `2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md`

The current production operating-state checkpoint and continuation path is documented in:

- `2026-09-06-production-operating-state-and-continuation.md`

ADR-002 keeps PostgreSQL / Supabase authoritative and standardizes replaceable logical providers for knowledge search, graph traversal, analytics and object storage. OpenSearch, ClickHouse and any dedicated graph engine are introduced only when measured workload and scale justify them.

ADR-003 keeps Vercel as the DataNexus application/control-plane runtime and places the portable Java/Spring Generic JDBC bridge on a replaceable container runtime, currently Render.

ADR-004 permits metadata-derived AI lineage suggestions only as separately labeled inference evidence. It does not allow inferred evidence to become source-observed lineage or clear the externally blocked Databricks lineage requirement.

ADR-001 narrows implementation priority to CSV and database tables, with PostgreSQL / Supabase first and Databricks next. It introduces the Data Profiling Investigation Agent as the first specialist agent and evolves the Monitor toward an issue centric AI Operations Center that includes business issue, impact, risk, recommendation, benefit, outcome, evidence, and verification.

This is a prioritisation increment, not a rejection of the broader architecture. The long term architecture continues to include unstructured documents, logs, APIs, governance knowledge, lineage, policy evaluation, and progressive autonomy.

## Current production authority model

The current operating architecture applies these boundaries:

- source physical metadata remains source-authoritative;
- DataNexus is authoritative for governance decisions, state, history and derived intelligence;
- stable identity is preferred over mutable path-only identity;
- observation is separate from governance authority;
- AI suggestion is separate from human/governed authority;
- external reference corpus does not automatically confer internal enterprise authority;
- inferred lineage remains separate from source-observed lineage;
- PostgreSQL / Supabase remains the authoritative control plane;
- search, graph and analytics remain rebuildable projections.

Current production non-lineage enterprise acceptance passes Modules #1, #2 and #4 through #15. Module #3 remains explicitly blocked by missing Databricks `USE SCHEMA` on `system.access` and must not be cleared by inferred lineage.

## Progressive autonomy architecture

```text
Observe
  ↓
Understand
  ↓
Detect
  ↓
Investigate
  ↓
Decide
  ↓
Policy / Risk Evaluation
  ├── Human approval required
  │       ↓
  │    Execute
  │
  └── Autonomous safe action
          ↓
       Execute
          ↓
       Verify
          ↓
       Learn
```

## Major architecture areas

- Application and role aware experience
- Multi tenant identity and authorization
- Data connector / ingestion layer
- Profiling and quality engine
- Metadata and catalog layer
- Lineage
- Governance knowledge and document processing
- AI reasoning and retrieval
- Agent orchestration
- Policy and risk engine
- Governed action execution
- Observability and operations
- Audit and evidence
- Data estate knowledge model
- Business impact and value measurement

## Infrastructure requirements

### Current foundation

- Next.js application
- Supabase Auth
- PostgreSQL / Supabase
- PostgreSQL extensions such as pgvector where appropriate
- Tenant scoped encrypted connection records
- Persisted profile, quality, evidence, recommendation, verification and audit data
- Portable Java 21 / Spring Boot Generic JDBC bridge for enterprise JDBC sources

### Candidate open source / free components

| Capability | Candidate | Introduction strategy |
|---|---|---|
| Data ingestion | Airbyte | Introduce as connector breadth grows |
| Profiling | ydata-profiling | Profiling engine capability |
| Data quality | Great Expectations | Rule and validation layer |
| Transformations | dbt Core | Introduce with transformation workflows |
| Metadata catalog | OpenMetadata or DataHub | Introduce when estate metadata needs exceed application metadata |
| Lineage | OpenLineage | Introduce with pipeline and transformation lineage |
| Workflow orchestration | Prefect or Airflow | Introduce as scheduling and dependency complexity grows |
| Agent orchestration | LangGraph | Introduce as multi step governed agents become active |
| Document processing | Unstructured + Apache Tika | Important for policies, standards, and other governance documents |
| Local models | Ollama | Useful for local / open model experimentation |
| Policy engine | Open Policy Agent | Important for governed autonomy |
| Telemetry | OpenTelemetry | Foundation for agent and platform observability |
| Metrics | Prometheus | Add with broader platform observability |
| Dashboards | Grafana | Add with broader operational monitoring |
| Logs | Loki | Add when centralized log operations justify it |
| Tracing | Tempo | Add with distributed agent workflows |
| Secrets | OpenBao | Later, if dedicated secrets management is required |
| Eventing | NATS or Kafka compatible infrastructure | Later, when event scale requires it |
| Search | PostgreSQL full text, then OpenSearch if needed | Start simple |
| Historical analytics / telemetry | ClickHouse | Introduce when PostgreSQL historical/telemetry workloads justify a separate analytical plane |
| Graph traversal | PostgreSQL indexed edges, optional AGE, distributed graph if benchmarked need | Keep GraphProvider replaceable; do not deploy a dedicated graph engine prematurely |
| Object storage | Supabase Storage / S3-compatible storage | Originals, large artifacts, exports and cold archives |

## Infrastructure principle

Do not deploy the entire candidate stack at once. Introduce infrastructure only when the product capability requires it. Keep interfaces modular so managed or commercial replacements can be adopted later without rewriting DataNexus core logic.

## Architecture change log

- `2026-08-29-ADR-001-initial-vertical-slice-and-investigation-agent.md` accepted the first concrete architecture increment for CSV and database profiling, secure connection onboarding, the Data Profiling Investigation Agent, and the issue centric AI Operations Center.
- `2026-09-04-ADR-002-polyglot-data-platform-and-knowledge-architecture.md` records the proposed polyglot data-plane architecture: PostgreSQL/Supabase as authoritative truth, OpenSearch as future knowledge/search projection, ClickHouse as future analytics/telemetry projection, a replaceable GraphProvider, object storage for originals/cold artifacts, and pgvector as embedded semantic capability. Physical infrastructure remains phased and workload-triggered.
- `2026-09-06-ADR-003-runtime-boundary-for-generic-jdbc.md` records the Vercel control-plane / portable JVM JDBC data-plane split, including the temporary server-side credential mode and runtime replaceability.
- `2026-09-06-ADR-004-ai-assisted-lineage-truth-boundary.md` records the separation between source-observed lineage, AI-inferred metadata suggestions, and separately promoted human-confirmed inferred dependencies while preserving the Module #3 blocker.
- `2026-09-06-production-operating-state-and-continuation.md` records the current production acceptance evidence, module state, security truth, source-operational-evidence increment, and continuation path for the next engineering agent.

Significant architecture changes should be recorded as dated ADR style Markdown files in this folder. Each change should capture:

- Date
- Status
- Decision
- Context
- Alternatives considered
- Consequences
- Migration impact
- Affected components

## Diagram policy

The latest approved diagrams should live in this folder with a short context document explaining what the diagram represents and which implementation version it reflects. Historical diagrams should not be overwritten when the change is architecturally significant.
