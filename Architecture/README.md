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

## Infrastructure requirements

### Current foundation

- Next.js application
- Supabase Auth
- PostgreSQL / Supabase
- PostgreSQL extensions such as pgvector where appropriate

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

## Infrastructure principle

Do not deploy the entire candidate stack at once. Introduce infrastructure only when the product capability requires it. Keep interfaces modular so managed or commercial replacements can be adopted later without rewriting DataNexus core logic.

## Architecture change log

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
