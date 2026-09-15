# Governed Knowledge and Intelligence Roadmap and Effort

**Date:** 2026-09-15  
**Status:** Recommended implementation direction  
**Scope:** DataNexus production architecture evolution after the current governance, profiling, lineage, source onboarding, security, and certification baseline

## Executive conclusion

DataNexus should not be rebuilt as a new AI platform. The current governance-first foundation remains authoritative. The next major program should add a governed knowledge and intelligence layer above the existing ingestion, profiling, lineage, governance, audit, and durable execution capabilities.

The largest current architectural gap is not source connectivity or governance plumbing. It is the absence of a unified, reusable retrieval and knowledge layer that can safely turn DataNexus metadata, profiling evidence, lineage, policy, glossary, findings, controls, and enterprise documents into grounded intelligence for users and agents.

The recommended next program is therefore:

**Governed Knowledge and Intelligence Layer**

Target chain:

`Sources -> Discovery -> Profiling / Lineage / Governance -> Knowledge Model -> Hybrid Retrieval -> RAG -> Agents -> Human or Automated Decisions -> Evidence / Audit`

## Design principles

1. Keep Supabase PostgreSQL as the canonical system of record.
2. Keep DataNexus identity, tenant isolation, RLS, authorization, mutation authority, human approval, audit, durable jobs, recovery, evidence integrity, model governance, and learning authority inside DataNexus.
3. Add intelligence as replaceable services and interfaces above those trust boundaries.
4. Do not place RAG logic inside source connectors.
5. Do not give agents direct unrestricted database access.
6. Prefer Postgres plus pgvector before introducing a separate vector database.
7. Treat graph storage as a derived projection, not the governance source of truth.
8. Treat MCP as an interoperability protocol, not as the core authority for credentials, ingestion, authorization, or mutation.
9. Use asynchronous durable jobs for embedding, indexing, graph projection, document processing, and enrichment.
10. Require measurable evaluation, citations, provenance, authorization, and failure behavior for all AI-assisted capabilities.

## Recommended capability additions

### 1. Governed retrieval and RAG

Add a shared Retrieval Gateway used by both the Web UI and agents. It should provide:

- project and organization scoped authorization before retrieval;
- PostgreSQL full-text search;
- pgvector semantic search;
- hybrid result fusion;
- optional reranking;
- citation and provenance assembly;
- context budgeting;
- classification and sensitivity filtering;
- freshness and approval-state filtering;
- deterministic failure behavior when evidence is absent or unauthorized.

RAG should consume governed retrieval results. It should not become an independent source of truth.

### 2. Knowledge layer

Create a unified logical knowledge model covering, as applicable:

- governance documents;
- document chunks;
- embeddings;
- business glossary terms;
- datasets and columns;
- profiling findings and quality scores;
- policies and controls;
- owners and stewards;
- lineage assets, transformations, and field mappings;
- governance evidence and audit references;
- extracted entities and relationships.

Each retrievable object should carry sufficient metadata for tenant isolation, provenance, authority, approval state, effective dates, classification, model/index version, and evidence traceability.

### 3. Agent control plane

Consolidate agent runtime capabilities into a shared control plane rather than allowing each specialist agent to implement its own retrieval, model routing, authorization, tools, and telemetry.

Shared capabilities should include:

- planner and bounded planning;
- specialist routing and handoff;
- common Retrieval Gateway;
- common Tool Gateway;
- model routing and fallback;
- guardrails and typed contracts;
- human-in-the-loop approval;
- checkpoint, retry, replay, recovery, and duplicate-side-effect protection;
- evaluation and trajectory evidence;
- observability and cost attribution.

### 4. Model Gateway

Expose model access through a governed Model Gateway that owns:

- provider and model selection;
- policy eligibility;
- fallback;
- token and cost ceilings;
- latency controls;
- structured-output contracts;
- prompt/version provenance;
- privacy rules;
- evaluation evidence;
- model usage telemetry.

### 5. MCP interoperability

After the native governed tool contracts are stable, expose selected DataNexus capabilities through an MCP compatibility layer.

Representative MCP tools or resources may include:

- search catalog;
- retrieve dataset metadata;
- retrieve policy or glossary evidence;
- inspect profiling quality;
- query lineage and impact;
- request governed profiling;
- propose a governance action.

Every MCP call must still traverse DataNexus authorization, policy, audit, and native service boundaries. MCP must never receive direct database credentials or become the canonical mutation authority.

### 6. Graph and GraphRAG

DataNexus is well suited to graph retrieval because governance and lineage are relationship-heavy. However, a dedicated graph database is not a prerequisite for the first intelligent platform milestone.

Start with canonical relationships in PostgreSQL. Introduce a graph projection only when multi-hop lineage, policy applicability, ownership, impact analysis, or relationship-heavy RAG demonstrates a measurable need.

If a graph engine is introduced, use this authority direction:

`Postgres canonical governance state -> governed projection/event process -> graph store`

not the reverse.

GraphRAG should combine authorized graph traversal with semantic and lexical retrieval through the same Retrieval Gateway.

### 7. Asynchronous indexing and enrichment

Use the existing durable job architecture for:

- document normalization;
- chunking;
- embedding generation;
- vector indexing;
- entity extraction;
- relationship extraction;
- graph projection;
- re-indexing after governed content changes;
- pruning when content is rejected, deleted, expired, or loses authority.

## Recommended initial technology posture

| Capability | Recommended initial implementation |
| --- | --- |
| System of record | Supabase PostgreSQL |
| Vector retrieval | pgvector |
| Keyword retrieval | PostgreSQL full-text search |
| Raw documents | Supabase Storage or equivalent governed object storage |
| Secrets | Supabase Vault and governed credential references |
| Async processing | Existing DataNexus durable job system |
| RAG | Native DataNexus retrieval and context assembly service |
| Graph | PostgreSQL first, optional graph projection later |
| Agents | Native DataNexus agent runtime |
| LLM access | DataNexus Model Gateway |
| External tool interoperability | MCP compatibility layer |
| Agent-to-agent interoperability | Optional later extension if justified |
| Observability | Canonical DataNexus evidence plus standards-compatible export |

A standalone vector database should be introduced only after measured scale, isolation, indexing, or latency requirements demonstrate that pgvector is insufficient.

## Effort estimate

The target architecture is an evolution of the existing platform, not a greenfield rebuild.

### Sequential engineering estimate

| Phase | Scope | Estimated engineering effort |
| --- | --- | ---: |
| 1 | Production-ready RAG foundation | 2 to 4 weeks |
| 2 | Agent control plane consolidation | 3 to 5 weeks |
| 3 | MCP interoperability | 1 to 2 weeks |
| 4 | Knowledge graph and GraphRAG | 2 to 4 weeks |
| 5 | Broader connector expansion | 2 to 5 weeks |
| 6 | Production hardening and certification | 2 to 4 weeks |

Total sequential effort is approximately **10 to 18 focused engineering weeks** for one strong engineer, depending on real-data availability and external integration constraints.

### Parallel elapsed-time estimate

With three to four independent streams, the work can be compressed substantially. A realistic target for the production-grade core intelligent platform is approximately **5 to 8 calendar weeks**, assuming no material external credential, authority, or real-data blockers.

The highest-value first milestone can be reached in approximately **4 to 6 calendar weeks** with parallel execution and should include:

- PostgreSQL plus pgvector;
- hybrid search;
- governed Retrieval Gateway;
- RAG with grounded citations;
- model gateway;
- shared agent control-plane primitives;
- MCP compatibility exposure;
- adversarial, negative, failure, load, and production validation.

GraphRAG, a dedicated graph database, a standalone vector database, and broad connector expansion should not block this milestone.

## Recommended execution sequence

### Weeks 1 to 2

- knowledge model;
- pgvector schema and indexes;
- document processing and chunking;
- Retrieval Gateway foundation;
- asynchronous indexing pipeline;
- authorization and provenance contracts.

### Weeks 2 to 3

- hybrid lexical plus semantic retrieval;
- citation assembly;
- permission-aware RAG;
- model gateway integration;
- retrieval and groundedness evaluation.

### Weeks 2 to 4

- shared agent control plane;
- common Tool Gateway;
- bounded planning;
- HITL reuse;
- agent evaluation and telemetry.

### Weeks 3 to 4

- MCP compatibility gateway over governed DataNexus tools and resources.

### Weeks 4 to 6

- production hardening;
- concurrency and scale tests;
- failure and recovery tests;
- security/adversarial tests;
- cost and latency controls;
- exact-head CI and production certification.

### Later, evidence-driven phases

- graph projection and GraphRAG;
- additional native connectors;
- generic JDBC hardening;
- optional A2A interoperability;
- specialized vector infrastructure only if required by measured workloads.

## Current-state interpretation

The platform is currently stronger as a governed data and operational governance platform than as a unified governed intelligence platform. This is an advantageous position because the difficult trust boundaries already exist.

The next program should therefore focus on intelligence reuse rather than more foundational infrastructure. The strategic priority is to make existing catalog, profiling, lineage, policy, governance, and evidence assets consistently retrievable, explainable, citable, agent-consumable, and permission-aware.

## Completion criteria for the first intelligent-platform milestone

The milestone should not be declared complete merely because embeddings or a chat interface exist. It should require:

1. authorized hybrid retrieval across governed knowledge;
2. reliable tenant and project isolation;
3. grounded citations and provenance;
4. no unauthorized evidence reaching model context;
5. asynchronous indexing and deletion/pruning behavior;
6. model routing through governed policy;
7. agents using shared retrieval and tool boundaries;
8. negative and adversarial retrieval tests;
9. duplicate, stale, revoked, rejected, and unauthorized evidence tests;
10. recovery behavior for failed indexing and model calls;
11. latency and cost evidence;
12. exact-head CI;
13. production validation;
14. documentation and architecture evidence updated.

## Relationship to existing decisions

This recommendation preserves the accepted native-first agent runtime and continuous capability-parity direction. It does not transfer DataNexus policy or governance authority to an external framework, MCP server, vector database, graph database, or model provider.

The proposed architecture should be implemented as an additive evolution of the current platform and should be revisited only when runtime evidence demonstrates that an alternative provides a material improvement without weakening governance, evidence integrity, security, or recoverability.
