# ADR-002: Polyglot Data Platform and Knowledge Architecture

**Date:** 2026-09-04  
**Status:** Proposed architecture recommendation  
**Architecture version:** 1.2 candidate

## Decision summary

DataNexus AI should standardize the **logical data-plane contracts now**, while introducing additional physical infrastructure only when workload and scale justify it.

The recommended long-term logical architecture is:

1. **PostgreSQL / Supabase** as the authoritative transactional governance and control plane.
2. **OpenSearch** as the future knowledge-search, English-heavy governance retrieval, hybrid RAG, discovery and searchable agent-memory projection.
3. **ClickHouse** as the future analytical and telemetry plane for high-volume historical profiling, data-quality observations, observability, agent/tool telemetry, evaluation and executive analytics.
4. A stable **GraphProvider** abstraction for lineage, dependency traversal, impact analysis and the Data Estate Knowledge Graph. PostgreSQL indexed-edge traversal remains the initial implementation; Apache AGE is an optional self-hosted PostgreSQL evolution; a dedicated distributed graph engine is introduced only after benchmarks show it is required.
5. **S3-compatible object storage / Supabase Storage** for original binary and large unstructured artifacts, with searchable/extracted projections elsewhere.
6. Existing **pgvector** remains a useful embedded semantic capability and fallback. A separate vector-only database is not currently recommended.

The architecture is intentionally **polyglot but projection-oriented**. PostgreSQL is authoritative. OpenSearch, ClickHouse and any graph engine are rebuildable projections and must not become the sole source of truth for governance decisions or authorization.

## Why this decision exists

The original DataNexus architecture intentionally starts with PostgreSQL / Supabase and adds infrastructure only when capability and scale justify it. That principle remains correct. However, the long-term product is broader than CRUD metadata and profiling.

The 75-capability matrix, the issue-centric Operations Center, progressive autonomous agents, English-heavy governance documents, lineage, policy interpretation, historical quality analytics, learning loops and potentially millions of metadata objects create fundamentally different workloads:

- transactional and authorization-sensitive state,
- lexical and semantic English-language retrieval,
- large relationship traversal,
- append-heavy historical analytics,
- high-volume logs, metrics, traces and agent events,
- original binary documents and long-term archives.

No single database is the optimal long-term engine for all of these workloads. The architecture should therefore optimize by workload while preserving a single authoritative governance truth.

## Alignment with existing architecture principles

This ADR preserves the existing principles:

- modular ingestion, profiling, intelligence, agents, governance and execution;
- open-source/free-first technology choices;
- replaceable external infrastructure through stable DataNexus interfaces;
- identity, tenancy, permissions, policy, risk, evidence, audit, verification and rollback as architecture concerns;
- operations callable by both UI and governed agents;
- no premature infrastructure deployment before scale requires it.

This is an additive evolution of ADR-001, not a replacement of the profiling-first implementation direction.

## Target logical architecture

```text
                           DataNexus AI
                                │
                   ┌────────────┴────────────┐
                   │                         │
                  UI                   Governed AI Agents
                   │                         │
                   └────────────┬────────────┘
                                │
                       Governed Service APIs
                                │
       ┌────────────────────────┼─────────────────────────┐
       │                        │                         │
       ▼                        ▼                         ▼
 PostgreSQL / Supabase      OpenSearch                ClickHouse
 CONTROL / TRUTH PLANE     KNOWLEDGE PLANE           ANALYTICS PLANE
       │                        │                         │
       │                        │                         │
 Catalog                     Policies                  Profile history
 Current profiling           Standards                 DQ observations
 Current DQ state            Procedures                Drift/anomalies
 Glossary truth              Regulations               Operational events
 Policy truth                Governance frameworks     Logs/metrics/traces
 Ownership/stewardship       Glossary retrieval        Agent/tool telemetry
 Classifications/CDEs        Hybrid RAG                Evaluation history
 Workflows/approvals         Search/discovery          Usage analytics
 Agent state                 Searchable agent memory   Executive trends
 Actions/verification        Historical cases          Learning analytics
 Feedback/learning truth     Troubleshooting knowledge
 Audit truth
       │                        │                         │
       └────────────────────────┼─────────────────────────┘
                                │
                         GraphProvider API
                                │
              PostgreSQL indexed edges initially
                                │
                  Apache AGE optional evolution
                                │
           Distributed graph only when benchmarks require
                                │
                         Object Storage
                                │
              Originals / exports / Parquet archives
```

## Data-plane responsibilities

### 1. PostgreSQL / Supabase: authoritative control plane

PostgreSQL remains the permanent source of truth for information requiring strong consistency, transactional integrity, authorization, governance or auditability.

Representative authoritative entities include:

- organizations, projects, users, memberships, roles and capabilities;
- source configurations and secure credential references;
- datasets, dataset versions and current metadata;
- current profiling runs, current findings and current DQ state;
- glossary terms, policy records, policy versions and approvals;
- classifications, critical data elements, ownership and stewardship;
- data contracts, issues and incidents;
- workflows, approval requests and decisions;
- agent investigations, recommendations and confidence records;
- governed execution requests, remediation and rollback state;
- verification results and outcomes;
- human feedback and candidate/accepted learning;
- immutable or hash-chained audit evidence.

A projection must never be treated as authoritative for final action authorization.

### 2. OpenSearch: English-heavy knowledge and retrieval plane

OpenSearch is the recommended scale-up path for the governance knowledge corpus because DataNexus will contain substantial English-heavy unstructured and semi-structured material:

- policies;
- standards;
- procedures;
- regulations;
- governance frameworks;
- glossary definitions;
- data contracts and descriptions;
- architecture and operating documentation;
- incident knowledge and troubleshooting material;
- historical agent cases and promoted memory.

The retrieval requirement is not vector similarity alone. Governance queries often require both semantic understanding and exact lexical matching for terms such as article numbers, retention periods, regulation names, identifiers, CDE names and policy clauses.

The search provider should support:

- BM25 / lexical relevance;
- English analyzers, stemming, stop words, synonyms and thesauri where appropriate;
- dense-vector semantic retrieval;
- sparse/neural retrieval where useful;
- hybrid ranking;
- project/tenant filters;
- object-type filters;
- document version/effective-date filters;
- citation/evidence identifiers back to canonical records.

Existing PostgreSQL full-text search and pgvector remain the current implementation until corpus size, query load or retrieval quality justifies OpenSearch.

### 3. ClickHouse: historical analytics and telemetry plane

A major long-term workload not sufficiently represented by OLTP PostgreSQL is append-heavy historical analytical data.

Examples include:

- profile metric histories;
- DQ observations over time;
- distribution summaries and drift observations;
- rule execution histories;
- observability events;
- issue and incident analytical histories;
- application usage events;
- agent runs, steps and tool calls;
- latency, errors, token/model usage and cost signals;
- recommendation/evaluation outcomes;
- model-version comparisons;
- learning-loop effectiveness;
- enterprise health/risk/benefit trends.

PostgreSQL should retain current truth and canonical business records. ClickHouse should become the large historical analytical projection when volume justifies it.

This separation enables queries such as:

- three-year DQ trends across all regulatory datasets;
- recommendation acceptance rate by model and capability;
- confidence versus verified success rate;
- average investigation time by root-cause category;
- recurring issue frequency after remediation;
- top domains by risk trend;
- agent tool latency and failure distributions;
- business benefit delivered over time.

ClickHouse is also a candidate unified backend for OpenTelemetry-derived logs, metrics and traces, potentially reducing the need to operate separate Prometheus, Loki and Tempo stores. That consolidation should be evaluated in a later observability ADR rather than assumed automatically.

### 4. GraphProvider: lineage and Data Estate Knowledge Graph

The architectural decision is to standardize a **provider contract**, not a graph vendor today.

The graph domain will eventually include relationships among:

- policies and requirements;
- requirements and controls;
- business terms and critical data elements;
- datasets and columns;
- transformations and pipelines;
- reports and business processes;
- owners and stewards;
- profile results and findings;
- rules and violations;
- incidents and root causes;
- investigations and remediation;
- outcomes and learned patterns.

Initial GraphProvider implementation:

- PostgreSQL indexed lineage and relationship tables;
- source-side and target-side indexes;
- bounded traversal;
- server-enforced depth, node and edge ceilings;
- progressive UI expansion;
- no full-estate graph loads in the browser.

Optional intermediate implementation:

- Apache AGE if self-hosted PostgreSQL and openCypher-style graph traversal provide a measurable benefit.

Dedicated distributed graph implementation:

- only after real benchmarks show PostgreSQL/AGE cannot meet defined latency and concurrency targets;
- benchmark contemporary distributed graph candidates at that time rather than locking in a vendor years early;
- NebulaGraph and JanusGraph are examples worth benchmarking, not permanent commitments in this ADR.

### 5. Object storage: original and cold artifacts

Large binary files and cheap long-term archives should not be stored in graph/search databases and should not unnecessarily inflate OLTP PostgreSQL.

Object storage should contain:

- original PDF/DOCX/PPTX/XLSX/image files;
- extracted artifacts when appropriate;
- large exports;
- historical snapshots;
- Parquet archives for cold analytical history;
- reprocessing inputs.

PostgreSQL stores authoritative identity, versioning, ownership, status and governance metadata. OpenSearch stores searchable extracted/chunked projections. GraphProvider stores relationships. ClickHouse stores analytical histories.

## User and agent operation coverage

The architecture was evaluated against operations beyond the original 75-capability matrix.

| Operation family | Examples | Primary plane |
|---|---|---|
| Transactional governance | create/update dataset, approve term, assign steward | PostgreSQL |
| Authorization | role checks, policy gates, action permission | PostgreSQL |
| Bulk discovery | ingest schemas, tables and columns | PostgreSQL plus async projections |
| Current profiling | current run, columns, findings and score | PostgreSQL |
| Historical profiling | trends, distributions, comparative histories | ClickHouse |
| DQ management | rules, exceptions, approvals | PostgreSQL |
| DQ analytics | long-term trend, anomaly and benchmark analysis | ClickHouse |
| Glossary management | definitions, versions, approvals, mappings | PostgreSQL |
| Knowledge retrieval | policies, frameworks, procedures and terms | OpenSearch |
| Exact policy search | article number, regulation, time period, clause | OpenSearch |
| Semantic RAG | concept-based governance retrieval | OpenSearch / pgvector initially |
| Metadata discovery | search millions of datasets/fields | OpenSearch at scale |
| Similarity | similar fields, terms, incidents or cases | OpenSearch / pgvector |
| Lineage | upstream/downstream path traversal | GraphProvider |
| Change impact | source change to affected fields/reports/processes | GraphProvider |
| Root cause | evidence + lineage + history correlation | all relevant planes |
| Incident lifecycle | open, assign, approve, remediate, close | PostgreSQL |
| Agent investigation | retrieve evidence, state and relationships | all relevant planes |
| Agent action | authorization, idempotency, approval, execution state | PostgreSQL |
| Verification | before/after truth and historical comparison | PostgreSQL + ClickHouse |
| Learning | feedback, outcomes, promoted learning | PostgreSQL + ClickHouse + OpenSearch |
| Agent support memory | historical cases and promoted memories | PostgreSQL truth → OpenSearch retrieval |
| Operational telemetry | logs, spans, metrics, tool calls | ClickHouse at scale |
| Audit | authoritative immutable decisions/actions | PostgreSQL |
| Audit analytics | long-window analytical audit queries | ClickHouse projection |
| Executive analytics | health, risk, ROI and business outcomes | ClickHouse |
| Export/reporting | large analytical extracts | ClickHouse / object storage |
| Retention/archive | policy-driven archival or deletion | canonical plane + object storage |
| Rebuild/reindex | recreate search/graph/analytics projections | source truth + outbox/events |
| Disaster recovery | restore authoritative state and artifacts | PostgreSQL + object storage |
| Model evaluation | precision, acceptance, drift and outcome quality | ClickHouse |
| Re-embedding | new embedding models without rewriting truth | OpenSearch/pgvector projection |

## 75-capability matrix alignment

The architecture supports the existing strategic capability universe as follows:

### Capabilities 1-17: profiling, classification, DQ, anomaly, drift and prediction

- PostgreSQL for authoritative/current state.
- ClickHouse for historical trends, large-scale comparison and prediction inputs.
- OpenSearch when governance context is required for explanation.

### Capabilities 18-25: root cause, correlation, integrity, policy and regulation mapping

- PostgreSQL for evidence and current facts.
- GraphProvider for dependencies and relationship traversal.
- OpenSearch for policy/standards retrieval.
- ClickHouse for historical signal correlation.

### Capabilities 26-32: classification, glossary, metadata, ownership, lineage and impact

- PostgreSQL for canonical governance truth.
- OpenSearch for discovery/semantic retrieval.
- GraphProvider for lineage and impact traversal.

### Capabilities 33-46: incident, risk, remediation, approval, verification and rollback

- PostgreSQL for controlled workflow and durable action state.
- GraphProvider for impact.
- OpenSearch for policy/evidence context.
- ClickHouse for trends and before/after analytical comparison.

### Capabilities 47-59: specialist agents and natural-language experiences

Agents operate through stable governed service interfaces across all planes. No agent receives unrestricted raw database credentials or direct authority based on a projection.

### Capabilities 60-65: RAG, policy-aware AI, risk-aware autonomy, evidence, audit and confidence

- OpenSearch provides grounded retrieval.
- PostgreSQL provides authoritative policy state, evidence, decision and audit truth.
- GraphProvider provides relationship context.

### Capabilities 66-75: feedback learning, evaluation, monitoring and continuous improvement

- PostgreSQL is the learning ledger and canonical outcome/feedback store.
- ClickHouse evaluates learning effectiveness at scale.
- OpenSearch serves promoted searchable memory.
- GraphProvider stores promoted relationship knowledge when relevant.

## Intelligent AI support agent memory model

The intelligent support agent should distinguish four memory types rather than treating chat history as one vector store.

### Working memory

Current conversation/investigation state. Canonical store: PostgreSQL, with an agent-orchestrator checkpoint mechanism if introduced later.

### Episodic memory

Past incidents, questions, investigations, successful fixes and failed recommendations. Canonical store: PostgreSQL. Search projection: OpenSearch.

### Semantic memory

Policies, glossary definitions, procedures, manuals, architecture, troubleshooting knowledge and promoted reusable guidance. Search plane: OpenSearch, with canonical source references.

### Relational memory

How assets, policies, controls, owners, issues and outcomes relate. GraphProvider.

Agent evaluation/performance history belongs in ClickHouse at scale.

## Governed learning loop

Agent learning must be explicit, auditable and promotion-based:

```text
Interaction
  ↓
Recommendation / answer
  ↓
Human feedback and/or action outcome
  ↓
Verification
  ↓
Evaluation
  ↓
Candidate learning
  ↓
Evidence / confidence / policy check
  ↓
Promoted learning
  ↓
Search and relationship projections
```

An agent must not silently convert a user statement into authoritative policy, classification or governance truth.

Examples:

- A recurring troubleshooting pattern may become promoted agent memory after evidence and successful outcomes.
- A policy retention period remains governed policy truth and requires its formal policy workflow.
- An inferred PII classification remains a recommendation until the applicable confidence/policy/approval boundary allows promotion.

## Projection consistency architecture

DataNexus must avoid uncontrolled multi-database dual writes.

Required pattern:

```text
User / Agent
   ↓
PostgreSQL transaction
   ↓
Transactional outbox / durable event
   ↓
Projection workers
   ├── OpenSearch
   ├── ClickHouse
   └── GraphProvider
```

Properties:

- canonical state commits once;
- projections are idempotent and retryable;
- projection lag is observable;
- rebuilds are possible;
- authorization never depends solely on projection freshness;
- eventing can start with database-backed jobs/outbox and later move behind NATS/Kafka-compatible infrastructure if scale warrants it.

## Authorization rule for projections

OpenSearch, ClickHouse and graph projections may inform investigation, retrieval and impact analysis. Final authorization must re-read current authoritative policy, user/agent capability and target state from the control plane before a governed action executes.

This prevents stale search or graph projections from authorizing unsafe autonomous actions.

## Current-state versus historical-state rule

Keep application-critical current state small and fast in PostgreSQL.

Examples of PostgreSQL current state:

- latest DQ score;
- latest profile run;
- current owner;
- current certification;
- current open incident status;
- latest approved policy version.

Examples of ClickHouse historical state at scale:

- all historical DQ observations;
- profile distributions over years;
- agent telemetry;
- historical operational measurements;
- recommendation/evaluation histories;
- aggregate business-benefit trends.

## Free and open-source constraint

The target is **zero database software licensing cost and freedom to self-host**, not an assumption of unlimited free cloud infrastructure.

Recommended core technologies have free/open-source deployment paths:

- PostgreSQL: PostgreSQL License.
- Supabase self-hosted stack: open-source components.
- OpenSearch: Apache-2.0.
- ClickHouse: Apache-2.0.
- Apache AGE: Apache-2.0.

Infrastructure at enterprise scale will still consume CPU, RAM, disk and networking. DataNexus should remain deployable on self-managed infrastructure to avoid mandatory database-license fees and reduce vendor lock-in.

## Alternatives considered

### One PostgreSQL database for everything

**Use now, reject as the only permanent scale architecture.**

Benefits: lowest complexity and excellent transactional capability. Risks: growing contention between OLTP, document/search, relationship traversal and high-volume analytics workloads.

### Dedicated vector database such as Qdrant

**Not selected currently.**

Qdrant is technically strong, but OpenSearch plus pgvector already covers semantic retrieval while adding better broad lexical/document search. Adding another vector service would duplicate responsibilities without a clear DataNexus-specific benefit today.

### Neo4j Community as permanent graph database

**Not selected as a permanent free-scale standard.**

Excellent developer experience, but the free/community deployment model is not the desired final horizontal-scale commitment. It remains a possible development or benchmark option.

### NebulaGraph as permanent graph database

**Deferred from a permanent commitment.**

Distributed graph architecture is attractive, but locking DataNexus to a graph vendor before real scale measurements conflicts with replaceability and introduce-when-needed principles. Keep as a future benchmark candidate.

### JanusGraph

**Future benchmark candidate, not current recommendation.**

Strong very-large-graph potential but greater operational complexity because it typically requires additional storage/index infrastructure.

### Apache AGE

**Preferred optional intermediate graph evolution when self-hosting PostgreSQL.**

It can add graph querying without immediately adding another service. A dedicated distributed graph should still be evaluated if scale exceeds PostgreSQL/AGE targets.

### MongoDB

**Not selected.** No critical DataNexus workload currently justifies introducing a document database in addition to PostgreSQL JSONB and OpenSearch.

### Cassandra

**Not selected directly.** Introduce only if a future graph or event architecture genuinely requires it.

### Redis

**Optional cache only.** Never authoritative governance state.

### Elasticsearch

**Not selected.** OpenSearch provides the preferred free/open-source search direction for DataNexus.

### DuckDB

**Useful embedded utility, not a primary service data plane.** Appropriate for local analytical processing, exports or file workflows where helpful.

## Phased introduction

### Phase A: current

Deploy only:

- PostgreSQL / Supabase;
- PostgreSQL full-text search;
- pgvector;
- indexed bounded lineage traversal;
- object storage already required by document/file workflows.

Implement stable provider interfaces now.

### Phase B: governance knowledge scale

Introduce OpenSearch when measurable criteria justify it, for example:

- substantial policy/standards/document corpus;
- retrieval quality requiring stronger lexical+semantic hybrid search;
- metadata discovery/search load materially affecting PostgreSQL;
- support-agent searchable memory volume becoming significant.

### Phase C: historical analytics and AI operations scale

Introduce ClickHouse when:

- profile/DQ/telemetry histories materially increase PostgreSQL storage or analytical query cost;
- agent/tool telemetry becomes high-volume;
- enterprise trend/evaluation queries need fast wide scans;
- OpenTelemetry-scale operational analytics are required.

### Phase D: graph scale

Keep PostgreSQL GraphProvider until benchmarked traversal SLAs fail or operational evidence justifies another engine.

Then evaluate:

1. Apache AGE if the workload can remain within PostgreSQL scale.
2. Contemporary distributed graph engines if horizontal graph scaling is required.

A graph-engine replacement must not require changes to UI or agent contracts.

### Phase E: cold history

Move appropriate old analytical history to object storage/Parquet under retention policies while retaining useful ClickHouse hot/warm windows and canonical PostgreSQL business records.

## Stable interfaces to freeze now

```text
TransactionalStore
  implementation: PostgreSQL

KnowledgeSearchProvider
  current: PostgreSQL FTS + pgvector
  future: OpenSearch

AnalyticsEventProvider
  current: PostgreSQL where volume is small
  future: ClickHouse

GraphProvider
  current: PostgreSQL
  optional: Apache AGE
  future: benchmarked distributed graph provider

ObjectStore
  provider independent / S3 compatible
```

Business logic, UI components and AI agents should depend on these application contracts, not directly on vendor-specific APIs.

## Consequences

### Positive

- Supports the full existing 75-capability matrix plus broader human/agent operational workloads.
- Gives English-heavy governance knowledge first-class lexical and semantic retrieval.
- Creates a clean foundation for intelligent support-agent memory and learning.
- Protects transactional governance and autonomous-action authorization from projection inconsistency.
- Handles long-term historical/telemetry scale without turning OLTP PostgreSQL into an analytics warehouse.
- Avoids premature graph-vendor lock-in.
- Preserves open-source/free-software deployment paths.
- Allows each projection to be rebuilt from authoritative sources.
- Supports gradual evolution with no big-bang migration.

### Negative

- Long-term operations may include multiple data engines.
- Projection synchronization, observability and rebuild procedures become required platform capabilities.
- A provider abstraction layer must be maintained deliberately.
- Large-scale self-hosting still incurs infrastructure cost even when software licensing is free.

## Migration impact

No destructive migration is required.

Existing PostgreSQL/Supabase schemas remain authoritative. Existing pgvector investment remains useful. Current lineage tables remain valid and become the first GraphProvider implementation.

Future OpenSearch, ClickHouse and graph stores should be populated from durable projection pipelines rather than replacing PostgreSQL records.

## Immediate implementation implications

1. Continue the bounded lineage-query architecture already started.
2. Keep hard server-side depth/node/edge limits for all lineage APIs.
3. Add/retain source and target traversal indexes.
4. Avoid UI paths that load the entire metadata estate.
5. Define provider interfaces before introducing OpenSearch, ClickHouse or another graph engine.
6. Introduce a transactional outbox/projection pattern before significant multi-store writes.
7. Make projection lag/rebuild health observable.
8. Keep all final governed-action authorization against authoritative control-plane state.
9. Keep learning candidates separate from governed truth until promoted by evidence/policy.
10. Record future changes to this architecture through new ADRs rather than silently rewriting this decision.

## References inside the repository

This recommendation is based on and should be read together with:

- `Architecture/README.md`
- `Architecture/2026-08-29-ADR-001-initial-vertical-slice-and-investigation-agent.md`
- `Major discussion/2026-08-28-ai-capability-matrix.md`
- `Major discussion/2026-08-28-product-direction.md`
- `Major discussion/2026-08-28-knowledge-capture-policy.md`
- `Major discussion/2026-08-28-session-summary-and-next-plan.md`
- `Major discussion/2026-08-29-reconciliation.md`
- `Major discussion/2026-08-31-reconciliation.md`
- `Major discussion/2026-09-04-data-platform-database-recommendation.md`
