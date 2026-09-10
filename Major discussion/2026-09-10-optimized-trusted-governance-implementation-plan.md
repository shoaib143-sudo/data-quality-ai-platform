# Optimized Trusted Operational Governance Implementation Plan

**Date:** 2026-09-10  
**Project:** DataNexus AI / Data Governance PowerHouse  
**Architecture anchor:** `Architecture/2026-09-10-ADR-007-trusted-operational-governance-capability-model.md`  
**Execution map:** `Architecture/2026-09-10-trusted-operational-governance-implementation-map.md`

## 1. Goal

Deliver DataNexus as a fully functional, operational AI Data Governance platform whose governance decisions, evidence, workflows, automation, AI reasoning and runtime behavior are trustworthy in production.

There is no separate "trusted foundation" stage followed by an "operational product" stage. Functional operation and trust controls must be completed together.

The implementation unit is therefore a **trusted operational governance capability**.

## 2. Optimization principles

### 2.1 Reuse before build

The repository already contains substantial substrate for profiling, data quality, governance, classification, lineage, AI routing/retrieval/evaluation, governed autonomy, agent memory/learning, orchestration and verification. The plan must activate and connect those components before creating new parallel engines.

### 2.2 Vertical completion over horizontal feature accumulation

Do not implement all glossary features, then all CDE features, then all DQ features. Deliver complete user journeys that exercise multiple domains together.

### 2.3 P0-P5 remain permanent invariants

Every increment must preserve:

- tenant/project isolation and governance boundaries
- real profiling evidence and no fabricated persisted evidence
- governed model invocation
- governed permission-scoped retrieval and grounded citations
- CI/build/migration/security verification
- durable worker pool isolation and capacity enforcement

### 2.4 Evidence-first architecture

Every material result must be attributable to authoritative facts, observed evidence, derived intelligence or governed decisions. These classes must not be silently mixed.

### 2.5 Risk-tier controls

Control depth should follow criticality, sensitivity, regulatory relevance, contractual obligations and downstream/business impact. Low-risk staging assets should not create the same operational burden as regulated CDEs.

### 2.6 Infrastructure follows measured need

Do not make OpenSearch, ClickHouse or additional infrastructure prerequisites for product completion. Add them only when measured scale, latency or workload isolation requires them.

## 3. Current implementation baseline

### Existing capabilities to reuse

- catalog and dataset/version lifecycle
- source connector/JDBC framework
- profiling lifecycle and metric evidence
- governance authorization and immutable audit patterns
- classification services and UI surfaces
- governance policy decision and autonomy services
- lineage adapters, change gates and impact services
- data-quality automation, remediation, automatic reprofile and verification
- agent portfolio, memory/learning and resumable execution
- governed AI/model/retrieval/evaluation infrastructure
- durable job orchestration and workload pools
- product pages for datasets, catalog, classification/privacy, contracts, DQ, documents, agents and AI insights
- broad `verify:*` contract suite and production readiness checks

### Remaining activation/integration gaps

The critical gaps are not primarily infrastructure gaps. They are operational capability gaps:

- a realistic reference estate and reproducible acceptance scenario
- operational glossary/governance corpus
- first-class CDE registry and relationships
- ownership/stewardship workflows exercised with real assets
- control catalog and control applicability
- authoritative-source, usage-purpose, retention and jurisdiction lifecycle metadata
- complete DQ rule/result/exception semantics
- anomaly/drift/freshness integrated into incident/remediation workflows
- richer field-level lineage and transformation evidence
- business-impact relationships
- shared evidence-planning investigation service
- specialized agent E2E journeys over real governance evidence
- governed action verification and outcome learning
- workflow-level SLOs and degraded/adversarial acceptance paths

## 4. Delivery structure

The program is organized into six vertical release increments. Each increment is independently useful and must ship with UI/API/runtime behavior, governed state, evidence, authorization, observability and tests.

---

## Increment V1: Govern a Sensitive Critical Dataset

### Business outcome

A real source can be onboarded and a sensitive/critical dataset can be understood, classified, assigned accountability and linked to applicable governance controls.

### Reference scenario

Use a realistic Customer domain with a source estate such as:

- `crm.customers`
- `crm.contacts`
- `commerce.orders`
- `payments.payments`
- warehouse/customer marts
- one downstream business/reporting consumer

Seed deliberate but realistic imperfections and governance context.

### Functional chain

`Source -> Dataset -> Version -> Profile -> Semantic/Sensitive Suggestion -> Glossary Mapping -> CDE -> Owner/Steward -> Policy/Control -> Retention/Purpose -> Governance View`

### Required implementation

#### Reference estate

Create a deterministic, resettable reference organization/data estate used by development, CI-compatible behavioral tests and demonstration flows. It must contain real relationships and realistic data issues, not only synthetic empty fixtures.

#### Governance knowledge

Operationalize a small but non-trivial corpus:

- business terms and definitions
- CDE definitions
- policy/standard/control records
- sensitive-data vocabulary
- owner/steward assignments
- policy-to-term/CDE/dataset/column relationships
- authoritative-source designation where applicable
- usage purpose
- retention/lifecycle metadata

#### CDE capability

CDE records must include business definition, domain, criticality, regulatory relevance, owner/steward, source fields, DQ/control links, contract/certification links and current health.

#### Classification workflow

AI may suggest classifications with confidence/evidence. Authoritative classification requires governed transition according to policy. Suggestion and authoritative truth must be distinct.

#### UX

The dataset view should answer:

- What is this data?
- Is it sensitive/critical?
- Who owns/stewards it?
- Which policies/controls apply?
- What evidence supports those conclusions?
- What requires action?

### Primary repo touchpoints

- `lib/catalog/`
- `lib/profiling/`
- `lib/governance/classification.ts`
- `lib/governance/`
- `lib/ai/`
- `app/datasets/`
- `app/catalog/`
- `app/classification/`
- `app/classification-privacy/`
- forward Supabase migrations

### V1 exit gate

Normal path:

- source/dataset/version/profile succeeds
- sensitive suggestion is evidence-linked
- CDE and glossary relationships are visible
- owner/steward and applicable controls resolve correctly
- authoritative classification requires governed approval

Unauthorized path:

- cross-project reads fail
- unauthorized classification/ownership/control mutation fails
- direct authoritative-state bypass fails

Degraded path:

- source/profile/classification failure produces explicit unavailable/error state
- no invented evidence or accidental approval is persisted

---

## Increment V2: Detect and Resolve a Data Quality Incident

### Business outcome

DataNexus detects a real quality problem, explains its significance, routes remediation and proves whether the remediation worked.

### Functional chain

`Profile -> Candidate DQ Rule -> Approval -> Rule Version -> Execution -> Result -> Drift/Freshness/Anomaly -> Finding -> Incident -> Impact -> Remediation -> Reprofile -> Verification -> Outcome`

### Required implementation

#### DQ result contract

Standardize result state to distinguish:

- PASS
- FAIL
- NOT_MEASURED
- UNAVAILABLE
- ERROR
- NOT_APPLICABLE
- WAIVED

Zero must not mean missing. Execution error must not be represented as a quality result. Waiver must only exist when a valid governed exception applies.

#### Rule lifecycle

Support a pragmatic initial rule set:

- NOT_NULL
- UNIQUE
- RANGE
- PATTERN/REGEX
- ENUM
- REFERENTIAL_INTEGRITY
- FRESHNESS
- VOLUME
- DISTRIBUTION
- SCHEMA
- CUSTOM_SQL

Rules require versioning, applicability, threshold/config, owner, status and evidence references.

#### Exceptions/waivers

Waivers require:

- scope
- reason
- requester
- approver
- start/end or expiry
- linked control/rule
- evidence
- automatic re-evaluation after expiry

#### Risk/impact

A DQ failure affecting a CDE must inherit context from sensitivity, policy, contract, lineage and business usage so priority is evidence-based.

#### Remediation verification

Reuse existing remediation/reprofile/verification services. Extend them so before/after metrics and final effectiveness are persisted as first-class outcome evidence.

### Primary repo touchpoints

- `lib/data-quality/automation.ts`
- `lib/data-quality/autonomous-operations.ts`
- `lib/data-quality/remediation-reprofile.ts`
- `lib/data-quality/remediation-verification.ts`
- `lib/data-quality/recommendation-effectiveness.ts`
- `lib/profiling/`
- `lib/governance/`
- `app/data-quality/`
- forward migrations

### V2 exit gate

The reference estate must demonstrate one deliberate issue, for example a `customer_email` null-rate regression or an order/payment integrity break, and prove:

- detection from persisted evidence
- governed rule lifecycle
- incident creation/association
- risk/impact explanation
- remediation recommendation/action
- automatic reprofile
- before/after verification
- verified success and verified failure paths
- valid waiver behavior

---

## Increment V3: Govern a Data Change and Compute Impact

### Business outcome

A proposed schema/field change can be evaluated for technical, governance, contractual and business impact before it becomes harmful.

### Functional chain

`Proposed Change -> Field Lineage -> Transformations -> Downstream Assets -> CDEs -> DQ Rules -> Contracts -> Policies -> Consumers -> Owners -> Risk -> Approval/Gate`

### Required implementation

#### Field lineage

Strengthen lineage acquisition so relationships include source column, target column, transformation type, transformation evidence and confidence/truth status.

Priority transformation types:

- direct mapping
- cast
- rename
- join
- filter
- case/conditional
- coalesce
- aggregation
- hash/mask
- computed expression

#### Business impact

Introduce durable relationships from technical assets to at least one business process/report/product/regulatory purpose in the reference estate.

#### Contract/certification integration

Change impact must show affected contracts, DQ controls, CDEs and certification readiness/status. Existing governed certification boundary remains authoritative.

#### Change gate

Reuse and extend existing lineage change gate/impact services. AI can explain impact and suggest actions, but the deterministic gate owns enforcement.

### Primary repo touchpoints

- `lib/governance/lineage-adapters.ts`
- `lib/governance/lineage-change-impact.ts`
- `lib/governance/lineage-change-gate.ts`
- GraphProvider/data-plane implementations
- `app/contracts/`
- lineage/catalog/dataset UX
- forward migrations

### V3 exit gate

A deliberate `customer_id` type or semantic change must produce an exact impact bundle showing affected columns, CDEs, DQ rules, contracts, policies, downstream assets/consumers and accountable people. Unauthorized change approval must fail. Missing lineage must reduce confidence or block according to policy, never be silently assumed safe.

---

## Increment V4: Cross-Domain Governance Investigation and Specialized Agents

### Business outcome

Users can ask cross-domain governance questions and receive permission-safe, evidence-grounded answers and recommendations assembled from authoritative truth, retrieval, graph relationships and history.

### Functional chain

`Question/Finding -> Intent/Scope -> Evidence Plan -> Truth + Retrieval + Graph + History -> Evidence Bundle -> Reasoning -> Hypotheses -> Confidence -> Recommendation`

### Required implementation

#### Shared investigation service

Build one reusable evidence-planning service rather than independent agent retrieval stacks. It should return structured evidence bundles with object references and provenance.

#### Agent specialization

Each enabled agent must have explicit:

- role
- supported intents
- tool allowlist
- object/project scope
- evidence requirements
- action authority
- output contract
- evaluation rubric

Use the existing agent portfolio and governed AI path.

#### Agent security envelope

Authorization, risk tier, approval policy, tool constraints, retrieval scope, budgets and output validation remain deterministic outside the model.

Retrieved documents, prior memories and tool output are untrusted model input. Prompt injection or retrieved instructions may never override deterministic authorization/action policy.

#### Initial role-specific acceptance scenarios

- Profiling Agent: explain profile deterioration
- DQ Agent: explain violation and recommend a rule/remediation
- Steward Agent: identify missing stewardship/classification/CDE mapping
- Governance Analyst: explain highest governance risk in the reference estate
- Architect Agent: explain `customer_id` change impact
- Investigator Agent: identify likely cause and downstream impact of the reference DQ incident
- Executive Agent: prioritize risks by business impact
- Support Agent: diagnose a failed or unavailable governance workflow using platform evidence

### Primary repo touchpoints

- `lib/agents/`
- `lib/governance/ai-governance-intelligence.ts`
- governance intelligence/brief services
- `lib/ai/`
- GraphProvider/retrieval providers
- `app/agents/`
- `app/ai-insights/`
- `app/ai-capabilities/`

### V4 exit gate

Every enabled agent completes at least one role-specific E2E scenario over the reference estate with:

- authorization correctness
- evidence completeness
- citation validity where retrieval is used
- tool-selection correctness
- bounded action authority
- no cross-project leakage
- deterministic behavior when evidence is missing

Adversarial tests must include cross-scope retrieval attempts, malicious retrieved instructions, fake citation pressure and excessive-tool/action requests.

---

## Increment V5: Governed Action, Outcome Learning and Continuous Evaluation

### Business outcome

Recommendations can become policy-valid actions, outcomes are verified, and later decisions can reuse validated historical outcomes without confusing memory with governance truth.

### Functional chain

`Recommendation -> Policy Decision -> Approval if required -> Durable Action -> Verification -> Outcome -> Evaluation -> Learning Promotion -> Similar Future Case`

### Required implementation

#### Action policy

Operationalize L0-L3 autonomy tiers:

- L0: explain/read
- L1: recommend/draft
- L2: governed action under explicit policy/approval
- L3: autonomous low-risk reversible operations

High-risk authoritative governance changes remain approval-gated.

#### Outcome truth

Persist:

- recommendation version/type
- evidence/context
- human decision
- rejection reason when available
- executed action
- before/after evidence
- verification state
- effectiveness
- actor/model/agent version

#### Learning promotion

Only verified, policy-valid outcomes are eligible for successful-case promotion. Failed outcomes remain useful negative examples. Superseded or invalid memories must be marked accordingly.

#### Evaluation

Persist/query agent evaluation by agent/version/project/time for at least:

- groundedness
- authorization correctness
- factual correctness
- retrieval relevance
- tool selection
- recommendation quality
- explainability
- confidence calibration
- human acceptance/rejection
- outcome effectiveness
- latency/cost/tool-call count
- failure/retry

### Primary repo touchpoints

- `lib/governance/governed-autonomy.ts`
- `lib/governance/approved-autonomy-execution.ts`
- `lib/agents/agent-memory.ts`
- `lib/agents/agent-memory-learning.ts`
- `lib/agents/governed-learning-context.ts`
- `lib/data-quality/recommendation-effectiveness.ts`
- AI evaluation infrastructure
- audit/observability surfaces

### V5 exit gate

A completed reference incident must produce a reusable case. A later similar scenario must retrieve that case, show how it influenced the recommendation, preserve provenance, and demonstrate that authorization/policy still controls the new action independently of memory.

---

## Increment V6: Operate, Attack, Degrade and Certify the Complete Platform

### Business outcome

The complete governance loop is proven under realistic concurrency, failures and adversarial conditions, not only happy-path demonstrations.

### Required implementation

#### Workflow SLIs/SLOs

Measure at least:

- discovery/profile completion
- DQ evaluation completion
- freshness detection delay
- incident-to-investigation latency
- approval queue age
- remediation-to-verification latency
- evidence completeness
- critical-asset control coverage
- agent groundedness/authorization correctness
- job saturation/retry exhaustion

Use explicit error-budget thinking rather than a false 100% availability target.

#### Failure injection

Exercise:

- unavailable source
- partial profile
- expired worker lease
- duplicate/retried jobs
- provider timeout/fallback
- unavailable retrieval projection
- invalid/poisoned retrieved content
- missing lineage
- stale/expired waiver
- remediation failure
- concurrent project capacity pressure

#### Security/adversarial acceptance

Exercise:

- cross-project read/write attempts
- direct governance mutation attempts
- prompt injection from documents
- RAG cross-scope leakage attempts
- excessive agent action requests
- memory poisoning attempts
- forged/fake evidence references

#### Final operational certification scenario

The roadmap's full governance loop becomes executable and repeatable:

`Real Source -> Register/Version -> Profile -> Sensitive/semantic suggestion -> Glossary -> CDE -> Stewardship -> DQ rules -> Violations/anomaly/freshness -> Policies -> Contracts/Certification -> Field lineage -> Risk/Business Impact -> Governance Analyst -> Specialist recommendations -> Approval -> Governed action -> Reprofile -> Verification -> Feedback -> Evaluation -> Learning -> Later reuse -> Executive outcome`

For each critical step, prove:

1. normal path
2. unauthorized/adversarial path
3. degraded/failure path

### Primary repo touchpoints

- `.github/workflows/`
- `scripts/verify-*`
- `lib/observability/`
- `lib/orchestration/`
- worker/API routes
- production benchmark/evidence scripts
- final evidence documentation

### V6 exit gate

DataNexus may be described as a trusted operational governance platform only when the final scenario is repeatable with persisted evidence and all permanent P0-P5 plus V1-V6 behavioral gates are green.

## 5. Parallel execution lanes

Vertical increments remain the release unit, but work can proceed in parallel inside each increment.

| Lane | Responsibility | Rule |
|---|---|---|
| Domain truth | schema/RPC/services for authoritative governance state | Forward migrations only; fail closed |
| Evidence/control | provenance, control evaluation, risk/applicability | Never convert AI output directly into authoritative truth |
| Product | API + UX for evidence/decision/action flow | Decision-oriented, not CRUD-only |
| Intelligence | governed retrieval, investigation, agents | Reuse shared governed AI path |
| Orchestration | durable jobs, retries, dependencies, capacity | Reuse workload pools and idempotent patterns |
| Assurance | tests, CI, SLOs, adversarial/degraded cases | Behavioral proof required before merge/closure |

No lane can independently declare the increment complete.

## 6. Pull request strategy

Avoid very large all-domain PRs. For each increment, use dependency-sized change sets that leave the branch/build valid.

Recommended order inside an increment:

1. forward migration + types/data contracts
2. governed service/RPC implementation
3. evidence/control integration
4. API and worker integration
5. UI/decision surface
6. behavioral tests and verifiers
7. live/deployed validation evidence when required

A schema-only PR may merge when it is a safe enabling change, but the capability remains incomplete until the vertical exit gate passes.

## 7. Test strategy

### Contract tests

Preserve existing `verify:*` checks for profiling, governance, retrieval, model gateway, agents, learning, lineage, autonomy, database and production boundaries.

### Journey tests

Add a small set of reusable journey-level tests rather than dozens of disconnected module tests. Candidate top-level commands:

- `verify:journey-sensitive-governance`
- `verify:journey-dq-incident`
- `verify:journey-change-governance`
- `verify:journey-governance-investigation`
- `verify:journey-governed-learning`
- `verify:journey-operational-certification`

Each journey should validate normal, unauthorized and degraded paths.

### Live tests

Where CI cannot prove a deployed database or provider boundary, execute rollback-only or disposable-fixture live validation and persist measured evidence. Do not claim a skipped CI live test executed.

## 8. Data and fixture strategy

Use three fixture classes:

### Minimal unit fixtures

Fast deterministic fixtures for pure logic.

### Reference estate

A resettable realistic Customer/Orders/Payments estate containing governance knowledge, lineage, policies, contracts, CDEs, DQ rules and known incidents.

### Live disposable validation fixtures

Transactionally rolled-back or explicitly disposable records for validating deployed database/runtime boundaries.

Reference data must never be silently mixed with customer/production evidence.

## 9. Product UX strategy

Shift major surfaces from object administration to decision support.

For a dataset, the primary summary should expose:

- quality and trend
- governance risk and contributors
- critical elements
- sensitivity/classification
- ownership/stewardship
- applicable policies/controls/contracts
- certification readiness/state
- freshness/observability
- incidents and affected lineage
- recommended next actions
- evidence behind each material conclusion

CRUD/editor screens remain available but are secondary to evidence, risk and action workflows.

## 10. Performance and scale strategy

Do not optimize by adding infrastructure prematurely.

First measure:

- profile throughput by dataset size/source
- DQ rule throughput
- graph traversal/change-impact latency
- retrieval latency/relevance
- agent end-to-end latency/cost
- queue wait and saturation
- audit/evidence write amplification

Only introduce additional projections or stores where a measured SLO cannot be met with the baseline architecture.

## 11. Definition of done for every implementation ticket

A ticket that changes a trusted operational capability should specify:

- business/user outcome
- authoritative objects affected
- evidence produced/consumed
- authorization capability/policy
- state transitions
- retry/failure behavior
- audit event
- observability metric
- tests: normal/unauthorized/degraded as applicable
- migration/backfill impact
- backward compatibility
- live validation requirement

Tickets lacking these fields should not be treated as implementation-ready for critical governance paths.

## 12. Critical path

The optimized dependency order is:

```text
Reference estate and acceptance harness
          ↓
V1 Sensitive/Critical Dataset Governance
          ↓
V2 DQ Incident and Verified Remediation
          ↓
V3 Field Change Governance and Business Impact
          ↓
V4 Shared Investigation and Agent Specialization
          ↓
V5 Governed Action, Outcome Learning and Evaluation
          ↓
V6 Stress, Adversarial Testing and Full Certification
```

Some implementation work can overlap, but a later increment must not become the release definition before the evidence dependencies beneath it exist.

## 13. What we intentionally do not do first

Do not prioritize these ahead of the critical path unless a measured blocker requires them:

- broad new connector catalog
- separate agent-specific retrieval stacks
- custom external graph database
- OpenSearch migration as a product milestone
- ClickHouse migration as a product milestone
- opaque predictive ML before sufficient historical evidence exists
- autonomous high-risk governance actions
- large UI redesign disconnected from working journeys

## 14. Program success criteria

The program is successful when a real governance team can:

1. onboard and understand actual data,
2. identify critical/sensitive data and accountable people,
3. determine applicable policies, controls, contracts and lifecycle obligations,
4. continuously measure data quality/freshness and detect deterioration,
5. compute technical and business impact,
6. investigate problems with permission-safe evidence-grounded AI,
7. make or approve governed decisions,
8. execute durable remediation/actions,
9. verify the outcome from fresh evidence,
10. audit the full chain,
11. measure operational and AI quality,
12. reuse validated historical outcomes in later decisions without weakening current authorization or policy.

At that point, functionality, operations and trust are properties of the same product.
