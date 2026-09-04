# Optimum Polyglot Data Platform Implementation Strategy

**Date:** 2026-09-04  
**Status:** Recommended implementation strategy  
**Related architecture:** `Architecture/2026-09-04-ADR-002-polyglot-data-platform-and-knowledge-architecture.md`

## Objective

Implement the polyglot data-plane architecture with the least disruption, least infrastructure cost, maximum reuse of current DataNexus implementation, and a clean path to future scale.

The strategy deliberately avoids a big-bang migration. PostgreSQL / Supabase remains authoritative throughout. New databases are introduced only after the application has provider abstractions, reliable projection infrastructure, measurable workload evidence, and benchmarked need.

## Core strategy

Use a **contract-first, projection-first, infrastructure-later** sequence:

1. Freeze stable logical data-plane contracts.
2. Wrap the current PostgreSQL implementations behind those contracts without changing user-visible behavior.
3. Introduce transactional outbox and projection workers.
4. Add projection health, replay, idempotency and reconciliation.
5. Refactor high-value modules to use providers rather than direct database-specific logic.
6. Publish analytical and graph/search projection events while still serving from PostgreSQL.
7. Introduce OpenSearch, ClickHouse or a graph engine only when explicit trigger metrics are met.
8. Backfill/rebuild new projections from PostgreSQL and object storage.
9. Shadow-read and compare before switching read traffic.
10. Preserve PostgreSQL as the final authorization and governance truth even after projections become active.

This sequence minimizes rework and makes every infrastructure introduction reversible.

---

## Non-negotiable implementation principles

### PostgreSQL remains authoritative

All security-sensitive, governance-sensitive and transactional decisions remain in PostgreSQL / Supabase:

- identity, tenancy and membership;
- roles, capabilities and authorization;
- source configuration and secure credential references;
- catalog and current metadata;
- current profiling and DQ state;
- glossary and policy truth;
- classification, CDE, stewardship and ownership;
- workflows and approvals;
- remediation and rollback state;
- verification and outcomes;
- agent state, feedback and learning truth;
- audit truth.

No OpenSearch, ClickHouse or graph projection may independently authorize production action.

### No uncontrolled dual writes

Business APIs must not directly write PostgreSQL and every projection store in the same request.

Required pattern:

```text
User / Agent operation
        ↓
PostgreSQL transaction
        ↓
Canonical state + outbox event commit atomically
        ↓
Projection worker
        ├─ Knowledge search projection
        ├─ Graph projection
        └─ Analytics projection
```

Projection delivery must be asynchronous, retryable and idempotent.

### Every projection is rebuildable

OpenSearch, ClickHouse and any dedicated graph engine are projections. The platform must provide a documented way to recreate them from canonical PostgreSQL records, object storage, and retained event/history sources.

### Provider contracts before providers

Application/domain code should depend on DataNexus contracts, not vendor clients.

Target contracts:

- `KnowledgeSearchProvider`
- `GraphProvider`
- `AnalyticsEventProvider`
- `AnalyticsQueryProvider`
- `ObjectStore`
- `ProjectionPublisher`
- `ProjectionCheckpointStore`

Vendor-specific implementations sit behind these interfaces.

### Bounded reads by default

Search, graph, analytics and metadata APIs must be bounded:

- pagination/cursors;
- tenant/project filters;
- maximum result counts;
- graph depth/node/edge ceilings;
- server-side filters;
- progressive loading;
- explicit timeout/query budgets where useful.

The browser must never request or render the full data estate.

---

# Implementation phases

## Phase 0: Architecture contract freeze and regression baseline

### Goal

Create a stable boundary before changing storage ownership.

### Work

1. Define shared provider interfaces and domain-neutral request/response contracts.
2. Define canonical object identifiers and tenant/project scoping rules.
3. Define projection event envelope.
4. Define idempotency, ordering and schema-version rules.
5. Capture regression fixtures for current search, lineage, profiling, DQ, governance and agent behavior.
6. Add CI contract checks so future modules cannot bypass provider boundaries accidentally.

### Recommended event envelope

Every projection event should include at least:

```text
event_id
schema_version
event_type
occurred_at
project_id
organization_id where applicable
aggregate_type
aggregate_id
aggregate_version where applicable
operation
payload or canonical projection payload reference
correlation_id
causation_id
actor_type
actor_id when appropriate
```

### Exit gate

- provider interfaces compile;
- current functionality unchanged;
- regression tests green;
- no new physical infrastructure.

---

## Phase 1: Introduce providers using PostgreSQL only

### Goal

Remove hard dependencies between application modules and future physical databases while preserving behavior.

### Workstream A: Knowledge Search

Create `PostgresKnowledgeSearchProvider` using existing:

- PostgreSQL lexical queries;
- `governance.semantic_embeddings`;
- pgvector;
- existing semantic indexers and search functions.

Refactor `/api/search` and agent knowledge retrieval to call `KnowledgeSearchProvider`.

### Workstream B: Graph

Create `PostgresGraphProvider` using existing:

- `governance.lineage_edges`;
- lineage assets;
- column mappings;
- bounded traversal indexes;
- current lineage transformation data.

Refactor `/api/lineage/neighborhood`, lineage impact and root-cause graph operations to call `GraphProvider`.

### Workstream C: Analytics

Create `PostgresAnalyticsProvider` or a no-op/query-compatible current provider for the subset of historical analytics already held in PostgreSQL.

Add a separate `AnalyticsEventProvider` contract even if its initial sink is an outbox/PostgreSQL implementation.

### Workstream D: Object Storage

Wrap current Supabase Storage/file storage behavior behind `ObjectStore`.

### Exit gate

- zero user-visible behavior change;
- search/lineage APIs no longer know vendor-specific details;
- direct PostgreSQL access remains allowed inside authoritative domain repositories but not through search/graph/analytics abstractions where projection ownership applies.

---

## Phase 2: Transactional outbox and projection control plane

### Goal

Create the reliability foundation before any external projection database is deployed.

### Required PostgreSQL structures

Add an outbox such as:

```text
platform_projection_outbox
- id
- project_id
- event_type
- aggregate_type
- aggregate_id
- aggregate_version
- schema_version
- payload
- occurred_at
- available_at
- claimed_at
- completed_at
- attempt_count
- last_error
- status
```

Also add projection checkpoints/state:

```text
projection_consumer_state
- consumer_key
- last_checkpoint
- last_success_at
- lag_seconds
- last_error
- status
```

Optional dead-letter/retry records should preserve permanently failing projection events for operator review.

### Worker requirements

Projection workers must support:

- durable claim;
- bounded batch size;
- retry with backoff;
- idempotent delivery;
- poison-event isolation;
- replay by event/range/project;
- safe shutdown;
- observability;
- no loss on worker crash.

Reuse current durable-job patterns where practical rather than introducing a separate workflow framework immediately.

### Exit gate

- transaction + event commit is atomic;
- worker crash/retry tests pass;
- duplicate event delivery is harmless;
- projection lag is measurable;
- replay works.

---

## Phase 3: Convert existing modules into projection producers

### Goal

Make domain changes emit projection-ready events while PostgreSQL still serves everything.

### Initial producer order

1. Catalog / metadata
2. Documents / policies / glossary
3. Lineage
4. Profiling
5. Data Quality
6. Issues / incidents
7. Observability
8. Agent investigations / recommendations / outcomes
9. Audit analytical projection
10. Support-agent memory when implemented

### Event examples

```text
CATALOG_DATASET_UPSERTED
CATALOG_FIELD_UPSERTED
GLOSSARY_TERM_UPSERTED
GLOSSARY_MAPPING_CHANGED
POLICY_VERSION_PUBLISHED
DOCUMENT_CONTENT_EXTRACTED
LINEAGE_EDGE_UPSERTED
LINEAGE_COLUMN_MAPPING_UPSERTED
PROFILE_RUN_COMPLETED
DQ_SCORE_CALCULATED
DQ_FINDING_CREATED
OBSERVABILITY_SIGNAL_RECORDED
ISSUE_STATE_CHANGED
AGENT_INVESTIGATION_COMPLETED
AGENT_RECOMMENDATION_VERIFIED
AGENT_FEEDBACK_RECORDED
LEARNING_MEMORY_PROMOTED
```

Events should contain enough data or stable references for projection workers to rebuild indexes without granting projection workers unrestricted business logic authority.

### Exit gate

- key modules emit deterministic projection events;
- no external databases are required for correctness;
- projection event volume is observable.

---

## Phase 4: Projection rebuild, reconciliation and shadow-read framework

### Goal

Make future store introduction safe and reversible.

### Build

1. Full reindex command/job per provider.
2. Project-scoped reindex.
3. Object-scoped replay.
4. Projection count/checksum comparisons.
5. Drift detector between canonical records and projections.
6. Shadow read mechanism for comparing current PostgreSQL result with future provider result.
7. Feature flags/provider registry for read switching.

### Example provider configuration

```text
KNOWLEDGE_SEARCH_PROVIDER=postgres
GRAPH_PROVIDER=postgres
ANALYTICS_PROVIDER=postgres
OBJECT_STORE_PROVIDER=supabase
```

Later:

```text
KNOWLEDGE_SEARCH_PROVIDER=opensearch
ANALYTICS_PROVIDER=clickhouse
GRAPH_PROVIDER=postgres
```

### Exit gate

Any projection store can be enabled, compared, disabled and rebuilt without changing domain/UI code.

---

## Phase 5: Scalable Lineage Explorer completion

### Goal

Finish the currently started transition to a long-term lineage UX.

### Required UX

```text
Search → Anchor → bounded neighborhood → progressive expansion → overlays → context drawer
```

### Required behavior

- no full-estate load;
- 1-2 hops initially;
- upstream/downstream/both;
- hard server ceilings;
- dataset semantic zoom;
- field details on demand;
- governance overlays loaded only for visible nodes;
- filters applied server-side where possible;
- explicit indication when graph is truncated;
- no inferred field lineage presented as authoritative lineage.

### Provider rule

The UI/API calls `GraphProvider`; it does not know whether the graph comes from PostgreSQL, AGE or another engine.

### Exit gate

The lineage UI remains responsive and bounded under synthetic million-object scale tests even before a dedicated graph database exists.

---

## Phase 6: Agent memory and learning contract

### Goal

Prepare DataNexus AI agents, including the future intelligent support agent, for safe continuous learning.

### Memory classes

1. Working memory
2. Episodic memory
3. Semantic memory
4. Relational memory

### Canonical rule

PostgreSQL stores authoritative memory events, feedback, verification and promotion state.

Search/graph stores contain projections only.

### Promotion flow

```text
Interaction
   ↓
Candidate memory
   ↓
Evidence + feedback + outcome
   ↓
Evaluation
   ↓
Policy/confidence threshold
   ↓
Promoted memory
   ├─ searchable projection
   └─ relational projection when applicable
```

No conversation statement automatically becomes a governance policy or authoritative fact.

### Exit gate

- memory lifecycle auditable;
- candidate/rejected/promoted states preserved;
- feedback linked to verified outcomes;
- provider-independent retrieval contract.

---

# Physical database introduction gates

## OpenSearch introduction gate

Do not add OpenSearch merely because it is part of the target architecture.

Introduce it when one or more of these are demonstrated:

- governance/policy/document corpus causes PostgreSQL lexical/pgvector retrieval latency to exceed product SLA;
- hybrid lexical + semantic relevance is measurably better for governance RAG;
- concurrent search/RAG load materially affects PostgreSQL OLTP workload;
- metadata search scale grows beyond comfortable PostgreSQL serving levels;
- agent/support memory search volume warrants an isolated search plane;
- English analyzer/synonym/thesaurus requirements become materially richer than current implementation.

### Migration sequence

1. Deploy OpenSearch free/self-hosted environment.
2. Implement `OpenSearchKnowledgeSearchProvider`.
3. Backfill using rebuild framework.
4. Consume outbox incrementally.
5. Shadow-query representative workloads.
6. Measure precision/recall/latency/tenant isolation.
7. Switch reads by feature flag.
8. Keep Postgres provider as fallback.

---

## ClickHouse introduction gate

Introduce ClickHouse when one or more are demonstrated:

- profiling/DQ historical tables materially affect PostgreSQL size or vacuum/index performance;
- observability/agent telemetry reaches high append volume;
- long-range analytical queries are too slow or expensive in PostgreSQL;
- dashboard concurrency competes with OLTP workloads;
- multi-year trend/evaluation queries become core product workflows;
- OpenTelemetry event volumes justify a columnar analytics backend.

### Migration sequence

1. Define event schemas and retention tiers.
2. Implement `ClickHouseAnalyticsProvider`.
3. Start dual projection from outbox, not direct dual writes.
4. Backfill historical analytics where useful.
5. Reconcile counts/time ranges.
6. Shadow analytical queries.
7. Move historical dashboards/reporting gradually.
8. Keep authoritative current state in PostgreSQL.

---

## Graph engine introduction gate

Do not choose a permanent distributed graph vendor now.

Remain on PostgreSQL indexed-edge traversal until benchmarks show failure against defined SLAs.

Measure at representative scales, for example:

- 1M nodes / 10M edges;
- 10M nodes / 100M edges;
- 50M nodes / 500M+ edges;
- 1-4 hop traversal;
- filtered impact queries;
- high fan-out nodes;
- concurrent investigations;
- field-level lineage with governance filters.

Possible progression:

```text
PostgresGraphProvider
      ↓ if justified
AgeGraphProvider
      ↓ if justified
DistributedGraphProvider
```

A dedicated graph engine is adopted only if it materially improves measured latency/concurrency/cost enough to justify operational complexity.

---

# Parallel workstreams

The implementation should be parallelized where dependencies allow.

## Track A: Data-plane contracts

- provider interfaces;
- provider registry;
- feature flags;
- canonical IDs;
- response contracts.

## Track B: Projection reliability

- outbox;
- workers;
- retries;
- checkpoints;
- health;
- replay/rebuild.

## Track C: Search refactor

- Postgres provider;
- route refactor;
- document/glossary/policy event producers.

## Track D: Graph refactor

- PostgresGraphProvider;
- neighborhood API refactor;
- impact/root-cause integration;
- scalable lineage UI.

## Track E: Analytics instrumentation

- analytical event taxonomy;
- profiling/DQ/observability producers;
- agent telemetry producers;
- historical retention contract.

## Track F: Agent memory/learning

- memory schema;
- feedback/outcome linkage;
- evaluation/promotion;
- retrieval tools.

Tracks A and B are the architectural critical path. C, D and E can then progress largely in parallel. F can begin once A is stable and should reuse B/E.

---

# Migration safety rules

1. **No destructive migration of canonical data to a projection database.**
2. **No projection-only authorization decisions.**
3. **No direct database clients inside UI components.**
4. **No agent raw access to database credentials or projection stores.** Agents use governed service tools.
5. **No full data-estate reads in UI APIs.**
6. **No physical database introduction without a workload trigger and benchmark.**
7. **No provider cutover without shadow validation.**
8. **No provider migration without rollback/fallback path.**
9. **No silent projection drift.** Health/reconciliation must make lag and failure visible.
10. **No learning-loop promotion without durable evidence, outcome and policy/confidence checks.**

---

# Testing strategy

## Contract tests

Every provider implementation must pass the same behavioral contract suite.

Examples:

- search tenant isolation;
- graph traversal equivalence;
- pagination/truncation semantics;
- analytics time-range semantics;
- object retrieval consistency.

## Projection reliability tests

- duplicate event;
- out-of-order event where relevant;
- worker crash after write but before ack;
- poison event;
- replay;
- rebuild;
- canonical object deletion/tombstone;
- project deletion;
- tenant isolation.

## Scale tests

Synthetic estates should be generated for:

- millions of datasets/fields;
- large search corpus;
- high-fan-out lineage;
- multi-year profile metrics;
- high-rate agent telemetry.

The purpose is to define introduction gates empirically, not assume a future database is required.

## Security tests

- cross-tenant leakage;
- stale projection authorization attempt;
- disabled/expired role;
- revoked policy/approval;
- object tombstones;
- projection worker service credentials;
- audit preservation.

---

# Recommended execution order

## P0: do now

1. Finalize provider interfaces.
2. Implement PostgreSQL provider adapters.
3. Refactor global search behind `KnowledgeSearchProvider`.
4. Refactor lineage neighborhood and impact reads behind `GraphProvider`.
5. Add transactional projection outbox.
6. Add projection worker/checkpoint/replay framework.
7. Add `AnalyticsEventProvider` and analytical event taxonomy.
8. Emit events from profiling, DQ, observability and agent workflows.
9. Add projection health/status tooling.
10. Complete anchor-driven scalable Lineage Explorer.
11. Add CI architecture guards preventing direct projection-store coupling.

## P1: prepare immediately after P0

1. Rebuild/reconciliation framework.
2. Shadow-read comparison framework.
3. Agent memory lifecycle and promotion.
4. Document/policy projection taxonomy.
5. Search relevance evaluation dataset for English-heavy governance questions.
6. Synthetic scale benchmark harness.
7. Historical analytics retention/archive policy.

## P2: deploy only when triggered

1. OpenSearch.
2. ClickHouse.
3. Apache AGE or a dedicated graph store if benchmarks require it.
4. NATS/Kafka-compatible event bus if PostgreSQL outbox throughput/consumer count justifies it.

---

# Why this is the optimum sequence

This sequence optimizes for the project's actual constraints:

- preserves all current implementation investment;
- keeps PostgreSQL/Supabase authoritative;
- introduces no unnecessary infrastructure cost now;
- avoids vendor lock-in;
- enables millions-of-object scale through bounded APIs before graph infrastructure is added;
- enables English-heavy policy/glossary RAG without forcing OpenSearch before needed;
- creates a clean path to ClickHouse for high-volume historical/agent analytics;
- supports all current and future governed AI agents through provider-based tools;
- makes agent learning durable, auditable and safe;
- allows each projection store to be rebuilt or replaced;
- provides measurable gates rather than architecture by speculation.

The highest-value implementation work is therefore **provider abstraction + transactional projections + bounded query architecture**, not immediate database deployment.

## Definition of success

This strategy is complete when:

1. users see no regression in current functionality;
2. search, graph and analytics operations depend on stable provider contracts;
3. all canonical changes can publish reliable projection events;
4. projections can be rebuilt and reconciled;
5. lineage/search APIs are bounded and scale-safe;
6. agents use governed provider-backed tools rather than database-specific access;
7. OpenSearch, ClickHouse or a future graph engine can be introduced through configuration/provider implementation rather than product rewrites;
8. the platform has benchmark data telling us exactly when each physical database is justified.
