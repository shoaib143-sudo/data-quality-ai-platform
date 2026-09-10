# Trusted Operational Governance Product Strategy

**Date:** 2026-09-10  
**Project:** DataNexus AI / Data Governance PowerHouse  
**Purpose:** Reconcile platform trust, product functionality, operational governance, and AI governance into one implementation strategy.

## 1. Core conclusion

DataNexus should not treat "trusted platform foundation" and "operational governance product" as separate stages.

They go hand in hand.

A governance product can be called trusted only when the product itself is fully functional and operational across real governance workflows, and those workflows preserve authorization, evidence, provenance, policy enforcement, reliability, auditability, and safe AI behavior.

The program goal is therefore:

> Build a fully functional, operational AI Data Governance platform whose governance decisions, evidence, workflows, automation, AI reasoning, and runtime behavior are trustworthy in production.

P0-P5 established and verified important horizontal trust controls. They remain permanent invariants. They do not, by themselves, establish full product trust.

## 2. What changes in the implementation approach

The remaining work should not be described as a transition from "foundation" to "product." It is the continued completion of the same trusted operational governance platform.

The implementation unit becomes a **trusted operational governance capability**.

For every capability, the following must be implemented together:

```text
UI / user workflow
+ domain model
+ API/service behavior
+ database truth
+ authorization
+ governance policy
+ evidence/provenance
+ AI behavior where applicable
+ durable execution
+ observability
+ audit
+ failure handling
+ verification
```

A feature is not complete because a table exists, a screen renders, an RPC succeeds, or an agent produces text.

## 3. Permanent P0-P5 invariants

All future work must continue to preserve the existing verified boundaries.

### P0

- no known cross-project/tenant evidence path
- governed state transitions
- direct bypass attempts fail closed
- capability authorization enforced
- no fabricated governance evidence

### P1

- profiling lifecycle remains evidence-linked
- source-backed observations only
- deterministic run/version/result linkage
- explicit failure/unavailable semantics

### P2

- applicable LLM calls use the governed model path
- model/provider policy is centralized
- outputs are validated before becoming application results

### P3

- retrieval is permission scoped
- embedding space is explicit
- grounding/citations refer to authorized evidence
- RAG content is treated as untrusted input

### P4

- CI proves runtime contracts, build, security boundaries, migrations, and behavioral scenarios

### P5

- worker pools remain isolated
- project capacity is enforced
- retries/leases/dependencies remain deterministic
- runtime behavior remains measurable

Future delivery must extend these controls, not bypass or weaken them.

## 4. Optimized design principle: outcomes before components

The roadmap should be driven by governance outcomes rather than infrastructure components.

The core outcomes are:

1. Know what data exists and whether it can be trusted.
2. Know which data is critical, sensitive, regulated, or operationally important.
3. Know who owns, stewards, approves, and is accountable for it.
4. Know which policies, contracts, controls, retention rules, and access requirements apply.
5. Detect when data quality or governance deteriorates.
6. Understand downstream technical and business impact.
7. Investigate why a problem occurred.
8. Recommend or execute the correct governed response.
9. Verify whether the response actually fixed the problem.
10. Record outcomes and improve future decisions.

Infrastructure is justified by one or more of these outcomes.

## 5. Build a permanent realistic reference estate

The platform needs a realistic permanent acceptance estate rather than relying only on isolated unit fixtures or synthetic happy paths.

Recommended initial estate:

```text
CRM
 ├─ customers
 ├─ addresses
 └─ contacts

Commerce
 ├─ orders
 ├─ order_items
 └─ products

Payments
 ├─ payments
 └─ refunds

Warehouse
 ├─ dim_customer
 ├─ fact_orders
 └─ fact_payments

Analytics
 ├─ customer_360
 ├─ revenue_daily
 └─ executive_revenue_report
```

The estate should contain realistic governance metadata:

- glossary terms
- business definitions
- CDEs
- owners/stewards
- sensitive classifications
- policies and controls
- contracts
- DQ rules
- certification state
- lineage
- business processes/reports

It must also deliberately contain realistic defects:

- duplicate customer identifiers
- missing contact values
- invalid code values
- stale feeds
- referential-integrity problems
- schema evolution
- new sensitive columns
- contract breach
- certification/readiness gap
- downstream impact
- remediation success and failure scenarios

This estate becomes executable acceptance evidence for the platform.

## 6. Governance knowledge activation

Governance knowledge must become operational data, not empty schema.

A realistic first corpus should contain enough connected objects to support actual reasoning, for example:

```text
20-40 glossary terms
5-10 CDEs
3-6 policies
10-20 requirements/controls
2-4 contracts
15-30 DQ rules
multiple owners/stewards
sensitive classifications
technical and business lineage
```

Required relationships should include:

```text
Regulation
  ↓
Policy
  ↓
Control / Requirement
  ↓
Business Term
  ↓
CDE
  ↓
Dataset
  ↓
Column
  ↓
DQ Rule / Contract
  ↓
Owner / Steward
```

## 7. CDEs should be central to business significance

CDEs are the bridge between technical evidence and business risk.

Without CDE context:

```text
orders.customer_id null rate = 3.6%
```

With CDE context:

```text
Customer Identifier CDE
        ↓
orders.customer_id
payments.customer_id
warehouse.dim_customer.customer_key
        ↓
Customer Identity Policy
        ↓
Order Fulfilment
Payments
Revenue Reporting
        ↓
Criticality = HIGH
```

This relationship should drive risk, prioritization, escalation, stewardship, certification, incident severity, and business impact.

## 8. Add missing operational lifecycle controls

The remaining implementation should explicitly operationalize the controls that mature governance programs require.

Where applicable, each critical asset should be able to carry or resolve:

- authoritative-source designation
- owner
- steward
- business purpose
- glossary/business meaning
- CDE status
- sensitivity/classification
- policy/control applicability
- access/entitlement evidence
- retention/archive/purge policy
- jurisdiction/sovereignty requirements
- contract/SLA expectations
- certification/readiness state
- lineage/downstream impact
- DQ rules/exceptions
- incident/remediation history

These controls should be executable and queryable, not only descriptive metadata.

## 9. Governance Control Catalog

Introduce a formal Governance Control Catalog.

Each control should define:

```text
control_id
objective
applicability
risk tier
owner
enforcement point
evidence required
test
operational metric
failure response
review frequency
```

Example:

```text
Control: GOV-OWN-001
Objective: Critical/regulated assets must have accountable ownership.
Applies to: CDEs, regulated datasets, Tier-1 assets.
Evidence: approved owner assignment.
Metric: percentage of applicable assets with valid ownership.
Failure: governance issue + steward escalation.
```

This turns governance policy into measurable system controls.

## 10. Risk-tier controls rather than uniform governance

Not every asset should receive the same governance burden.

Control applicability should be risk-based using factors such as:

```text
criticality
CDE status
sensitivity
regulation
business purpose
production usage
downstream impact
contractual importance
certification requirement
```

Risk tiers determine:

- mandatory controls
- approval depth
- review cadence
- escalation policy
- SLO expectations
- autonomy tier

This prevents enterprise-scale governance from becoming a low-value task generator.

## 11. DQ must become an operational control system

Profiling is an observation capability. Data quality governance must turn observations into versioned, actionable controls.

Required lifecycle:

```text
Profile evidence
→ candidate rule
→ approval/configured policy
→ rule version
→ execution
→ violation evidence
→ finding
→ issue
→ remediation
→ re-profile/re-evaluate
→ verification
```

Core rule types should include:

```text
NOT_NULL
UNIQUE
RANGE
REGEX/PATTERN
ENUM
REFERENTIAL_INTEGRITY
FRESHNESS
VOLUME
DISTRIBUTION
SCHEMA
CUSTOM_SQL
```

Result semantics must explicitly distinguish:

```text
PASS
FAIL
NOT_MEASURED
UNAVAILABLE
ERROR
NOT_APPLICABLE
WAIVED
```

A rule result should retain at least:

```text
dataset_version_id
rule_version_id
run_id
observed_value
expected_value/threshold
status
evaluated_at
evidence
affected_rows/count
```

Waivers/exceptions require owner, reason, approval, scope, expiry, and re-evaluation.

## 12. Field lineage and governance graph

Dataset-level lineage must evolve into field-level and business-governance relationship coverage.

Technical lineage example:

```text
crm.customers.customer_id
    ↓ CAST
warehouse.dim_customer.customer_key
    ↓ JOIN
warehouse.fact_orders.customer_key
    ↓ AGGREGATION
analytics.revenue_daily
```

Transformation semantics should be retained where possible:

```text
CAST
JOIN
CASE
COALESCE
HASH
AGGREGATION
FILTER
RENAME
```

Governance relationships should support:

```text
Dataset
├─ HAS_COLUMN
├─ OWNED_BY
├─ STEWARDED_BY
├─ CONTAINS_CDE
├─ CLASSIFIED_AS
├─ GOVERNED_BY
├─ SUBJECT_TO
├─ HAS_DQ_RULE
├─ COVERED_BY_CONTRACT
├─ CERTIFIED_BY
├─ FEEDS
├─ USED_BY
└─ IMPACTS
```

PostgreSQL/GraphProvider remains authoritative unless measured scale proves a different graph/storage implementation is required.

## 13. Evidence must become a platform-level contract

Evidence should not be a single undifferentiated concept.

DataNexus should explicitly preserve:

```text
Observed Evidence
→ Derived Intelligence
→ Recommendation
→ Governed Decision
→ Action
→ Outcome
```

A statement such as "Customer Master is high risk" must be traceable to concrete evidence such as:

```text
quality score fell 94 → 76
2 regulated CDEs affected
PII classification present
freshness SLA breached
revenue report downstream
certification nearing expiry
```

The system should separately model:

- authoritative facts
- observations
- derived intelligence
- governed decisions

AI-generated conclusions remain derived intelligence until governance policy converts them into a decision or authoritative state.

## 14. Shared investigation service

The eight agents should not become eight independent orchestration/security stacks.

Use one governed investigation plane:

```text
Question / Alert / Finding
        ↓
Intent + scope
        ↓
Evidence plan
        ↓
┌────────┬─────────┬─────────┬─────────┐
│ Truth  │ Search  │ Graph   │ History │
└────────┴─────────┴─────────┴─────────┘
        ↓
Evidence Bundle
        ↓
Reasoning
        ↓
Hypotheses
        ↓
Confidence
        ↓
Recommendations
```

An evidence bundle should contain object references rather than only prose:

```text
datasets
columns
metrics
findings
DQ rules
incidents
policies
contracts
glossary terms
CDEs
lineage paths
retrieved documents
historical cases
```

Agents vary by role, allowed tools, planning policy, evidence contract, action permissions, and evaluation criteria.

## 15. Deterministic agent security envelope

The LLM must never decide what it is authorized to access or execute.

Before an agent runs, deterministic code establishes:

```text
User
+ Project
+ Agent
+ Action
+ Object
+ Risk Level
+ Approval Policy
+ Tool Allowlist
+ Budget
```

Agent/RAG security acceptance tests must explicitly cover:

- cross-project retrieval attempt
- indirect prompt injection
- malicious/poisoned policy document
- fake citation attempt
- unauthorized tool request
- excessive agency/action request
- poisoned or stale memory
- provider/model failure

## 16. Human-in-the-loop governance

AI suggestions are normally suggestions, not authoritative governance truth.

Example classification lifecycle:

```text
AI detects candidate PERSONAL_DATA
        ↓
SUGGESTED
        ↓
Steward reviews evidence
        ↓
APPROVED / REJECTED
        ↓
AUTHORITATIVE classification
```

The same pattern applies where policy requires it to:

- CDE designation
- glossary mapping
- DQ rule creation
- stewardship assignment
- certification
- remediation
- contract changes

Low-risk operational actions may be autonomous only when the risk/autonomy policy explicitly allows them.

## 17. Verification is part of the business workflow

"Action executed" is not a sufficient success condition.

The platform must measure whether the intended outcome occurred.

Example:

```text
Problem:
customer_email null_rate = 6.2%

Recommendation:
fix ingestion mapping

Action:
pipeline mapping changed

Re-profile:
null_rate = 0.8%

Threshold:
<= 1.0%

Outcome:
VERIFIED_SUCCESS
```

If the metric remains outside threshold, the outcome is a verified failure and must remain visible as such.

## 18. Memory and learning must be outcome-based

Do not use vague conversational memory as the learning model.

Persist operational cases:

```text
case/context
objects involved
evidence
hypothesis
recommendation
human decision
executed action
before metrics
after metrics
outcome
effectiveness
confidence calibration
```

A later similar case must retrieve the earlier validated case and prove that the earlier result influenced the new recommendation.

Learned memory does not override authoritative governance truth.

## 19. Continuous AI evaluation

Agent evaluation must be implemented alongside the agent workflow, not after it.

Persist and trend at least:

- groundedness
- factual correctness
- authorization correctness
- retrieval relevance
- tool selection correctness
- recommendation quality
- human acceptance/rejection
- confidence calibration
- hallucination/citation failure rate
- latency
- cost
- tool-call count
- retry/failure rate
- verified outcome effectiveness

The platform should be able to compare these measures by agent, version, project, and time period.

## 20. Product UX should focus on governance decisions

Core pages should answer:

```text
What needs attention?
Why?
What evidence proves it?
What is affected?
Who is responsible?
What control/policy applies?
What does DataNexus recommend?
What am I allowed to do?
What happened after the action?
```

A dataset view should surface health, risk, certification, CDEs, sensitive data, freshness, issues, ownership, impact, causal evidence, and governed next actions rather than behaving primarily as a CRUD metadata form.

## 21. Workflow-level SLOs

Infrastructure health remains necessary, but governance users experience workflows.

Define measurable SLIs/SLOs for critical journeys, including candidates such as:

```text
source onboarding completion time
profile queue delay
profile completion time
freshness breach detection delay
DQ evaluation completion
investigation latency
approval queue age
remediation verification time
evidence completeness
critical-asset control coverage
agent groundedness/authorization correctness
workflow retry/failure rate
```

Use explicit error budgets to decide when reliability work should take priority over feature velocity.

## 22. Delivery should use vertical slices

Do not execute the remaining roadmap as isolated domain phases such as "all CDEs, then all DQ, then all lineage."

Use complete slices.

### Slice A: Govern a sensitive dataset

```text
Source → catalog → profile → classify → glossary → CDE
→ owner/steward → policy → access/retention → governed decision
```

Exit evidence:

- real source-backed data
- authorized positive path
- unauthorized negative path
- evidence/provenance chain
- steward workflow
- policy/control applicability
- audit trail

### Slice B: Resolve a quality incident

```text
Profile → rule → violation → anomaly → impact → incident
→ investigation → remediation → re-profile → verification
```

Exit evidence:

- before/after measurements
- rule/version provenance
- impact path
- human/policy action
- verified success path
- verified failure path

### Slice C: Govern a data change

```text
Schema/semantic change → field lineage → CDE impact
→ downstream consumer impact → contract/policy impact
→ certification impact → approval
```

Exit evidence:

- exact blast radius
- affected controls
- authorization
- contract compatibility evidence
- approval enforcement

### Slice D: Exercise governance intelligence

```text
Cross-domain question → evidence plan
→ truth/RAG/graph/history
→ grounded explanation
→ recommendation
→ governed action
```

Exit evidence:

- permission-safe retrieval
- citation validity
- evidence bundle
- confidence
- tool trace
- action policy enforcement

### Slice E: Prove learning

```text
Prior case → measured outcome → evaluation → memory
→ later similar case → validated reuse
```

Exit evidence:

- prior case addressable
- promoted memory traceable
- later run actually retrieves it
- recommendation change attributable to prior outcome

### Slice F: Operate under stress

```text
Concurrent profiles/incidents/agents
→ capacity pressure
→ retries/failures
→ dependency degradation
→ recovery
```

Exit evidence:

- workload SLOs
- isolation
- capacity enforcement
- deterministic retries
- failure injection
- no evidence corruption or cross-scope leakage

## 23. Three-path acceptance for every critical journey

Each critical journey must have:

### Normal path

Authorized workflow succeeds with correct state/evidence.

### Unauthorized/adversarial path

Boundary attacks fail closed, including permission bypass, prompt injection, retrieval leakage, fake citations, and excessive agent authority.

### Failure/degraded path

Dependency failure, partial source availability, worker retry, provider failure, stale leases, and similar degraded behavior preserve evidence integrity and terminate/recover deterministically.

This requirement is critical. Happy-path E2E alone does not establish trust.

## 24. Suggested execution order

The remaining program should preserve vertical slicing while increasing domain coverage in this order:

1. Reference estate and governance corpus.
2. CDEs, ownership/stewardship, classification, policy/control applicability.
3. Operational DQ rules, exceptions, anomaly/drift, freshness, remediation, verification.
4. Field lineage, contracts, certifications, technical/business impact.
5. Shared investigation engine and cross-domain evidence planning.
6. Domain-specialized acceptance scenarios for all eight agents.
7. Governed actions, human approvals, and risk-tiered autonomy.
8. Outcome learning and case reuse.
9. Continuous agent/control evaluation.
10. Proactive governance and predictive risk only after sufficient evidence/history exists.
11. Scale-specific external infrastructure only when measurements justify it.

This order is intentionally not a series of isolated module completions. Each step must be integrated into the active vertical acceptance estate.

## 25. Final acceptance standard

The existing 25-step AI Governance Intelligence scenario remains a strong program-level definition of complete, but it must be strengthened with trust requirements.

For each critical step the platform must prove:

```text
correct
+ authorized
+ isolated
+ evidence-linked
+ auditable
+ observable
+ failure-safe
+ policy-valid
```

The complete product scenario is:

```text
real source
→ source registration
→ dataset/version
→ profile
→ semantic/sensitive classification
→ glossary
→ CDE
→ ownership/stewardship
→ DQ rules
→ violations/anomalies/freshness
→ policy/control obligations
→ contracts/certification
→ field/dataset lineage
→ business impact/risk
→ cross-domain investigation
→ recommendation
→ approval where required
→ governed action
→ re-profile/re-evaluate
→ verified outcome
→ audit
→ evaluation
→ memory/learning
→ later case reuse
→ executive outcome update
```

Only after this scenario works reliably against a realistic estate, including normal, adversarial, and degraded paths, should the complete platform be described as a trusted operational data-governance platform.

## 26. What not to prioritize prematurely

Do not allow infrastructure expansion to replace product capability completion.

Do not prioritize OpenSearch, ClickHouse, additional distributed infrastructure, opaque predictive ML, or broad autonomous actions unless current product scenarios and measured scale require them.

PostgreSQL/Supabase, pgvector, GraphProvider, the existing governed AI path, and durable orchestration remain the default platform baseline until evidence demonstrates a real need for additional complexity.

## 27. Operating principle

The implementation principle going forward is:

> Functional, operational, and trusted are not separate maturity labels. They are dimensions of the same governance capability.

A capability is done only when the governance team can use it in a real workflow, the system can prove why it reached its result, unauthorized behavior fails closed, degraded behavior preserves truth, decisions/actions follow policy, and the measured outcome is visible and auditable.
