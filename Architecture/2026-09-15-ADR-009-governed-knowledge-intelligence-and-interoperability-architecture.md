# ADR-009 — Governed Knowledge, Retrieval, Agent and Interoperability Architecture

**Date:** 2026-09-15  
**Status:** Proposed for implementation  
**Applies to:** Knowledge retrieval, RAG, vector search, graph projection, agent control plane, model gateway, MCP interoperability, document intelligence, and related production architecture

## Context

DataNexus has completed a substantial governance-first production foundation including identity, project isolation, authorization, RLS, durable jobs, source onboarding, discovery, profiling, lineage, governance workflows, human approval, evidence, audit, recovery, security hardening, and operational certification.

The next major architectural gap is the intelligence layer that makes these governed assets consistently retrievable, explainable, citable, reusable by agents, and safe for model-assisted workflows.

This ADR extends the existing native-first architecture. It does not replace ADR-008. ADR-008 remains authoritative for native-first agent runtime development and continuous capability parity. This ADR defines how governed knowledge, retrieval, agents, graph capabilities, models, and interoperability should compose around the existing DataNexus trust boundaries.

## Decision

DataNexus will implement a layered governed intelligence architecture with five major logical blocks:

1. **Access and Interoperability**
2. **Agent and Intelligence Control Plane**
3. **Knowledge and Retrieval Layer**
4. **Governance and Operational Core**
5. **Data and Integration Plane**

These are logical responsibility boundaries. They do not require five independent deployment units.

The existing Supabase/PostgreSQL governance and operational core remains the canonical source of truth.

## Target logical architecture

```text
Users / Applications / External Agents
                |
      Web UI / API / MCP Gateway
                |
       Identity + Policy Boundary
                |
      Agent & Intelligence Control Plane
   +------------+-------------+------------+
   |            |             |            |
 Planner    Specialists   Human HITL   Model Gateway
   |            |             |            |
   +------------ Tool Gateway -------------+
                |
         Retrieval Gateway
   +------------+-------------+------------+
   |            |             |            |
 SQL/FTS     pgvector     Graph Search   Documents
   |            |             |            |
   +---------- Knowledge Layer ------------+
                |
       DataNexus Governance Core
 Catalog / Profiling / Lineage / Policies /
 Findings / Controls / Evidence / Audit /
 Durable Jobs / Recovery / Authorization
                |
       Connectors & Ingestion Plane
 Native Connectors / JDBC / APIs / Files
                |
        Enterprise Data Sources
```

## Block 1 — Access and Interoperability

This block provides controlled entry points into DataNexus.

### Components

- Web UI;
- REST or equivalent application APIs;
- governed service APIs;
- MCP compatibility gateway;
- optional future agent-to-agent interoperability;
- CLI or SDK interfaces where justified.

### Rules

The access layer must not become a policy authority.

All external requests must enter DataNexus through identity, scope, authorization, policy, audit, and evidence boundaries before they can retrieve sensitive information or invoke a mutation.

MCP is treated as an interoperability protocol. It must not own credentials, tenant policy, mutation authority, approval policy, audit truth, or database access.

## Block 2 — Agent and Intelligence Control Plane

This block centralizes shared AI and agent runtime capabilities.

### Components

- planner and bounded planning;
- specialist agent routing;
- handoff and context filtering;
- common Tool Gateway;
- common Retrieval Gateway;
- Model Gateway;
- human-in-the-loop approval;
- checkpoint and resume;
- retries and recovery;
- duplicate-side-effect protection;
- model and tool guardrails;
- evaluation;
- observability and cost attribution.

### Agent authority model

Agents do not receive unrestricted database or connector access.

The required invocation chain is:

`Agent -> Tool Gateway -> Authorization / Policy -> Typed Tool -> Native Service / Connector -> Evidence / Audit`

Agents may reason probabilistically, but authorization, mutation rights, approval, evidence acceptance, and policy enforcement remain deterministic DataNexus responsibilities.

## Model Gateway

Model access must be centralized behind a governed gateway.

The gateway owns:

- model/provider eligibility;
- routing;
- fallback;
- model policy;
- token budgets;
- cost ceilings;
- timeout policy;
- privacy restrictions;
- structured output contracts;
- prompt/version provenance;
- usage telemetry;
- evaluation evidence.

No agent should independently embed provider credentials or bypass the model policy layer.

## Block 3 — Knowledge and Retrieval Layer

This block turns governed platform state into authorized, citable intelligence.

### Canonical storage

PostgreSQL remains canonical for governed metadata and operational truth.

### Initial retrieval stack

Use:

- PostgreSQL relational queries;
- PostgreSQL full-text search;
- pgvector semantic search;
- governed document storage;
- hybrid retrieval and result fusion;
- optional reranking;
- citation and provenance assembly.

A separate vector database is not required initially.

It may be introduced only if measured scale, latency, isolation, indexing, availability, or operational requirements demonstrate a material deficiency in the Postgres plus pgvector architecture.

## Retrieval Gateway

Agents and user-facing AI experiences should not query each retrieval backend independently.

The Retrieval Gateway is the common policy boundary for:

- project and tenant filtering;
- authorization;
- lexical search;
- semantic search;
- graph traversal;
- query routing;
- result fusion;
- reranking;
- context-size controls;
- sensitivity filtering;
- freshness checks;
- approval and authority filtering;
- citation assembly;
- deterministic no-evidence behavior.

### Required safety property

Unauthorized, expired, rejected, stale, unapproved, or out-of-scope evidence must be filtered before it is provided to a model context.

## RAG architecture

RAG is placed above governed retrieval and below agents or user-facing answer generation.

Correct flow:

`Question -> Authorization -> Query Understanding -> Hybrid Retrieval -> Optional Graph Expansion -> Reranking -> Context Assembly -> Model -> Grounded Answer -> Citations / Evidence`

RAG must not be placed inside source connectors.

Connectors remain responsible for connection, validation, discovery, ingestion, and source-specific execution.

## Knowledge model

The knowledge layer should provide a unified logical model for:

- documents;
- document chunks;
- embeddings;
- business terms;
- datasets;
- columns;
- data quality metrics and findings;
- lineage assets;
- transformations;
- field mappings;
- policies;
- controls;
- owners and stewards;
- evidence references;
- extracted entities;
- relationships;
- approval and authority state.

Each retrievable object should carry enough metadata to enforce organization/project scope, provenance, authority, approval state, effective dates, expiry, classification, evidence references, embedding/index versions, and freshness.

## Embedding and indexing architecture

Embedding generation and enrichment must be asynchronous.

Use the existing durable job architecture for:

- normalization;
- chunking;
- embedding generation;
- vector indexing;
- entity extraction;
- relationship extraction;
- graph projection;
- re-indexing after governed updates;
- pruning when content is rejected, deleted, expired, or loses authority.

Synchronous source-onboarding requests should not wait on full embedding or enrichment workflows.

## Graph architecture

Governance and lineage are naturally relationship-heavy, so graph retrieval is an important future capability. A dedicated graph database is not required for the first production milestone.

### Initial approach

Keep canonical relationships in PostgreSQL.

### Later graph projection

When runtime evidence justifies it, project selected governed relationships into a graph engine.

Authority direction:

`PostgreSQL canonical state -> governed projection process -> graph store`

The graph store must not silently become the canonical source for governance policy, ownership, approval, lineage truth, or mutation authority.

### GraphRAG

GraphRAG may combine:

- vector retrieval;
- keyword retrieval;
- relationship expansion;
- lineage traversal;
- policy applicability paths;
- ownership paths;
- control/finding relationships;
- impact-analysis paths.

All graph retrieval must pass through the Retrieval Gateway and DataNexus authorization boundary.

## Block 4 — Governance and Operational Core

The existing DataNexus core remains authoritative for:

- authentication and identity;
- organization/project isolation;
- RLS;
- source and dataset registry;
- profiling lifecycle;
- lineage truth;
- policy and control state;
- findings and quality scores;
- approval workflows;
- durable jobs;
- retries and idempotency;
- recovery and rollback;
- immutable audit;
- canonical evidence;
- model governance;
- learning authority;
- runtime certification evidence.

AI infrastructure may consume these capabilities but must not replace their authority.

## Block 5 — Data and Integration Plane

Source connectivity remains implementation-specific behind common governed contracts.

### Supported patterns

- native PostgreSQL connector;
- native Databricks connector;
- generic JDBC where appropriate;
- CSV/file ingestion;
- API and SaaS connectors;
- object/document ingestion;
- lineage metadata ingestion;
- future connector SDK.

### Credential boundary

Credentials must continue to use governed secret storage and references such as Supabase Vault rather than source metadata containing raw secrets.

MCP does not replace the connector layer.

## Control plane and data plane separation

DataNexus should make the following logical separation explicit.

### Control plane

- identity;
- authorization;
- policy;
- agents;
- planning;
- model gateway;
- approvals;
- job orchestration;
- audit;
- evaluation;
- observability;
- MCP exposure.

### Data plane

- connectors;
- source query execution;
- discovery;
- ingestion;
- profiling;
- lineage collection;
- indexing;
- graph projection;
- document processing.

This separation improves security, scaling, testing, failure isolation, and replaceability without requiring a microservice per logical component.

## Deployment philosophy

The architecture is intentionally layered without requiring excessive service decomposition.

A practical initial deployment can continue to use a small number of deployable components:

1. DataNexus Next.js application and governed APIs;
2. Supabase/PostgreSQL, pgvector, Vault, Storage, and database functions;
3. native connector Edge Functions where appropriate;
4. existing durable worker/job runtime;
5. optional graph service only after evidence justifies it.

Logical boundaries must be preserved even when multiple responsibilities share a deployable unit.

## Technology posture

| Concern | Preferred initial choice |
| --- | --- |
| Operational system of record | Supabase PostgreSQL |
| Vector search | pgvector |
| Keyword search | PostgreSQL full-text search |
| Raw governed documents | Supabase Storage or equivalent object store |
| Secrets | Supabase Vault / governed credential references |
| Background processing | Existing durable job runtime |
| Retrieval | Native DataNexus Retrieval Gateway |
| RAG | Native governed context assembly |
| Agent runtime | Native DataNexus control plane |
| Model routing | DataNexus Model Gateway |
| Graph | PostgreSQL relationships first, graph projection later |
| External interoperability | MCP compatibility layer |
| Agent-to-agent interoperability | Future optional extension |
| Observability | Canonical DataNexus evidence plus standards-compatible export |

## Implementation priorities

### P0

- knowledge model;
- pgvector enablement and governed vector schema;
- hybrid search;
- Retrieval Gateway;
- asynchronous document/chunk/embedding indexing;
- citations and provenance;
- model gateway consolidation;
- common agent Tool Gateway;
- shared agent retrieval path;
- authorization and negative tests.

### P1

- MCP compatibility gateway;
- advanced reranking;
- graph projection contracts;
- GraphRAG experiments;
- broader connector expansion;
- retrieval and agent evaluation dashboards.

### P2

- dedicated graph database if workload evidence requires it;
- standalone vector database if Postgres constraints are demonstrated;
- A2A interoperability;
- advanced distributed-agent scenarios;
- specialized search infrastructure.

## Non-goals for the initial milestone

The initial intelligent-platform milestone does not require:

- replacing Supabase/Postgres;
- a standalone vector database;
- a dedicated graph database;
- a wholesale external agent framework migration;
- moving policy or authorization into MCP;
- direct model access to credentials;
- granting agents unrestricted SQL access;
- fabricating enterprise knowledge, lineage, provenance, approval, or evidence merely to make RAG appear complete.

## Validation requirements

The architecture must be certified with more than positive-path demos.

Required evidence should include:

- tenant/project retrieval isolation;
- unauthorized evidence exclusion;
- rejected and expired document exclusion;
- stale-index behavior;
- index deletion/pruning;
- embedding failure recovery;
- vector/keyword fusion regression tests;
- citation correctness;
- no-evidence behavior;
- prompt-injection and tool-output-injection tests;
- tool authorization failure cases;
- duplicate-side-effect prevention;
- model fallback behavior;
- graph projection consistency if graph is enabled;
- load, latency, and cost evidence;
- exact-head CI;
- production verification.

## Consequences

### Positive

- turns existing governed data into reusable intelligence;
- gives all agents a common retrieval and tool boundary;
- preserves DataNexus governance authority;
- avoids premature vector/graph infrastructure sprawl;
- keeps MCP useful without allowing it to bypass security;
- supports future GraphRAG and external-agent interoperability;
- improves citations, explainability, and evidence reuse;
- creates explicit interfaces for future component benchmarking.

### Trade-offs

- adds retrieval/indexing lifecycle complexity;
- requires strong metadata and provenance discipline;
- requires continuous evaluation and index freshness controls;
- native-first implementation requires more initial engineering than adopting a monolithic external agent/RAG framework;
- graph infrastructure may eventually become necessary for advanced relationship-heavy workloads.

## Relationship to existing architecture

This ADR is additive.

ADR-008 remains authoritative for native-first agent runtime and continuous capability parity. Existing governance, authorization, evidence, audit, source onboarding, profiling, lineage, recovery, and security architecture remains in force.

This ADR defines the next layer above that foundation and should not be interpreted as permission to redesign completed core architecture without concrete runtime evidence.

## Summary

DataNexus should evolve from a strong governed data platform into a governed intelligence platform by adding a shared Knowledge Layer, Retrieval Gateway, hybrid RAG, Agent Control Plane, Model Gateway, and MCP compatibility boundary while retaining PostgreSQL and the existing governance core as the system of record and policy authority.

The first milestone should use Postgres, pgvector, full-text search, durable indexing jobs, native agents, and governed retrieval. GraphRAG and specialized databases should be introduced only when measured workloads prove they add material value.
