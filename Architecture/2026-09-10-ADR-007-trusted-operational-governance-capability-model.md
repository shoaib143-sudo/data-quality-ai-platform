# ADR-007: Trusted Operational Governance Capability Model

**Date:** 2026-09-10  
**Status:** Accepted  
**Scope:** DataNexus AI / Data Governance PowerHouse  
**Decision type:** Product architecture, governance architecture, delivery and assurance model

## 1. Context

DataNexus has completed substantial platform hardening across authorization, evidence integrity, profiling, governed AI, governed retrieval, CI verification, and durable worker isolation. These controls are necessary for a trusted platform, but they do not by themselves establish that the complete data-governance product is trustworthy.

The platform must not separate "trusted foundation" from "operational governance product" as if they were sequential destinations. A governance capability is trustworthy only when its real operational workflow, authorization, evidence, decisions, actions, observability, failure handling, and verification operate correctly together.

Therefore the target is one integrated outcome:

> Build a fully functional, operational AI Data Governance platform whose governance decisions, evidence, workflows, automation, AI reasoning, and runtime behavior are trustworthy in production.

## 2. Decision

DataNexus will use **Trusted Operational Governance Capability** as the unit of architecture, implementation, release, and assurance.

No governance capability is complete merely because its schema, API, worker, agent, or UI exists. A capability is complete only when the full vertical workflow is operational and all required trust properties are proven.

The delivery model is:

```text
Business outcome
      +
correct functionality
      +
authorization and policy enforcement
      +
evidence and provenance
      +
operational reliability
      +
security and abuse resistance
      +
human workflow
      +
auditability
      +
measured outcome
      =
TRUSTED OPERATIONAL GOVERNANCE CAPABILITY
```

## 3. P0-P5 become permanent invariants

P0-P5 are not treated as historical phases that future work may bypass. Their trust properties become permanent regression requirements for every future capability.

### P0: tenant, authorization, and governance-state boundaries

Every future workflow must preserve:

- organization/project isolation
- capability-based authorization
- governed state transitions
- rejection of unsupported direct mutation
- no known fabricated evidence path
- safe handling of configuration or ownership mismatch

### P1: profiling and evidence integrity

Every future workflow that depends on profile or metric evidence must preserve:

- source-backed observations
- deterministic lifecycle linkage
- explicit unavailable/error semantics
- versioned evidence
- no silent substitution of fabricated data

### P2: governed AI

Applicable model calls must remain behind the shared governed model path with explicit policy, context, observability, validation, cost/runtime controls, and provider governance.

### P3: governed retrieval

Retrieval must remain permission-scoped, embedding-space scoped, grounded, evidence-addressable, and citation-valid. Retrieved content is untrusted input and must not gain authority merely because it entered model context.

### P4: executable assurance

CI and release gates must continue proving runtime contracts, migrations, authorization, security boundaries, TypeScript/build integrity, and behavioral acceptance scenarios.

### P5: worker isolation and capacity

Durable workloads must preserve workload-pool isolation, concurrency/capacity enforcement, dependency semantics, lease/retry controls, and measurable runtime behavior.

A new feature that violates any permanent invariant is incomplete regardless of its functional value.

## 4. Governance truth and evidence taxonomy

DataNexus will distinguish four primary truth categories.

### 4.1 Authoritative fact

Authoritative state established by governed systems of record.

Examples:

- dataset identity and version
- approved owner/steward assignment
- authoritative classification
- approved policy/control association
- contract state
- certification state

### 4.2 Observed evidence

Directly measured, discovered, retrieved, or recorded evidence.

Examples:

- profile metrics
- DQ rule results
- lineage observations
- source metadata
- freshness observations
- document passages
- execution telemetry

### 4.3 Derived intelligence

Computed or inferred interpretations that must retain provenance and confidence.

Examples:

- anomaly score
- governance risk score
- impact estimate
- AI hypothesis
- classification suggestion
- root-cause hypothesis
- recommended action

### 4.4 Governed decision

A policy-valid decision that changes governance state or authorizes an action.

Examples:

- steward approval
- classification approval/rejection
- waiver approval
- certification decision
- remediation approval
- accepted/rejected AI recommendation

AI may generate derived intelligence. It must not silently create authoritative facts or governed decisions.

## 5. Evidence classes and provenance

The platform will preserve distinct evidence classes rather than treating every result as a generic evidence blob.

```text
Observation
   ↓
Derived Assertion
   ↓
AI Recommendation
   ↓
Human/Policy Decision
   ↓
Governed Action
   ↓
Measured Outcome
```

Every important derived intelligence or decision must be addressable back to its supporting observations and upstream objects.

Minimum provenance for significant AI/governance outputs should include, where applicable:

- organization/project scope
- dataset/object identifiers
- dataset/version/run identifiers
- evidence references
- rule/model/agent version
- retrieval source references
- actor or execution identity
- timestamp
- confidence
- approval status
- resulting action
- measured outcome

Authoritative audit/decision history is immutable. AI memory or learned summaries are not authoritative truth and may be superseded, recalibrated, expired, or invalidated.

## 6. Governance Control Catalog

DataNexus will maintain an executable Governance Control Catalog rather than relying only on feature-level governance.

Each control must define:

- control identifier
- business/control objective
- applicability criteria
- risk/criticality tier
- authoritative owner
- enforcement point
- evidence artifact(s)
- control test
- operational metric
- failure/remediation response
- review/reassessment policy

Example:

```text
Control: GOV-OWN-001
Objective: Critical or regulated data must have accountable ownership.
Applies to: CDEs, regulated datasets, Tier-1 business assets.
Enforcement: catalog/governance service + governed workflow.
Evidence: approved owner assignment revision.
Test: missing-owner negative and assignment positive paths.
Metric: percentage of applicable assets with active ownership.
Failure response: governance issue + steward queue/escalation.
```

## 7. Risk-tiered governance

Governance burden must be proportional to business and regulatory risk.

Control applicability should consider at least:

- CDE status
- criticality
- sensitivity/classification
- regulatory relevance
- business purpose
- downstream impact
- contractual importance
- certification requirement
- production usage

A temporary low-risk staging asset should not receive the same mandatory controls as a regulated CDE feeding financial or customer-impacting processes.

Risk tiers drive control requirements, review frequency, approval policy, escalation, SLO expectations, and autonomy limits.

## 8. Lifecycle controls required for realism

The operational governance model must include, as first-class capabilities where applicable:

- authoritative-source designation
- accountable owner and steward
- glossary/business meaning
- CDE designation
- classification and sensitive-data handling
- data-use purpose
- access/entitlement evidence
- policy/control applicability
- contracts and service expectations
- retention/archive/purge policy
- jurisdiction/sovereignty considerations
- lineage and downstream impact
- DQ controls and exceptions
- certification/readiness
- incident/remediation lifecycle

These are operational control domains, not documentation-only metadata.

## 9. Data Quality semantics

DQ result semantics must be explicit and non-ambiguous. At minimum, the platform must be able to distinguish:

```text
PASS
FAIL
NOT_MEASURED
UNAVAILABLE
ERROR
NOT_APPLICABLE
WAIVED
```

Zero must not mean missing. Missing must not mean pass. Execution error must not become a quality result. Waivers must retain owner, scope, reason, approval, expiry, and re-evaluation semantics.

A rule lifecycle should support:

```text
Profile evidence
→ candidate rule
→ approval policy
→ versioned rule
→ execution
→ violation evidence
→ finding/issue
→ remediation
→ re-profile/re-evaluate
→ verified outcome
```

## 10. Agent security envelope

All agents operate inside deterministic non-LLM controls.

The model must not decide its own authorization or access scope.

The agent execution envelope must establish:

- user/project/object scope
- tool allowlist
- risk level
- autonomy tier
- approval requirements
- input/output contracts
- retrieval scope
- cost/token/time budgets
- action constraints
- audit requirements

Retrieved documents, memories, external text, source metadata, and tool outputs are treated as untrusted content. Prompt injection, poisoned knowledge, excessive agency, cross-project retrieval, and fabricated citation scenarios are explicit adversarial acceptance cases.

## 11. Shared investigation architecture

Specialized agents should share a governed investigation plane rather than duplicating retrieval/orchestration logic.

```text
Question / Alert / Finding
        ↓
Intent + governed scope
        ↓
Evidence plan
        ↓
┌───────────┬──────────┬──────────┬──────────┐
│ Truth     │ Search   │ Graph    │ History  │
└───────────┴──────────┴──────────┴──────────┘
        ↓
Evidence Bundle
        ↓
Reasoning
        ↓
Hypotheses + confidence
        ↓
Recommendations
        ↓
Policy / approval / action
```

Agents differ through role, allowed tools, planning policy, evidence contract, action permissions, and evaluation criteria rather than by owning separate truth or security systems.

## 12. Operational workflow SLOs

Infrastructure SLOs remain necessary but are insufficient.

DataNexus will define user/governance workflow SLIs and SLOs for critical journeys. Candidate measures include:

- source onboarding completion
- profile queue delay and completion
- freshness-breach detection delay
- DQ evaluation completion
- investigation response latency
- approval queue age
- remediation verification time
- evidence completeness
- percentage of critical assets under mandatory controls
- agent groundedness/authorization correctness
- workflow failure and retry rate

SLOs use explicit error budgets. Failure to meet a workflow SLO should drive operational prioritization rather than being hidden behind infrastructure availability.

## 13. Vertical trusted-capability increments

Future delivery is organized around complete governance journeys rather than isolated domain modules.

### Slice A: Govern a sensitive dataset

```text
Source
→ catalog/version
→ profile
→ classification
→ glossary
→ CDE
→ owner/steward
→ policy/access/retention
→ governed decision
```

### Slice B: Resolve a quality incident

```text
Profile
→ DQ rule
→ violation/anomaly
→ impact
→ incident
→ investigation
→ remediation
→ re-profile
→ verified outcome
```

### Slice C: Govern a data change

```text
Schema/semantic change
→ field lineage
→ CDE impact
→ downstream consumers
→ contract/policy impact
→ certification impact
→ approval
```

### Slice D: Exercise governance intelligence

```text
Cross-domain question
→ evidence plan
→ truth/search/graph/history
→ grounded answer
→ recommendation
→ governed action
```

### Slice E: Prove learning

```text
Prior case
→ outcome
→ evaluation
→ memory promotion
→ similar new case
→ validated retrieval/reuse
→ improved recommendation
```

### Slice F: Operate under stress

```text
Concurrent workloads
→ capacity pressure
→ failures/retries
→ degraded dependency
→ recovery
→ evidence integrity preserved
```

## 14. Definition of complete for one capability

A capability is not complete until it has evidence for all applicable dimensions:

| Dimension | Required evidence |
|---|---|
| Functional | Real business workflow succeeds |
| Authorization | Authorized path succeeds; unauthorized path fails |
| Isolation | Cross-project/cross-scope access fails |
| Evidence | Results are source/evidence linked |
| Governance | State transitions and approvals are policy valid |
| AI | Output is governed, grounded, validated, bounded |
| Security | Abuse/adversarial cases fail safely |
| Reliability | Retry/idempotency/failure semantics are deterministic |
| Observability | Metrics, audit, traces, and failure evidence exist |
| SLO | Relevant operational SLOs are measured |
| Outcome | Intended business/governance result is verified |

## 15. Three-path acceptance rule

Every critical governance journey must be exercised through three classes of acceptance scenario.

### Normal path

The intended authorized workflow succeeds and produces correct evidence and state.

### Unauthorized/adversarial path

Attempts to bypass permissions, inject untrusted instructions, cross project boundaries, fabricate citations/evidence, or exceed agent authority fail closed.

### Failure/degraded path

Dependency failure, worker retry, partial data availability, model/provider failure, stale lease, and similar operational degradation must preserve truth/evidence integrity and recover or terminate deterministically.

## 16. Reference estate

DataNexus will maintain a realistic reference organization/data estate used as a permanent acceptance environment.

It should include connected business domains such as CRM, commerce, payments, warehouse, and analytics, with realistic datasets, relationships, governance corpus, CDEs, owners/stewards, classifications, policies, DQ rules, contracts, certifications, and lineage.

The estate must intentionally include realistic faults such as:

- schema change
- missing/duplicate critical values
- freshness breach
- referential-integrity failure
- sensitive field introduction
- classification conflict
- contract breach
- downstream impact
- remediation success and failure cases

This estate is not only demo content. It is executable product acceptance evidence.

## 17. Continuous assurance

Governance controls, agents, model versions, retrieval policies, mappings, classifications, and learned knowledge are continuously reassessed.

The operating loop is:

```text
Observe
→ Understand
→ Reason
→ Recommend
→ Govern
→ Act
→ Verify
→ Learn
→ Reassess
```

The platform should not assume that a previously correct control, model, mapping, or decision remains correct forever.

## 18. Consequences

### Positive

- functionality and trust cannot drift apart
- governance becomes measurable rather than descriptive
- AI remains bounded by deterministic controls
- evidence becomes reusable across audit, investigation, certification, and learning
- releases are judged by real governance outcomes
- operational reliability becomes part of governance correctness

### Costs

- vertical slices require broader cross-layer implementation
- acceptance fixtures/reference estate require ongoing maintenance
- evidence/provenance requirements increase schema and telemetry discipline
- failure and adversarial testing increase CI/runtime test scope

These costs are intentional because they are required to support a credible enterprise governance product.

## 19. Non-goals

This ADR does not require:

- OpenSearch or ClickHouse before measured scale requires them
- autonomous high-risk governance decisions
- equal governance controls for every asset
- treating AI memory as authoritative truth
- claiming full platform trust from infrastructure controls alone

## 20. Final architectural standard

DataNexus may be described as a trusted operational data-governance platform only when real governance teams can use it to onboard actual data, establish business meaning and accountability, continuously measure quality and risk, investigate problems, make policy-valid decisions, execute governed remediation, verify outcomes, and audit the entire process without sacrificing authorization, evidence integrity, operational correctness, or AI safety.
