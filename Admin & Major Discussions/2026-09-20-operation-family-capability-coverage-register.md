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



## Reconciled status against protected main

**Repository checkpoint:** `11ff0b13eb5897d2d6d29fcc1a8a7ae7e24b498a`  
**Checkpoint change:** PR #816, governed learning candidate pipeline.

Status meanings used below:

- **IMPLEMENTED**: core capability is present on protected main with substantive code/tests or production evidence.
- **IMPLEMENTED / CERTIFICATION PENDING**: core capability exists, but target-scale, exact-head, end-to-end, or production certification remains incomplete.
- **PARTIAL / ADVANCED**: substantial foundations exist, but one or more material parts of the requested operation family remain incomplete.
- **ACTIVE IMPLEMENTATION**: a current implementation sequence is progressing on top of protected main.
- **BLOCKED EXTERNAL**: implementation cannot honestly complete without an external source/permission boundary.

| # | Operation family | Reconciled status | Current repository assessment |
| ---: | --- | --- | --- |
| 1 | Transactional metadata | **IMPLEMENTED** | Dataset/version, catalog lifecycle, ownership/stewardship, glossary and governed metadata mutation paths exist. |
| 2 | Bulk metadata discovery | **PARTIAL / ADVANCED** | Discovery/onboarding and projection foundations exist, but multi-million object discovery scale is not yet certified as a platform-wide workload. |
| 3 | Profiling execution | **IMPLEMENTED / CERTIFICATION PENDING** | Deterministic metric execution, persistence, concurrency, CSV/JDBC runtime and prior exact-main certification exist. Current protected main has advanced since the last profiling exact-head certification. |
| 4 | Historical profiling | **PARTIAL / ADVANCED** | Profile history is persisted and analytical foundations exist, but multi-year distributions/trend analytics at target scale are not fully certified. |
| 5 | DQ management | **IMPLEMENTED** | Rules, governed quality execution, findings/scores, approvals/remediation and exact verification evidence are implemented. |
| 6 | DQ analytics | **PARTIAL / ADVANCED** | Trend and persona-oriented DQ analytical surfaces exist; enterprise-scale comparative/anomaly-history analytics remain broader than current certification. |
| 7 | Glossary | **IMPLEMENTED** | Business terms, governed mutations, persona/project context, security hardening and stewardship workflows exist. |
| 8 | Policy management | **IMPLEMENTED** | Governance documents, policy/control context, versions/authority concepts and governed approval boundaries are represented in the current platform. |
| 9 | Policy text retrieval | **PARTIAL / ADVANCED** | Semantic embeddings, retrieval/evaluation and governance knowledge retrieval foundations exist; exact policy-clause retrieval at enterprise corpus scale needs broader acceptance evidence. |
| 10 | Regulatory research | **PARTIAL / ADVANCED** | Regulations are part of the knowledge architecture and semantic/exact retrieval model, but there is no evidence of a separately certified end-to-end regulatory research workload. |
| 11 | RAG | **IMPLEMENTED / CERTIFICATION PENDING** | Retrieval provider, semantic embeddings, retrieval evaluation, authority-aware knowledge architecture and evidence-grounded generation foundations exist; breadth/scale certification remains. |
| 12 | Metadata search | **PARTIAL / ADVANCED** | Search and semantic indexing capabilities exist, but searching millions of fields/assets is not yet certified at target scale. |
| 13 | Similarity | **PARTIAL / ADVANCED** | Embedding/semantic indexing foundations support similarity use cases; broad column/term/issue similarity workflows are not fully production-certified. |
| 14 | Lineage | **BLOCKED EXTERNAL** | AI-assisted/inferred lineage exists under explicit authority classes, but source-authoritative Module #3 lineage remains blocked by missing Databricks `system.access` permission. |
| 15 | Impact analysis | **PARTIAL / ADVANCED** | Relationship/lineage architecture supports impact reasoning, but full source-authoritative field-to-report/process/policy impact is constrained by incomplete authoritative lineage. |
| 16 | Root cause | **IMPLEMENTED / CERTIFICATION PENDING** | Investigator RCA, evidence discrimination, bounded refinement, incident RCA provenance and cross-signal investigation are implemented; full enterprise E2E certification remains. |
| 17 | Cross-dataset relationships | **PARTIAL / ADVANCED** | Cross-dataset correlations, ownership/CDE/domain relationships and governed relationship models exist; complete enterprise dependency coverage is not certified. |
| 18 | Agent investigation | **IMPLEMENTED** | Dataset-scoped investigation, evidence retrieval, RCA, governed tools/handoffs and execution evidence exist. |
| 19 | Human approval | **IMPLEMENTED** | Business/Governance approval axes, delegation, validity, external decision entry, SLA and execution revalidation are implemented. |
| 20 | Remediation | **IMPLEMENTED** | Governed remediation state, authorization, handoff, evidence and idempotent/recovery patterns exist. |
| 21 | Verification | **IMPLEMENTED** | Before/after and exact governed evidence verification paths exist, including DQ verification timelines and runtime validation. |
| 22 | Rollback | **IMPLEMENTED / CERTIFICATION PENDING** | Native rollback/compensation and storage rollback contracts exist; complete platform rollback/recovery exercise remains a final certification gate. |
| 23 | Incident management | **IMPLEMENTED** | Canonical incident lifecycle, persona workspace, SLA, evidence, RCA and adversarial lifecycle hardening are present. |
| 24 | Operational monitoring | **PARTIAL / ADVANCED** | Alerts, incidents, OTLP/auth, queue/readiness and monitoring surfaces exist; millions/billions-of-events scale is not yet certified. |
| 25 | Agent monitoring | **IMPLEMENTED / CERTIFICATION PENDING** | Job Monitor, runtime evidence drilldown, run actions, logs/evaluation, provider telemetry and cost/token foundations exist; Runtime v2 observability convergence remains a certification item. |
| 26 | Agent memory | **PARTIAL / ADVANCED** | Agent memory tables/providers, semantic memory indexing and learning layers exist; broad verified-memory consumption and lifecycle certification are still evolving. |
| 27 | Agent learning | **ACTIVE IMPLEMENTATION** | PR #816 candidate-learning pipeline is merged. Current follow-on PRs #819, #820 and #821 cover benchmark gating, governed approval and controlled release. |
| 28 | Executive analytics | **PARTIAL / ADVANCED** | Governance outcome reporting, command-center and persona analytical foundations exist; complete enterprise risk/health/benefit trend certification remains. |
| 29 | Audit | **IMPLEMENTED** | Immutable/hash-chained governance audit, approval/execution audit, discovery/profiling evidence and audit UI/workflows are present. |
| 30 | Audit analytics | **PARTIAL / ADVANCED** | Audit evidence and command-center analytics exist, but multi-year autonomous-action analytics at stated scale are not yet certified. |
| 31 | Export/reporting | **IMPLEMENTED / CERTIFICATION PENDING** | Governance outcome reports and hardened export paths exist; huge-result-set and long-history reporting scale remains to be proven. |
| 32 | Retention | **IMPLEMENTED / CERTIFICATION PENDING** | Governance retention/archive, projection-safe retention, agent evidence retention and legal hold are implemented; complete cross-domain retention certification remains. |
| 33 | Reindex/rebuild | **PARTIAL / ADVANCED** | Semantic reindex and projection snapshot rebuild mechanisms exist; full search/graph/analytics rebuild runbooks and certification remain incomplete. |
| 34 | Disaster recovery | **PARTIAL / ADVANCED** | Runtime recovery, compensation and RTO/RPO policy foundations exist; restoration of complete core business truth has not yet been fully exercised/certified as platform DR. |
| 35 | ML/AI evaluation | **IMPLEMENTED** | Evaluation datasets/engine, retrieval evaluation, shadow evaluation, trajectory evaluation, scorecards and governed learning evidence are implemented. |
| 36 | Re-embedding | **PARTIAL / ADVANCED** | Embedding provider abstraction and embedding-space identity are present, which protect governance truth from model identity, but a complete re-embedding migration/rebuild workflow is not yet certified. |
| 37 | Natural-language support | **IMPLEMENTED** | Governed agents, reasoning/retrieval providers, investigation and evidence-grounded explanation paths support natural-language governance questions; wider persona/E2E certification continues under Runtime v2. |

### Current coverage interpretation

This register should not be read as 37 green production certifications.

At this checkpoint:

- **12** operation families have their core capability implemented.
- **7** have the core implementation present but still require broader certification, scale testing, or exact-head revalidation.
- **16** are materially advanced but remain partial against the full operation-family definition.
- **1** is in active implementation: agent learning.
- **1** is externally blocked: source-authoritative lineage.

The dominant remaining gaps are enterprise-scale certification, historical/OLAP depth, complete derived-store rebuild/re-embedding operations, platform-level disaster-recovery exercise, and capabilities that depend on source-authoritative lineage.


## Canonical completion plan

The percentage-based implementation, certification, revalidation and independent assurance plan is recorded in:

`Admin & Major Discussions/2026-09-20-operation-family-completion-and-certification-plan.md`

That plan is the authoritative execution guide for moving this coverage register toward 100% production-certified completion.
