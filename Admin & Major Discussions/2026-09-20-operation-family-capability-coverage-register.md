# DataNexus Operation Family and Capability Coverage Register

**Date:** 2026-09-20  
**Purpose:** Durable completeness guardrail for DataNexus architecture, implementation, storage, retrieval, execution, governance, observability, recovery, learning, and analytics design.  
**Scope rule:** This register does **not** silently expand the frozen September 19 delivery baseline. It preserves operation families that must be considered during architecture, implementation, gap assessment, production hardening, and future scope decisions.

## Why this register exists

DataNexus spans transactional governance, large-scale discovery and analytics, AI-assisted retrieval and reasoning, operational execution, monitoring, audit, retention, recovery, and learning. A component can appear complete while still omitting an important workload class. This register provides an explicit checklist so future design and implementation reviews do not lose those workload families.

Each operation family should eventually be classified against the current architecture as one of:

- **Implemented and certified**
- **Implemented, certification pending**
- **Partially implemented**
- **Planned / deferred**
- **External dependency / blocked**
- **Not applicable**

Where useful, reviews should also record authoritative system of record, read model/index, execution path, scale expectation, consistency requirement, retention class, authorization boundary, observability evidence, recovery behavior, and acceptance tests.

## Operation families

| Operation family | Representative examples |
| --- | --- |
| Transactional metadata | Create dataset, rename asset, assign owner, approve term |
| Bulk metadata discovery | Ingest millions of schemas, tables, columns |
| Profiling execution | Runs, columns, results, current findings |
| Historical profiling | Years of null rates, distributions, trends |
| DQ management | Rules, exceptions, approvals, current scores |
| DQ analytics | Enterprise trends, comparisons, anomaly history |
| Glossary | Definitions, domains, mappings, stewardship |
| Policy management | Versions, approvals, effective dates |
| Policy text retrieval | Find retention clauses mentioning customer PII |
| Regulatory research | Semantic plus exact article or term search |
| RAG | Retrieve policies, definitions, architecture, procedures |
| Metadata search | Search millions of fields and assets |
| Similarity | Semantically similar columns, terms, issues |
| Lineage | Upstream and downstream traversal |
| Impact analysis | Change field to reports, processes, policies |
| Root cause | Correlate incidents, lineage, profiles, operations |
| Cross-dataset relationships | Dependencies, ownership, CDEs |
| Agent investigation | Retrieve facts, relationships, and evidence |
| Human approval | Approve or reject agent recommendations |
| Remediation | Action state, idempotency, authorization |
| Verification | Compare before and after state |
| Rollback | Durable action and rollback records |
| Incident management | Issue lifecycle, ownership, SLA |
| Operational monitoring | Millions or billions of events, logs, spans |
| Agent monitoring | Latency, tools, errors, token and cost metrics |
| Agent memory | Validated interaction and outcome records |
| Agent learning | Feedback, success or failure, reward and evaluation |
| Executive analytics | Enterprise risk, health, benefit trends |
| Audit | Authoritative decisions and changes |
| Audit analytics | All autonomous actions over three years by domain |
| Export and reporting | Huge result sets, historical reports |
| Retention | Delete or archive according to policy |
| Reindex and rebuild | Rebuild search or graph |
| Disaster recovery | Restore core business truth |
| ML and AI evaluation | Acceptance rate, precision, drift, outcomes |
| Re-embedding | Change embedding model without rewriting governance |
| Natural-language support | Explain why a dataset is red |

## Architecture review dimensions

Future capability reviews should assess each applicable operation family across these dimensions:

1. **Authoritative truth**  
   Identify the canonical system of record. Search indexes, graphs, vector stores, caches, warehouses, and AI memory must not silently become governance truth.

2. **Transactional guarantees**  
   State whether the workload requires atomicity, idempotency, fencing, optimistic concurrency, durable workflow state, or eventual consistency.

3. **Scale and access pattern**  
   Distinguish small transactional reads from bulk ingest, graph traversal, historical analytics, high-volume observability, and large export workloads.

4. **Retrieval model**  
   Record whether exact SQL lookup, full-text search, vector similarity, graph traversal, OLAP, time-series access, RAG, or composed retrieval is appropriate.

5. **Authorization and governance**  
   Preserve tenant, organization, project, resource ACL, policy, approval, legal hold, retention, and sensitive-data boundaries across derived stores and agent retrieval.

6. **Evidence and audit**  
   Record source facts, decisions, actions, model/tool use, approvals, outcomes, and before/after verification with durable provenance.

7. **Recovery and rebuild**  
   Separate recoverable derived state from irreplaceable business truth. Search, graph, embeddings, projections, and analytics should be rebuildable where feasible.

8. **Lifecycle and retention**  
   Define archival, deletion, legal hold, historical retention, reprocessing, reindexing, re-embedding, and version replacement semantics.

9. **AI and agent behavior**  
   Ensure investigation, memory, learning, RAG, tool execution, evaluation, and natural-language explanation remain bounded by deterministic authority and evidence.

10. **Production acceptance**  
    Require representative positive, negative, scale, failure, recovery, authorization, and data-quality tests rather than assuming one storage or execution path covers all workload classes.

## Important separations

The following distinctions should remain explicit:

- current operational state versus historical analytics;
- source-authoritative truth versus derived index or projection;
- governance records versus embeddings;
- transactional metadata versus bulk discovery;
- profiling execution versus historical profiling analytics;
- DQ control state versus DQ analytical trends;
- monitoring telemetry versus audit evidence;
- agent memory versus authoritative business truth;
- agent learning proposals versus production authority;
- semantic retrieval versus exact regulatory or policy citation;
- lineage truth versus inferred relationships;
- remediation execution versus verification;
- rollback evidence versus disaster recovery;
- operational search versus enterprise-scale export and analytics.

## Relationship to current Runtime v2 work

This register intersects with, but is broader than, the current Runtime v2 program. Runtime v2 directly covers areas such as agent investigation, approval, remediation, verification, rollback, agent monitoring, agent memory and learning governance, audit, cost and token evidence, tool execution, orchestration, recovery, and natural-language support.

Other families such as bulk metadata discovery, historical profiling, large-scale metadata search, enterprise DQ analytics, lineage traversal, audit analytics, reindexing, re-embedding, and disaster recovery may belong to adjacent platform workstreams or future production-scale hardening.

A future implementation review should map every row in this register to the current repository and classify it without assuming that presence of a related component means production completeness.

## Continuity rule

Do not delete an operation family because it is not in the current delivery phase. Mark its status explicitly and preserve the requirement until it is either implemented, deferred by product decision, superseded, or declared not applicable.

