# DataNexus 37-Area Implementation Completion Plan

**Date:** 2026-09-20  
**Repository:** `shoaib143-sudo/data-quality-ai-platform`  
**Protected-main baseline:** `15dbd65c9f32facf738979382a6d9afb8a8ab4c2`  
**Baseline change:** PR #819, governed learning benchmark gate  
**Objective:** Complete the implementation scope for the 37 preserved DataNexus operation families without weakening existing governance, truth, security or recovery boundaries.

**Current scope decision:** Certification, production hardening and operationalization are deferred and are explicitly out of scope until reopened by the product owner. The deferred material is preserved later in this document only as future reference.

## 1. Active implementation completion model

Percentages below now represent progress toward **implementation completeness**, not production certification or operational hardening.

Active implementation scope includes:

| Dimension | Weight |
| --- | ---: |
| Functional capability implementation | 55% |
| Integration, governance and authorization | 25% |
| Essential developer assurance: unit, integration, negative and failure-path tests required to prove the implementation works correctly | 20% |

Explicitly excluded from the active percentage are production certification, exact-head release certification, canary, production revalidation, large-scale load/chaos campaigns, DR exercises, operational SLO/error-budget hardening, release-provenance hardening and other operationalization work.

Those activities remain preserved as a future deferred phase and must not block implementation completion.

## 2. Active versus deferred scope

### Active now

- missing functional implementation;
- APIs, database/schema and workflow implementation;
- governed authorization/RLS/ACL behavior required for correctness;
- lifecycle/state-machine behavior;
- source onboarding, retrieval, analytics, lineage, agent, memory and learning functionality;
- essential unit, integration, negative and targeted failure-path tests needed to establish implementation correctness;
- migrations/backfills required by the implementation itself;
- deterministic rollback/compensation code where it is part of the functional contract.

### Deferred until operationalization is reopened

- final exact-head certification;
- production canary and production revalidation;
- production hardening;
- large-scale performance/load certification;
- chaos campaigns;
- platform DR exercises and measured RTO/RPO certification;
- SLO/error-budget operational gates;
- independent adversarial certification audit;
- release/SBOM/provenance hardening beyond what existing CI already requires;
- operational runbook and on-call hardening;
- environment/configuration-drift certification.

## 3. Reconciled implementation-completion matrix

| # | Operation family | Implementation completion | Remaining implementation work |
| ---: | --- | ---: | --- |
| 1 | Transactional metadata | **97%** | Close remaining lifecycle/concurrency correctness gaps only. |
| 2 | Bulk metadata discovery | **78%** | Complete scalable discovery workflow, checkpointing/backpressure logic and resumable ingestion behavior. |
| 3 | Profiling execution | **97%** | Close any remaining current-main CSV/JDBC execution and persistence gaps. |
| 4 | Historical profiling | **72%** | Complete historical profile model, storage/query path and trend aggregation implementation. |
| 5 | DQ management | **97%** | Close remaining rule/exception/approval/score functional gaps. |
| 6 | DQ analytics | **76%** | Complete enterprise trend/comparison/anomaly-history implementation. |
| 7 | Glossary | **96%** | Close remaining version/mutation/read workflow gaps. |
| 8 | Policy management | **92%** | Complete version/effective-date and policy-change workflow implementation. |
| 9 | Policy text retrieval | **83%** | Complete exact + semantic hybrid retrieval and temporal/effective-date behavior. |
| 10 | Regulatory research | **70%** | Implement dedicated regulatory corpus ingestion, exact article/term retrieval and provenance model. |
| 11 | RAG | **91%** | Close remaining hybrid retrieval, authority weighting and evidence/citation behavior. |
| 12 | Metadata search | **79%** | Complete large-catalog search, filtering/faceting and index freshness/rebuild behavior. |
| 13 | Similarity | **77%** | Productize column/term/issue similarity workflows and authorization filtering. |
| 14 | Lineage | **74%** | Obtain Databricks `system.access`, then implement source-authoritative lineage ingestion and traversal. |
| 15 | Impact analysis | **73%** | Complete deterministic impact traversal over authoritative relationships. |
| 16 | Root cause | **91%** | Close remaining evidence-correlation and bounded RCA workflow gaps. |
| 17 | Cross-dataset relationships | **79%** | Complete relationship ingestion/provenance and relationship projection. |
| 18 | Agent investigation | **94%** | Close remaining evidence/tool/handoff functional gaps. |
| 19 | Human approval | **98%** | Close edge-case lifecycle/concurrency correctness only. |
| 20 | Remediation | **95%** | Complete tool-specific compensation/replay behavior where functionally required. |
| 21 | Verification | **96%** | Close remaining cross-domain before/after verification behavior. |
| 22 | Rollback | **91%** | Complete rollback/compensation implementations and baseline restoration logic. |
| 23 | Incident management | **96%** | Close remaining lifecycle/escalation functional gaps. |
| 24 | Operational monitoring | **80%** | Complete telemetry ingestion/projection, retention logic and monitoring surfaces. |
| 25 | Agent monitoring | **91%** | Complete runtime telemetry coverage for tool/provider/token/cost/retry/error states. |
| 26 | Agent memory | **82%** | Complete verified-memory promotion/consumption, lifecycle and poisoning/staleness controls. |
| 27 | Agent learning | **82%** | Complete #820 approval binding and #821 controlled release/rollback workflow. |
| 28 | Executive analytics | **76%** | Complete enterprise KPI/risk/benefit semantic model and historical drilldown. |
| 29 | Audit | **98%** | Close remaining audit query/restore functional gaps only. |
| 30 | Audit analytics | **73%** | Implement multi-year analytical query path and domain/action segmentation. |
| 31 | Export/reporting | **87%** | Complete async/streaming export, resumability and access-safe bulk output. |
| 32 | Retention | **90%** | Complete cross-domain retention/archive/legal-hold execution behavior. |
| 33 | Reindex/rebuild | **78%** | Complete unified rebuild orchestration for search/vector/graph/projections. |
| 34 | Disaster recovery | **70%** | Keep only required restore/recovery implementation in scope; defer full DR exercise/certification. |
| 35 | ML/AI evaluation | **96%** | Close remaining evaluation/drift/promotion functional integration. |
| 36 | Re-embedding | **73%** | Implement versioned dual-index re-embedding, cutover and rollback. |
| 37 | Natural-language support | **93%** | Close remaining grounding/citation/ambiguity behavior across personas. |

**Simple implementation-only portfolio estimate:** approximately **86%**. This replaces the earlier 76% production-certified estimate for the current phase.

## 4. Improvement priority

### P0: blockers and shared foundations

1. Source-authoritative lineage permission and ingestion.
2. Historical/analytical storage path for profiling, DQ, audit and executive analytics.
3. Enterprise-scale search/retrieval/index lifecycle.
4. Unified rebuild/reindex/re-embedding orchestration.
5. Unified rebuild/recovery implementation required by current functional contracts.
6. Final Runtime v2 agent learning controlled release chain.

### P1: scale and analytical depth

- bulk discovery;
- historical profiling;
- DQ analytics;
- metadata search;
- similarity;
- cross-dataset relationships;
- operational monitoring;
- executive analytics;
- audit analytics;
- large export/reporting.

### P2: mature implementation closure

Areas already above approximately 80% should not receive broad redesign. Close only remaining functional, integration, authorization and essential correctness-test gaps. Certification and production hardening remain deferred.

## 5. Workstream priority and engineering effort

The ETAs below are **engineering effort estimates**, not production deadlines. They assume the existing architecture is retained, independent work is executed in parallel, and no new material requirements are introduced.

| Workstream | Priority | Primary scope | Current implementation estimate | Engineering effort estimate | Dependency / critical-path note |
| --- | --- | --- | ---: | --- | --- |
| A. Scale, history and analytical plane | **P0** | #2, #4, #6, #24, #28, #30, #31 | ~75% | **5–7 engineering days** | One of the main critical-path streams because it closes several lower-completion analytical areas. |
| B. Knowledge, retrieval, search and embedding lifecycle | **P0** | #9, #10, #11, #12, #13, #36, retrieval part of #37 | ~81% | **4–6 engineering days** | Shared search/retrieval contracts affect multiple capabilities; can run in parallel with A. |
| C. Relationship intelligence, lineage and impact | **P0, externally constrained** | #14, #15, #17, relationship inputs to #16 | ~77% | **4–6 engineering days after source permission is available** | Databricks `system.access` is the only material external blocker. Independent adapter/contract work can proceed before permission. |
| D. Governed agent intelligence, memory and learning | **P0** | #16, #18, #25, #26, #27, #35, #37 | ~90% | **3–5 engineering days** | Active implementation already exists through #816/#819; #820/#821 and memory/monitoring closure are the main remaining items. |
| E. Operational lifecycle, retention, rebuild and recovery implementation | **P1** | #22, #32, #33, #34 plus shared recovery/rebuild logic | ~82% | **3–5 engineering days** | Implement functional rebuild/recovery only. Production DR exercises and hardening remain deferred. |
| F. Mature transactional/governance closure | **P0 quick-win** | #1, #3, #5, #7, #8, #19, #20, #21, #23, #29 | ~96% | **2–3 engineering days** | Highest-return closure stream. Avoid redesign; fix only proven functional/test gaps. |
| G. Integration and implementation reconciliation | **P0 continuous** | Cross-workstream integration for all 37 areas | continuous | **Runs throughout; 2–3 engineering days of final convergence** | Must start immediately, not after A–F. Prevents contract drift and duplicate implementations. |

### Parallel elapsed-time view

With six implementation streams progressing concurrently:

- **Wave 1, immediate:** D + F + shared contracts for A/B/E + G.
- **Wave 2:** deeper A/B/E implementation, C wherever not blocked by Databricks permission.
- **Wave 3:** C source-authoritative lineage after permission, plus final G reconciliation.

Ignoring the external lineage permission, the present implementation backlog is roughly a **5–7 engineering-day critical path** under effective parallel execution. If Databricks permission arrives later, Workstream C becomes the residual blocker to literal 100% implementation.

## 6. Optimum implementation plan to 100% implementation

Use **six parallel implementation workstreams** with a seventh integration/reconciliation lane. Parallel branches must not redefine the same schema contract independently. Production certification and hardening are excluded.

### Workstream A: Scale, history and analytical plane

**Priority:** P0  
**Engineering effort estimate:** 5–7 days  
**Covers:** #2, #4, #6, #24, #28, #30, #31.

Implementation:

1. Define canonical operational truth versus historical analytical projections.
2. Reuse the existing polyglot/provider boundary rather than moving governance authority out of Supabase/Postgres.
3. Introduce or complete projection/outbox pipelines for high-volume history.
4. Partition/time-bucket historical facts where appropriate.
5. Add incremental aggregations for profiling/DQ/audit/executive trends.
6. Add asynchronous export jobs with resumable pagination/checkpoints.
7. Add telemetry cardinality and retention controls.
8. Add projection reconciliation and rebuild verification.

Implementation completion gates:

- end-to-end analytical projection flow works from authoritative truth;
- checkpoint/resume and backpressure behavior is implemented correctly;
- no lost/duplicated analytical events in targeted integration tests;
- historical queries and incremental aggregation return reproducible results;
- rebuild logic recreates equivalent derived state on controlled fixtures;
- source authority remains unchanged.

### Workstream B: Knowledge, retrieval, search and embedding lifecycle

**Priority:** P0  
**Engineering effort estimate:** 4–6 days  
**Covers:** #9, #10, #11, #12, #13, #36, plus NL retrieval aspects of #37.

Implementation:

1. Standardize hybrid retrieval: lexical + semantic + metadata filters + authority + temporal filtering.
2. Build curated policy/regulatory evaluation corpora with authoritative source/version metadata.
3. Implement exact article/clause retrieval alongside semantic retrieval.
4. Add similarity APIs/surfaces for columns, terms and issues.
5. Add embedding-space/version registry if not already fully bound at every index.
6. Implement dual-index re-embedding:
   - create new embedding space;
   - backfill/shadow;
   - compare retrieval quality;
   - switch reads only after acceptance;
   - retain rollback to previous space.
7. Add unified semantic reindex/rebuild orchestration.

Implementation completion gates:

- hybrid exact/semantic retrieval paths are implemented;
- citation/evidence linkage is correct on controlled evaluation fixtures;
- authorization filtering applies before results are exposed;
- temporal/effective-version semantics work correctly;
- prompt/document injection inputs fail safely at implementation boundaries;
- re-embedding cutover and rollback logic is implemented and testable;
- index rebuild produces coherent searchable state.

### Workstream C: Relationship intelligence, lineage and impact

**Priority:** P0, externally constrained  
**Engineering effort estimate:** 4–6 days after source permission is available  
**Covers:** #14, #15, #17 and relationship inputs to #16.

Implementation:

1. Resolve external Databricks `system.access` permission.
2. Ingest source-authoritative lineage without promoting inferred edges to observed truth.
3. Maintain authority classes for observed, human-confirmed inferred and AI-suggested relationships.
4. Build upstream/downstream traversal service with bounded depth and cycle handling.
5. Add cross-dataset relationship projection for CDEs, ownership, domains, policies and controls.
6. Add deterministic impact traversal:
   field → datasets → jobs/processes → reports → controls/policies.
7. Feed authoritative relationship evidence into RCA, never the reverse.
8. Implement graph/projection rebuild and reconciliation.

Implementation completion gates:

- known lineage fixture traversal correctness;
- cycle, missing-edge and stale-edge handling;
- authority-class preservation;
- no inferred-to-observed escalation;
- impact traversal returns evidence-backed relationships;
- graph/projection rebuild equivalence on controlled fixtures.

### Workstream D: Governed agent intelligence, memory and learning

**Priority:** P0  
**Engineering effort estimate:** 3–5 days  
**Covers:** #16, #18, #25, #26, #27, #35, #37.

Implementation:

1. Complete #820 governed learning approval binding.
2. Restack and complete #821 controlled release and rollback.
3. Finish agent-memory promotion and consumption policy:
   verified outcome → candidate memory → evaluation → promoted memory.
4. Add memory poisoning and stale-memory rejection.
5. Bind memory/learning retention and legal-hold semantics.
6. Complete agent monitoring for:
   latency, tool calls, provider/model, retries, errors, token/cost, approval waits, recovery and learning state.
7. Add standardized natural-language acceptance packs by persona and operation family.
8. Integrate evaluation/drift triggers with provider/model/agent-version promotion policy.

Implementation completion gates:

- candidate cannot self-promote;
- benchmark evaluator independence;
- approval fingerprint binding;
- controlled-release implementation cannot bypass active-version authority;
- rollback code restores the exact approved baseline in controlled tests;
- memory cannot override authoritative truth;
- poisoned/stale evidence is rejected;
- deterministic authority remains intact under model/tool failure;
- trajectory and outcome evaluation is reproducible.

### Workstream E: Operational lifecycle, retention, rebuild and recovery

**Priority:** P1  
**Engineering effort estimate:** 3–5 days  
**Covers:** #22, #32, #33, #34 and recovery aspects across all families.

Implementation:

1. Inventory authoritative truth, rebuildable projections and external dependencies.
2. Define restore order and dependency graph.
3. Standardize checkpoint/retry/idempotency for rebuild jobs.
4. Complete legal-hold precedence over retention/deletion.
5. Implement archive verification and restore-from-archive.
6. Unify rebuild orchestration for:
   projections, search indexes, vector indexes, relationship graph and materialized analytics.
7. Implement backup/restore integration points required by current recovery functionality.
8. Implement rollback and forward-recovery paths required by functional contracts.

Implementation completion gates:

- partial restore/rebuild failures are represented safely;
- duplicate replay is prevented;
- legal hold cannot be bypassed;
- rebuild/recovery actions are checkpointed and resumable where required;
- authoritative truth and rebuildable derived state remain explicitly separated.

Full DR exercises, backup certification and measured RTO/RPO remain deferred.

### Workstream F: Transactional governance and already-mature capability closure

**Priority:** P0 quick-win  
**Engineering effort estimate:** 2–3 days  
**Covers:** #1, #3, #5, #7, #8, #19, #20, #21, #23, #29 plus targeted closure for mature areas.

Implementation strategy:

Do not redesign. Freeze contracts and close only evidence-backed gaps:

1. targeted concurrency/race correctness tests;
2. permission and RLS matrices required for functional correctness;
3. stale-version/fingerprint checks;
4. malformed/duplicate input tests;
5. transaction rollback tests;
6. controlled E2E flows for affected personas;
7. audit/evidence reconciliation required by the functional contract.

This workstream should move rapidly because core implementation already exists.

### Workstream G: Integration and implementation reconciliation

**Priority:** P0 continuous  
**Engineering effort estimate:** continuous during A–F, then 2–3 days final convergence  

This lane starts immediately with evidence mapping and becomes the final integration/reconciliation authority for the implementation phase.

Responsibilities:

1. Maintain requirement → code → test → runtime-evidence matrix for all 37 areas.
2. Prevent duplicate/conflicting implementations across A-F.
3. Define fixed golden datasets/corpora for implementation-level integration.
4. Run affected integration/regression suites after convergence merges.
5. Own implementation-level integration, regression and targeted negative/failure validation.
6. Refuse a 100% implementation status while a required functional contract remains incomplete.

## 7. Implementation sequence and gates

### Gate 0: Baseline

- Freeze the active implementation baseline.
- Inventory current PRs and schema ownership.
- Map all 37 areas to code/tests.
- Record external blockers.
- Preserve existing architecture and authority boundaries.

### Gate 1: Shared implementation foundations

Complete:

- analytical projection contracts;
- retrieval/index version contracts;
- relationship authority contracts;
- rebuild contracts;
- agent learning release contracts.

### Gate 2: Parallel implementation

Run Workstreams A-F in parallel.

Each feature is merged with the minimum evidence required to establish implementation correctness:

- implementation;
- direct unit/contract tests;
- integration tests for changed boundaries;
- negative cases for authorization/state validity;
- targeted failure-path tests where partial state or duplicate effects are possible;
- migration validation when applicable;
- documentation/evidence update.

### Gate 3: Integrated implementation

Run the functional integration paths needed to prove the implementation coheres:

- CSV path;
- database/JDBC path;
- policy/RAG path;
- lineage/impact path where source permission is available;
- agent investigation/remediation path;
- learning controlled-release path;
- historical analytics path;
- rebuild path.

### Gate 4: Implementation complete

An area reaches 100% for the current phase when:

- the defined functional capability exists;
- required APIs/schema/workflows are implemented;
- governance and authorization required for correctness are implemented;
- essential unit/integration/negative/targeted failure tests pass;
- no known P0/P1 implementation defect remains;
- known operationalization-only items are clearly deferred rather than mixed into implementation status.

### Deferred Gate 5: Certification and hardening

**OFF LIMITS FOR THE CURRENT PHASE.**

When operationalization is explicitly reopened, use the preserved post-implementation assurance material below as the starting point. Do not execute it now and do not use it to block implementation completion.

## 8. Deferred future certification and hardening plan

**Status: DEFERRED / OFF LIMITS until operationalization is explicitly reopened.**

This material is preserved so it is not lost, but it is not part of the current implementation objective, current percentage, current definition of done or current execution queue.

### 6.1 Clean-room revalidation

Use:

Fresh checkout → clean dependencies → fresh disposable database → apply all migrations → seed controlled fixtures → static checks → unit tests → integration tests → negative tests → failure injection → E2E → load → security → production build.

Validate that no test depends on uncommitted local state or historical database residue.

### 6.2 Unit testing

Target critical deterministic logic directly.

Required focus:

- lifecycle/state transitions;
- authorization/policy evaluation;
- score/rule calculations;
- retrieval ranking/fusion helpers;
- lineage/relationship authority;
- idempotency keys;
- retry classifiers;
- retention decisions;
- version/cutover decisions;
- learning promotion gates;
- rollback selection;
- rebuild reconciliation.

For critical deterministic code, target complete meaningful branch coverage where practical. Coverage percentage must not replace behavioral assertions.

### 6.3 Integration testing

Exercise real boundaries, including real database constraints/RLS.

Mandatory integration chains:

1. Dataset → Version → Discovery → Profile → Metrics → Findings → Score.
2. Finding → Issue → Remediation → Verification → Close.
3. Policy/regulation → retrieval → evidence/citation → agent reasoning.
4. Lineage → impact → RCA.
5. Agent → tool → approval → execution → verification → audit.
6. Outcome → learning candidate → benchmark → approval → shadow canary → promotion/rollback.
7. Truth store → projection/index → search/analytics → rebuild/reconciliation.
8. Backup → restore → projection rebuild → application revalidation.

### 6.4 Negative testing

Every operation family must include unauthorized, malformed, stale, duplicate and invalid-state tests where applicable.

Required examples:

- unauthorized project/resource access;
- DENY precedence;
- invalid or expired approval;
- same-person dual-axis approval;
- revoked delegation;
- stale execution fingerprint;
- duplicate commands;
- malformed JSON/schema;
- unknown fields and conflicting aliases;
- stale dataset/version;
- missing lineage authority;
- AI-inferred evidence presented as authoritative;
- missing citation/source;
- poisoned memory;
- synthetic benchmark evidence where real evidence is required;
- candidate learning attempting self-promotion;
- unauthorized reindex/rebuild;
- legal-hold deletion attempt;
- restore from unverified backup;
- re-embedding cutover with failed retrieval evaluation.

### 6.5 Failure injection

Inject failures at:

- database connect/transaction/commit;
- queue claim/lease renewal;
- object storage read/write;
- source/JDBC connectivity;
- metric execution/persistence;
- retrieval/embedding/reranking providers;
- graph/lineage ingestion;
- external model/provider;
- notification provider;
- approval finalization;
- remediation tool;
- verification;
- export stream;
- projection worker;
- index/rebuild job;
- backup/restore;
- canary/promotion/rollback.

Every injected failure must prove:

- no corrupt partial truth;
- no duplicate side effect;
- observable failure state;
- bounded retry;
- preserved authorization;
- recoverability or safe terminal failure;
- durable evidence.

### 6.6 Concurrency and race testing

Test:

- duplicate profile starts;
- simultaneous metadata edits;
- concurrent approval decisions;
- approval expiry during execution;
- concurrent agent-version promotion;
- double tool execution;
- competing recovery workers;
- rebuild while writes continue;
- retention versus legal hold;
- re-embedding cutover while queries run;
- lineage refresh versus impact query;
- concurrent export retries.

Use deterministic barriers/advisory locks/test hooks rather than timing-only tests where possible.

### 6.7 Performance and load certification

Establish workload profiles for:

- metadata object counts;
- profile rows/columns;
- historical years;
- DQ rules/findings;
- policies/documents/chunks;
- search/vector corpus;
- lineage edges;
- audit events;
- telemetry events;
- concurrent agents/runs;
- export row counts.

Capture p50/p95/p99 latency, throughput, memory, CPU, queue lag, DB load, cost and error rate.

No capability is 100% complete if its stated enterprise-scale workload has never been tested at representative scale.

### 6.8 Chaos and resilience testing

Test controlled loss/degradation of:

- worker;
- database connectivity;
- object storage;
- model provider;
- embedding provider;
- notification provider;
- projection processor;
- queue scheduler;
- search/vector index;
- graph/relationship projection.

Verify fencing, retry, fallback, degraded-mode behavior, fail-closed boundaries and recovery.

### 6.9 Independent adversarial audit

The adversarial audit must be authored and executed independently from implementation assumptions.

The auditor should attempt to create:

- false PASS;
- false SUCCESS;
- false CLOSED;
- false SCORE;
- false approval;
- false authoritative lineage;
- false policy citation;
- unauthorized data disclosure;
- duplicate autonomous action;
- budget/concurrency bypass;
- lifecycle/promotion bypass;
- provider-fallback policy bypass;
- poisoned memory promotion;
- synthetic learning evidence masquerading as real;
- rollback to an unapproved baseline;
- audit deletion/tampering;
- legal-hold bypass.

Every discovered defect requires:

reproduction → regression test → fix → adjacent tests → relevant E2E → evidence update.

### 6.10 Security revalidation

Re-run:

- RLS/role grants;
- resource ACL/DENY precedence;
- secret-hygiene gate;
- dependency/security scanning;
- privileged API audit;
- prompt/document injection defenses;
- external URL/fetch boundaries;
- SSRF/path traversal where applicable;
- token/signature/replay controls;
- provider data-residency restrictions;
- evidence leakage checks.

### 6.11 Production canary and revalidation

Use:

preview → validated test → controlled canary → monitored production → full production.

Canary must verify:

- exact build SHA;
- schema compatibility;
- authorization;
- core golden journeys;
- SLOs;
- error budgets;
- provider routing;
- recovery;
- audit evidence.

Do not infer production success from deployment status alone.

### 6.12 Rollback and DR exercise

Before final closure:

1. execute a controlled rollback;
2. verify restored behavior and evidence;
3. execute isolated DR restore;
4. rebuild derived indexes/projections;
5. verify RPO/RTO;
6. run core E2E against restored environment;
7. capture immutable evidence.


### 6.13 Threat modeling and abuse-case review

Before implementation is considered complete for a material capability, maintain a lightweight but explicit threat model covering:

- assets and authoritative truth;
- trust boundaries and privileged components;
- identity, tenant/project/resource boundaries;
- external providers and connector boundaries;
- sensitive data and model context;
- agent/tool authority;
- attacker goals and abuse cases;
- failure escalation paths;
- detection and recovery controls.

Threat-model changes are mandatory when a change introduces a new external integration, privileged API, model/tool capability, persistence store, upload/parser path, autonomous action, cross-tenant query path or production mutation.

Certification must prove that mitigations are represented in code/tests rather than only in documentation.

### 6.14 Property-based, fuzz and parser robustness testing

Example-based unit tests are necessary but insufficient for parsers, state machines and combinatorial validation logic.

Where applicable add:

- property-based tests for invariants;
- fuzzing of parsers, structured tool inputs, file/metadata ingestion, search/query parameters and serialization boundaries;
- malformed Unicode, encoding, truncation, oversized/nested payloads and schema ambiguity;
- state-machine sequence generation for invalid transitions;
- differential tests where two independent implementations/projections should agree;
- metamorphic tests for retrieval, scoring or analytics invariants where a fixed oracle is difficult.

Any fuzz-discovered defect becomes a minimized permanent regression case.

### 6.15 Schema, API and data migration safety

Every material database, index, event, API or persisted-agent-state change must declare compatibility explicitly.

Use expand → migrate/backfill → verify → switch → contract where destructive replacement is avoidable.

Required evidence includes:

- old-code/new-schema compatibility during rollout;
- new-code/old-data compatibility where deployment order can expose it;
- idempotent resumable backfill;
- row/object counts and checksums or semantic reconciliation;
- no silent defaulting of authoritative values;
- rollback or forward-recovery strategy;
- migration interruption and restart tests;
- production-sized migration timing where scale matters.

Destructive schema contraction occurs only after proving no supported reader/writer depends on the old representation.

### 6.16 Software supply-chain and release integrity

Treat release integrity as a certification requirement, not only repository security.

Required controls for production artifacts should include:

- dependency lock and review;
- software bill of materials where supported;
- automated vulnerability/dependency scanning;
- pinned and reviewed CI/CD actions/tooling;
- build provenance bound to source revision and artifact digest;
- signed or otherwise verifiable provenance from the hosted build pipeline where available;
- immutable exact-SHA release identity;
- verification that the deployed artifact is the artifact that passed certification;
- protected release credentials and separation of build/release authority.

A green source commit is insufficient if the deployed binary/container/artifact cannot be traced back to that certified source and build.

### 6.17 Privacy and sensitive-data assurance

Security testing must include privacy and data-minimization behavior.

Validate:

- PII/sensitive values are not unnecessarily copied into logs, traces, prompts, embeddings, analytics or learning memory;
- tenant/project/resource isolation applies equally to derived stores and retrieval indexes;
- deletion/retention/legal-hold rules propagate correctly to derived representations;
- test/evaluation corpora do not introduce uncontrolled production-sensitive data;
- exports enforce the same authorization and classification rules as interactive reads;
- prompt/tool/model telemetry redacts protected values;
- model/provider routing respects configured data-handling restrictions.

### 6.18 Operational-readiness review and SLO gates

Before production certification, each material service/job must have:

- defined owner;
- documented SLIs/SLOs;
- actionable alerts;
- dashboards for golden signals and business-critical workflow health;
- runbooks for common failure modes;
- capacity assumptions and saturation indicators;
- dependency inventory;
- recovery and escalation path;
- kill switch/feature flag where risk warrants it.

Canary promotion must be based on measured control-versus-candidate health and explicit SLO/error-budget criteria. A deployment that remains technically reachable but materially degrades an SLO is not a successful certification.

### 6.19 Stronger independent-audit separation

The independent adversarial audit must be structurally separate enough to challenge implementation assumptions.

Use, where practical:

- a separate auditor/agent or reviewer from the implementation stream;
- an independently derived test charter from frozen requirements and threat models;
- independent test data and adversarial fixtures;
- both white-box review and black-box runtime testing;
- no reuse of implementation-only assertions as the sole acceptance oracle;
- immutable audit findings with severity, reproduction and evidence;
- retest by the independent lane after remediation.

Critical findings cannot be waived implicitly by the implementing workstream. Any accepted exception requires explicit owner, rationale, compensating controls, expiry/review date and evidence.



### 6.20 Risk-tiered revalidation without weakening final certification

Use change-impact classification so assurance is fast during implementation and exhaustive at final release.

Suggested tiers:

| Change tier | Examples | Required revalidation |
| --- | --- | --- |
| T0 | Documentation-only, no executable/config contract change | documentation/link/schema-reference checks |
| T1 | Isolated UI/read-only logic | affected unit/contract/integration tests plus security lint |
| T2 | API, persistence, retrieval, queue or non-destructive runtime logic | affected unit/integration/negative/failure/concurrency suites plus migration/compatibility checks |
| T3 | Authorization, approval, autonomous action, schema migration, lineage authority, retention, rollback, DR, build/release security | full affected-domain assurance including adversarial/security/load/recovery where relevant |
| Release candidate | final exact head | full clean-room, E2E, load, chaos, security, adversarial, rollback, DR and production revalidation |

Risk-tiering reduces unnecessary CI cost but never weakens the final exact-head release gate.

### 6.21 Configuration and environment drift assurance

Production behavior depends on code, schema and configuration together.

Certification must inventory and verify material configuration including:

- environment variables and secret references;
- Supabase/Auth/RLS configuration;
- Vercel/Cloudflare/Render/runtime settings where applicable;
- provider routing/model policy;
- feature flags and kill switches;
- queues/schedulers/cron;
- storage buckets/CORS/lifecycle settings;
- rate limits, concurrency and budget controls;
- notification/integration endpoints.

Where practical, desired state should be codified and compared against runtime state. Material drift must either fail certification or be explicitly documented and approved.

### 6.22 Immutable certification evidence manifest

Every final certification should produce a machine-readable evidence manifest binding:

- exact Git SHA;
- build/deployment artifact digest;
- migration set/checksum;
- test-suite versions and results;
- evaluation dataset/corpus versions;
- model/provider/embedding versions where relevant;
- configuration fingerprint;
- canary window and measured SLO results;
- security/adversarial findings and dispositions;
- rollback/DR evidence;
- production deployment identifier and verification timestamp.

The manifest is the canonical proof of what was certified. A later change to any bound material input invalidates only the affected certification scope, while a new release candidate still receives full exact-head certification.


## 9. Deferred future production-certification criteria

When operationalization is reopened, production-certified status may require the following applicable criteria. These are not current implementation-completion gates:

- functional requirement complete;
- governance/authorization complete;
- migrations replay cleanly;
- unit tests pass;
- integration tests pass;
- negative tests pass;
- failure injection passes;
- concurrency tests pass;
- performance/load target passes;
- security review passes;
- threat model and abuse-case mitigations are verified;
- privacy/sensitive-data assurance passes;
- software supply-chain and release-provenance checks pass;
- migration/API compatibility and backfill verification pass where applicable;
- property/fuzz robustness testing passes where applicable;
- adversarial audit passes or has an explicitly approved exception;
- rollback/recovery passes;
- relevant scale target is proven;
- exact-head CI is green;
- deployed exact SHA is verified;
- production revalidation passes;
- documentation/evidence is reconciled;
- configuration/runtime drift checks pass;
- immutable certification evidence manifest is complete;
- no unresolved P0/P1 defect remains.

## 10. External dependency affecting implementation

Source-authoritative lineage cannot reach 100% while the Databricks source does not expose the required `system.access` lineage evidence.

The completion plan therefore requires the external permission to be granted and the authoritative lineage acceptance suite to pass. Until then, DataNexus must continue to label inferred/AI-assisted lineage separately and must not manufacture source-observed lineage.

## 11. Current immediate implementation order

1. Continue the current learning chain: #820 approval binding → #821 controlled-release/rollback implementation.
2. Establish analytical/history contracts and complete missing implementation in Workstream A.
3. Establish retrieval/re-embedding contracts and complete missing implementation in Workstream B.
4. Resolve Databricks lineage permission and implement authoritative ingestion in Workstream C.
5. Implement unified rebuild/recovery contracts needed by current functionality in Workstream E.
6. In parallel, close remaining functional gaps in mature capabilities through Workstream F.
7. Reconcile all implementation streams through Workstream G. Do not start certification or production-hardening work.


## 12. Preserved future assurance references

The implementation and assurance model should be maintained as a practical crosswalk rather than a compliance claim.

Relevant reference families include:

- NIST Secure Software Development Framework (SSDF), including AI-specific secure-development guidance;
- NIST AI Risk Management Framework and Generative AI Profile for lifecycle risk, evaluation and governance;
- OWASP ASVS for web/application security verification;
- OWASP Top 10 and OWASP GenAI/LLM risk guidance for application and AI-specific abuse cases;
- SLSA concepts for build provenance and software supply-chain integrity;
- SRE practices for SLOs, error budgets, reproducible releases, canary analysis and automated rollback.

Where DataNexus requirements are stricter than a reference baseline, the stricter DataNexus requirement remains authoritative.
