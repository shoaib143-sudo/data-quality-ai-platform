# DataNexus AI Polyglot Data Platform Component Impact

**Date:** 2026-09-04  
**Status:** Current implementation impact guidance  
**Related architecture:** `Architecture/2026-09-04-ADR-002-polyglot-data-platform-and-knowledge-architecture.md`

## Purpose

This document translates ADR-002 into concrete implementation impact. It distinguishes:

1. genuinely new components that do not materially exist today;
2. existing DataNexus components that remain valid but must change responsibility, interface or storage ownership;
3. components that should not be migrated immediately because the architecture follows a workload-triggered introduction strategy.

The architecture remains additive. PostgreSQL / Supabase stays authoritative. OpenSearch, ClickHouse and any future graph implementation are rebuildable projections behind stable DataNexus interfaces.

---

# 1. New components

## 1.1 KnowledgeSearchProvider interface

**Type:** New logical component, implement now.

Purpose:

- decouple application and agent search from PostgreSQL/pgvector;
- support current PostgreSQL implementation and future OpenSearch implementation;
- provide one stable contract for keyword, semantic and hybrid retrieval;
- ensure tenant/project filters are mandatory;
- return canonical object identifiers and evidence references.

Representative contract:

```ts
interface KnowledgeSearchProvider {
  search(input: KnowledgeSearchRequest): Promise<KnowledgeSearchResult[]>
  retrieve(input: KnowledgeRetrieveRequest): Promise<KnowledgeDocument[]>
  similar(input: SimilarityRequest): Promise<KnowledgeSearchResult[]>
}
```

Initial provider:

- `PostgresKnowledgeSearchProvider`
- PostgreSQL full-text / lexical search
- existing pgvector semantic search

Future provider:

- `OpenSearchKnowledgeSearchProvider`

No UI or agent should become directly coupled to OpenSearch APIs.

---

## 1.2 OpenSearch knowledge projection

**Type:** New physical component, deferred until corpus/query scale or retrieval-quality thresholds justify it.

Primary workloads:

- English-heavy policies;
- standards;
- procedures;
- regulations;
- governance frameworks;
- glossary definitions;
- architecture and operating documentation;
- document chunks;
- incident knowledge;
- troubleshooting material;
- promoted agent memory;
- metadata discovery at large scale.

Required retrieval capabilities:

- BM25 lexical relevance;
- English analysis/stemming;
- phrase/exact matching;
- synonyms/thesaurus support where governed;
- dense vector search;
- sparse retrieval where useful;
- hybrid lexical + semantic ranking;
- tenant/project filtering;
- effective-date/version filtering;
- evidence/citation identifiers back to PostgreSQL/document records.

OpenSearch is a projection, never authoritative for policy validity, approval state or action authorization.

---

## 1.3 AnalyticsEventProvider interface

**Type:** New logical component, implement before ClickHouse introduction.

Purpose:

- isolate high-volume analytical events from OLTP domain logic;
- support current PostgreSQL persistence where required;
- allow future ClickHouse ingestion without rewriting modules;
- make event schemas explicit and versioned.

Representative events:

- profile metric observations;
- DQ score observations;
- drift/anomaly observations;
- rule execution observations;
- issue lifecycle analytical events;
- application usage events;
- agent run/step/tool-call telemetry;
- model/token/latency/error metrics;
- recommendation evaluation events;
- business benefit observations.

Representative contract:

```ts
interface AnalyticsEventProvider {
  append(events: AnalyticsEvent[]): Promise<void>
  query<T>(request: AnalyticsQuery): Promise<T>
}
```

---

## 1.4 ClickHouse analytical and telemetry plane

**Type:** New physical component, deferred until historical/telemetry volume warrants it.

Primary workloads:

- long-term profiling history;
- historical DQ observations;
- distribution and drift histories;
- observability events;
- logs, metrics and traces;
- agent/tool telemetry;
- model-version evaluation;
- recommendation effectiveness;
- learning-loop analytics;
- usage analytics;
- executive trends, health, risk and benefit analysis.

ClickHouse should not own:

- current authorization state;
- current policy truth;
- workflow decisions;
- approval state;
- remediation idempotency;
- canonical audit truth.

Those remain in PostgreSQL.

---

## 1.5 GraphProvider interface

**Type:** New logical abstraction, implement now around existing lineage traversal.

Purpose:

- decouple lineage/impact/root-cause clients from PostgreSQL table layout;
- allow PostgreSQL indexed traversal now;
- allow Apache AGE or a distributed graph engine later;
- prevent UI and agents from depending on graph-vendor query syntax.

Representative contract:

```ts
interface GraphProvider {
  neighborhood(input: NeighborhoodRequest): Promise<GraphNeighborhood>
  upstream(input: TraversalRequest): Promise<GraphNeighborhood>
  downstream(input: TraversalRequest): Promise<GraphNeighborhood>
  impact(input: ImpactRequest): Promise<ImpactGraph>
  related(input: RelationshipRequest): Promise<GraphNeighborhood>
}
```

Existing `/api/lineage/neighborhood` behavior becomes the first Postgres-backed implementation contract.

Hard requirements:

- bounded depth;
- bounded nodes/edges/frontier;
- project authorization;
- progressive expansion;
- no full-estate graph loading;
- no inferred relationship presented as authoritative lineage.

---

## 1.6 Optional Apache AGE provider

**Type:** New optional physical capability, not required now.

Use only when:

- DataNexus self-hosts PostgreSQL where AGE is operationally appropriate;
- graph queries measurably benefit from Cypher-style traversal;
- benchmarks show value over indexed relational traversal.

It must implement `GraphProvider` rather than leaking AGE-specific query syntax into domain code.

---

## 1.7 Future distributed graph provider

**Type:** New future physical component, benchmark-triggered only.

Candidate category:

- horizontally scalable open-source graph database.

Do not permanently select a vendor today.

Introduction trigger:

- measured PostgreSQL/AGE traversal cannot meet agreed latency/concurrency SLA at production graph size.

Benchmark examples at that point may include NebulaGraph, JanusGraph and contemporary alternatives.

---

## 1.8 Projection outbox and projection workers

**Type:** New critical platform component, implement before multiple physical projections are deployed.

Purpose:

- avoid synchronous dual/multi writes from application requests;
- preserve PostgreSQL as the transaction commit point;
- project committed changes asynchronously and idempotently.

Pattern:

```text
UI / Agent operation
      |
      v
PostgreSQL transaction
      |
      +--> authoritative business record
      |
      +--> projection outbox event
                 |
                 v
           Projection worker
             |    |    |
             v    v    v
         Search  Graph Analytics
```

Initial implementation may use PostgreSQL outbox + durable workers.

Later event scale may justify NATS/Kafka-compatible infrastructure, consistent with the Architecture candidate stack.

Required properties:

- idempotency;
- retries;
- dead-letter/error state;
- event versioning;
- replay;
- per-project isolation;
- projection lag observability.

---

## 1.9 Projection rebuild/reconciliation service

**Type:** New platform component.

Purpose:

- rebuild OpenSearch from authoritative records/documents;
- rebuild graph projections;
- replay analytical projections where source history permits;
- detect projection drift;
- provide projection health status.

A projection must be considered disposable/reconstructable.

---

## 1.10 Agent memory service

**Type:** New logical component built on existing agent-learning tables and future projections.

Memory categories:

1. working memory;
2. episodic memory;
3. semantic memory;
4. relational memory.

Ownership:

- canonical conversation/case/feedback/promotion state: PostgreSQL;
- searchable promoted memory: KnowledgeSearchProvider/OpenSearch;
- relationship memory: GraphProvider;
- evaluation/performance: AnalyticsEventProvider/ClickHouse.

Required learning lifecycle:

```text
interaction
  -> candidate memory
  -> evidence / feedback / verification
  -> evaluation
  -> governed promotion or rejection
  -> searchable memory projection
```

Agent memory must not silently become governance policy or authoritative metadata.

---

## 1.11 ObjectStore abstraction

**Type:** Logical abstraction may be new even though Supabase Storage/document handling already exists.

Purpose:

- avoid direct coupling to one object-store vendor;
- support Supabase Storage now and S3-compatible storage later;
- store original binary documents, exports and cold archives.

Representative workloads:

- PDF/DOCX/PPTX/XLSX originals;
- uploaded source files where appropriate;
- large reports/exports;
- diagnostic bundles;
- Parquet archival history;
- cold audit/telemetry exports.

---

# 2. Existing components that remain but need changes

## 2.1 PostgreSQL / Supabase core

**Keep:** Yes, permanently.

**Change:** Clarify authoritative ownership and prevent indefinite growth from projection-style workloads.

PostgreSQL remains authoritative for:

- tenancy, identity and permissions;
- source configuration and dataset registration;
- current metadata;
- current profiling state;
- current DQ state;
- glossary/policy/classification/CDE truth;
- stewardship/ownership;
- contracts;
- issues and workflows;
- approvals;
- agent state;
- remediation/rollback/verification;
- feedback and learning truth;
- audit truth.

Changes required:

- domain records that need downstream search/graph/analytics projection should emit outbox events;
- historical analytical tables should gain explicit retention/archive policy rather than grow forever by default;
- API/domain code must distinguish authoritative reads from projection reads;
- final authorization and policy evaluation must always re-read authoritative state.

No bulk migration out of PostgreSQL is required immediately.

---

## 2.2 Existing global search API

Current component:

- `app/api/search/route.ts`

Current behavior:

- performs lexical PostgreSQL queries across datasets, glossary, issues, policies, contracts and documents;
- calls existing semantic embedding/search functions;
- merges lexical and semantic results in application code.

**Change required:**

Refactor behind `KnowledgeSearchProvider`.

Target flow:

```text
/api/search
    |
    v
KnowledgeSearchService
    |
    v
KnowledgeSearchProvider
    |
    +--> Postgres provider now
    +--> OpenSearch provider later
```

The route must not know whether OpenSearch exists.

Preserve response contract as much as possible so UI does not need a large rewrite.

---

## 2.3 Existing semantic search / pgvector

Current components include:

- `lib/governance/semantic-search.ts`;
- `lib/governance/semantic-indexer.ts`;
- `lib/governance/semantic-document-indexer.ts`;
- PostgreSQL `governance.semantic_embeddings`;
- pgvector indexes.

**Keep:** Yes.

**Role change:** These become the initial `PostgresKnowledgeSearchProvider` implementation and fallback semantic capability, rather than the permanent only enterprise knowledge index.

Changes required:

- expose provider-neutral request/response types;
- move embedding-provider concerns below the knowledge-search service boundary;
- retain canonical object IDs, model/version and content hashes;
- make re-embedding/reindexing idempotent;
- add projection event emission for future OpenSearch indexing;
- avoid application code querying `semantic_embeddings` directly outside the provider.

No deletion of pgvector is recommended.

---

## 2.4 Existing document-content subsystem

Current components include:

- `lib/governance/document-content.ts`;
- document metadata and chunks in PostgreSQL;
- semantic document indexer;
- document UI/search integration.

**Keep:** Yes.

**Change:** Separate four responsibilities clearly.

```text
Original binary       -> ObjectStore
Document truth        -> PostgreSQL
Searchable chunks     -> KnowledgeSearchProvider
Relationships         -> GraphProvider
```

PostgreSQL should retain:

- document ID;
- project/tenant;
- version;
- file metadata;
- extraction state;
- ownership;
- policy/governance status;
- chunk/evidence identifiers where needed.

At scale, large searchable chunk text should not be assumed to remain a PostgreSQL-only serving path forever.

---

## 2.5 Business glossary

**Keep:** Existing PostgreSQL glossary tables and workflows.

Changes required:

- PostgreSQL remains authoritative for terms, definitions, approvals and mappings;
- emit knowledge-index projection events for term/version changes;
- emit graph relationship projection events for term-to-field/CDE/domain relationships;
- search screens should use `KnowledgeSearchProvider` for broad discovery while detail pages re-read PostgreSQL truth;
- ownership/version/effective-state decisions remain transactional.

---

## 2.6 Policies / classification policies / governance documents

**Keep:** PostgreSQL policy truth and document foundation.

Changes required:

- represent policy/document versions and effective state authoritatively in PostgreSQL;
- index policy clauses/sections in KnowledgeSearchProvider;
- preserve exact lexical attributes needed for English-heavy legal/governance retrieval;
- project policy-to-requirement/control/CDE/field relationships through GraphProvider;
- agent retrieval can use search projections, but authorization/action decisions must re-read PostgreSQL.

---

## 2.7 Catalog and metadata discovery

**Keep:** `catalog.*` authoritative tables and source onboarding.

Changes required:

- catalog write path emits search projection events;
- large-scale metadata discovery/search moves behind `KnowledgeSearchProvider`;
- relationship events feed GraphProvider for dataset/domain/source/field relationships;
- usage/search analytics can later feed ClickHouse;
- do not duplicate authoritative catalog ownership in OpenSearch or graph storage.

---

## 2.8 Profiling engine and profiling persistence

**Keep:** Existing profiling lifecycle and PostgreSQL canonical persistence.

PostgreSQL continues to own:

- runs;
- lifecycle state;
- current/latest result references;
- profile columns;
- findings;
- current scores;
- execution summary/evidence required for governed actions.

Changes required:

- introduce explicit analytical observation events;
- project high-volume historical metrics/distributions to `AnalyticsEventProvider`;
- keep current-state queries optimized in PostgreSQL;
- long-range trend/estate analytics should eventually query ClickHouse;
- add retention/compaction policy for PostgreSQL historical detail once ClickHouse is authoritative for analytical serving.

Do not move operational run state to ClickHouse.

---

## 2.9 Data Quality module

**Keep:** Existing DQ rules/findings/scoring/remediation/verification in PostgreSQL.

Changes required:

- current rule definitions, exceptions, approvals and scores remain PostgreSQL;
- emit DQ observation/history events to AnalyticsEventProvider;
- index explanatory findings/recommendations into KnowledgeSearchProvider where useful;
- graph-project rule-to-field, issue-to-root-cause and affected-asset relationships where materially useful;
- trend dashboards and predictive features progressively shift analytical reads to ClickHouse.

---

## 2.10 Observability module

Current implementation already stores operational/observability state in PostgreSQL.

**Keep:** PostgreSQL for current operational incidents, alert state, policies and governed action state.

**Major role change:** High-volume time-series/event history becomes an `AnalyticsEventProvider` concern.

Target split:

```text
PostgreSQL
  current alert / incident / policy / workflow state

ClickHouse
  historical observations / logs / metrics / traces / analytical events
```

OpenTelemetry should become the standard instrumentation boundary as already anticipated by Architecture.

A later ADR should decide whether ClickHouse replaces some or all future Prometheus/Loki/Tempo storage roles.

---

## 2.11 Lineage module

Current components include:

- lineage edge tables;
- lineage assets;
- lineage transformations;
- column mappings;
- lineage adapters;
- lineage impact/change-governance logic;
- bounded `/api/lineage/neighborhood` traversal;
- scalable traversal indexes.

**Keep:** All canonical lineage ingestion and current relational data.

**Change required:** Move traversal responsibility behind `GraphProvider`.

Immediate refactor:

- extract the bounded traversal implementation from the route into `PostgresGraphProvider`;
- make `/api/lineage/neighborhood` call the provider;
- make impact-analysis libraries consume provider APIs rather than directly traversing tables where practical;
- keep mutation/governed approval state in PostgreSQL regardless of graph provider;
- ensure field overlays use service-layer projections rather than client N+1 access.

Future graph migration should therefore become a provider swap rather than a UI rewrite.

---

## 2.12 Lineage Explorer UI

**Keep:** Existing overlay/context work.

Changes required:

- stop treating full lineage data as page-load data;
- use anchor-first search;
- query bounded neighborhoods;
- expand upstream/downstream on demand;
- use semantic zoom: dataset first, field when focused;
- fetch governance overlays only for visible nodes;
- cache bounded projections where safe;
- surface truncation/expansion state;
- never attempt million-node client rendering.

DB re-categorization therefore changes the explorer data-loading strategy much more than its overlay UI components.

---

## 2.13 Impact analysis and root-cause services

**Keep:** Existing impact/governance service logic.

Changes required:

- relationship discovery should use GraphProvider;
- current governance facts/authorization should remain PostgreSQL;
- historical evidence/anomaly patterns should query AnalyticsEventProvider when available;
- policy/case evidence should query KnowledgeSearchProvider;
- final persisted assessment remains PostgreSQL.

These services become orchestrators across data planes rather than SQL-heavy monoliths.

---

## 2.14 Issues and Operations Center

**Keep:** PostgreSQL issue lifecycle and workflow state.

Changes required:

- emit analytical lifecycle events;
- ClickHouse later supports MTTR, recurrence, trend, SLA and business-value analytics;
- KnowledgeSearchProvider supports similar incident/case retrieval;
- GraphProvider supports root-cause and blast-radius relationships;
- PostgreSQL remains the final source for issue status and approval/action state.

---

## 2.15 Governance audit

Current component includes PostgreSQL governance audit persistence and hash-chain hardening.

**Keep:** PostgreSQL audit truth permanently.

Changes required:

- emit audit analytical projections for long-range/grouped analysis;
- ClickHouse may serve audit analytics but not compliance truth;
- archive/export old audit material to ObjectStore where policy requires;
- projection failure must never invalidate the original PostgreSQL audit commit.

---

## 2.16 Agent orchestration / investigation agents

**Keep:** Existing governed agent execution, investigation, recommendation, remediation and verification foundations.

Changes required:

Agents should consume provider-level governed tools instead of direct database-specific access:

```text
Agent
  -> Transactional/Governance service -> PostgreSQL
  -> KnowledgeSearchProvider -> Postgres/OpenSearch
  -> GraphProvider -> Postgres/AGE/distributed graph
  -> AnalyticsEventProvider -> Postgres/ClickHouse
  -> ObjectStore -> Supabase Storage/S3-compatible
```

Agent actions must never authorize themselves from OpenSearch, graph or ClickHouse projections.

Final policy, permission, target and action state is revalidated against PostgreSQL immediately before governed execution.

---

## 2.17 Recommendation learning

Current implementation already contains durable recommendation-learning and remediation-outcome structures in PostgreSQL.

**Keep:** These as canonical learning truth.

Changes required:

- define stable learning-event schema;
- send evaluation events to AnalyticsEventProvider;
- calculate recommendation/model performance over large history in ClickHouse when introduced;
- promote validated reusable knowledge to KnowledgeSearchProvider;
- optionally project causal/relational patterns to GraphProvider;
- keep learned-memory promotion governed and auditable.

---

## 2.18 Intelligent Support Agent

**New product capability, but built largely from existing foundations.**

Required storage mapping:

- case/conversation identity and durable feedback: PostgreSQL;
- searchable documentation/cases/promoted memories: KnowledgeSearchProvider;
- component/asset/incident relationships: GraphProvider;
- tool performance, latency, success and evaluation: AnalyticsEventProvider;
- large diagnostics/documentation artifacts: ObjectStore.

The learning loop must explicitly distinguish:

- user statement;
- candidate memory;
- verified outcome;
- learning confidence;
- promoted memory;
- authoritative policy/metadata.

---

## 2.19 Reporting and executive analytics

**Keep:** Current PostgreSQL summaries where operationally useful.

Changes required:

- large historical reporting becomes AnalyticsEventProvider/ClickHouse responsibility;
- generated files go to ObjectStore;
- report metadata and governed publication state remain PostgreSQL;
- executive narrative generation may retrieve context from all planes.

---

## 2.20 Retention and archival

Existing retention/governance state remains PostgreSQL.

Changes required:

- define retention separately for each plane;
- projections can use shorter/hotter retention than authoritative records;
- long-term analytical history may move from ClickHouse to ObjectStore/Parquet;
- OpenSearch indexes must honor source deletion/effective-state rules;
- projection deletion should be driven from authoritative lifecycle events;
- graph projections must remove/reclassify relationships consistently with source truth.

---

# 3. Components that do NOT need fundamental redesign

The database re-categorization does not invalidate these foundations:

- Next.js / React application;
- Supabase Auth;
- tenant/project authorization model;
- governed capability checks;
- source connector abstractions;
- durable job lifecycle;
- profiling execution contract;
- current DQ rules/findings/remediation state machines;
- workflow approval model;
- immutable/hash-chained audit direction;
- external mutation handoff boundary;
- document extraction pipeline concept;
- existing lineage ingestion adapters;
- UI role-awareness;
- progressive autonomy model.

They need provider integration or projection events, not replacement.

---

# 4. Priority of implementation changes

## P0: implement now without deploying new databases

1. Add `KnowledgeSearchProvider` abstraction around current search/pgvector.
2. Add `GraphProvider` abstraction around current bounded PostgreSQL lineage traversal.
3. Define `AnalyticsEventProvider` event contracts.
4. Define `ObjectStore` abstraction where direct Supabase Storage coupling exists.
5. Add transactional projection outbox.
6. Add durable projection worker framework with idempotency/replay.
7. Make domain changes emit versioned projection events.
8. Add projection health/lag/error observability.
9. Ensure authorization-sensitive operations always re-read PostgreSQL truth.
10. Refactor Lineage Explorer to anchor/bounded progressive loading.

This makes current implementation future-proof without operating OpenSearch or ClickHouse yet.

## P1: introduce when English governance/document corpus grows

1. Deploy OpenSearch.
2. Implement `OpenSearchKnowledgeSearchProvider`.
3. Backfill current glossary, policy, document, architecture and support knowledge.
4. Add hybrid search quality evaluation.
5. Add searchable promoted agent memory.

## P2: introduce when analytical/telemetry volume grows

1. Deploy ClickHouse.
2. Implement ClickHouse-backed `AnalyticsEventProvider`.
3. Backfill selected historical profiling/DQ/agent events.
4. Shift long-range trend dashboards to ClickHouse.
5. Integrate OpenTelemetry event ingestion where appropriate.
6. define hot/warm/cold retention and Parquet archival.

## P3: graph engine only after measured need

1. Benchmark PostgresGraphProvider at realistic graph scale.
2. Evaluate AGE if operationally appropriate.
3. Define graph latency/concurrency SLA.
4. Only if SLA fails, benchmark distributed graph engines.
5. Add new GraphProvider implementation without changing clients.

---

# 5. Migration principle

There should be no big-bang database migration.

Correct evolution:

```text
Today
  PostgreSQL + pgvector + current object storage

Now
  + provider abstractions
  + outbox/projection framework

When search need is proven
  + OpenSearch projection

When analytical volume is proven
  + ClickHouse projection

When graph benchmark proves need
  + dedicated GraphProvider implementation
```

DataNexus application and agent APIs should remain stable throughout this evolution.

---

# 6. Summary: new vs changed

## Genuinely new logical/platform components

- KnowledgeSearchProvider;
- AnalyticsEventProvider;
- GraphProvider abstraction;
- ObjectStore abstraction where needed;
- projection outbox;
- projection workers;
- projection rebuild/reconciliation service;
- agent memory service/promotion model;
- projection health/lag monitoring.

## New physical infrastructure, but deferred

- OpenSearch;
- ClickHouse;
- optional Apache AGE;
- future distributed graph database only after benchmarks;
- optional event bus when PostgreSQL outbox throughput no longer suffices.

## Existing components that change responsibility/interface

- global search;
- pgvector semantic search/indexing;
- document content/indexing;
- business glossary;
- policies/governance documents;
- catalog/metadata discovery;
- profiling history serving;
- DQ historical analytics;
- observability history;
- lineage traversal;
- lineage explorer loading model;
- impact/root-cause orchestration;
- Operations Center analytics;
- audit analytics;
- agent tool access;
- recommendation learning/evaluation;
- reporting;
- retention/archive.

## Existing components that remain fundamentally valid

- PostgreSQL / Supabase authoritative control plane;
- Supabase Auth;
- source onboarding/connector abstraction;
- profiling execution lifecycle;
- current DQ state machines;
- workflow/approval model;
- governed execution boundaries;
- audit truth;
- progressive autonomy architecture.

The goal is therefore **re-categorization and abstraction, not reconstruction**.