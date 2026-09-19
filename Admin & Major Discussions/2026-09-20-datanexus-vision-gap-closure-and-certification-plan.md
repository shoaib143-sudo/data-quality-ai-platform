# DataNexus Vision Gap Closure, Implementation, Certification and Post-Implementation Assurance Plan

**Date:** 2026-09-20  
**Repository:** `shoaib143-sudo/data-quality-ai-platform`  
**Purpose:** Quantify current completion against the intended DataNexus vision, define a 100% closure plan for implementation plus certification, and define post-implementation revalidation, adversarial audit, unit, negative and failure-case assurance.

## 1. Executive assessment

DataNexus has not fundamentally abandoned its original direction. The larger issue is uneven maturity.

The platform now contains substantial capability across source onboarding, profiling, data quality, governed execution, agent policy, runtime orchestration, evidence, recovery, Job Monitor, and production governance. However, the complete user-facing product journey is less mature than the backend control plane.

The dominant gap is therefore not missing architecture. It is incomplete conversion of strong backend capability into one coherent, certified, user-operable product experience.

### Current high-level completion

| Dimension | Estimated completion | Current assessment |
|---|---:|---|
| Original product vision represented in architecture | 90% | Strong alignment |
| Functional implementation of original vision | 78% | Strong but uneven |
| End-to-end production certification | 65% | Material closure work remains |
| User experience and product operability | 62% | Largest visible gap |
| Useful capability expansion beyond original vision | 25% additional scope | Mostly beneficial evolution |
| Harmful architectural drift | 10 to 15% | Primarily prioritization and fragmentation risk |

These percentages are evidence-weighted planning estimates, not substitutes for runtime certification.

## 2. Completion by capability

| Priority | Capability area | Current completion | Remaining gap | Target |
|---:|---|---:|---:|---:|
| P0 | User Experience and Product UX | 62% | 38% | 100% |
| P0 | Handsfree E2E Governance experience | 60% | 40% | 100% |
| P0 | Profiling lifecycle completion | 80% | 20% | 100% |
| P0 | Visualization and drilldown | 62% | 38% | 100% |
| P0 | Product and domain integration | 72% | 28% | 100% |
| P1 | Governance Intelligence UX | 68% | 32% | 100% |
| P1 | Observability and Job Monitoring | 72% | 28% | 100% |
| P1 | Source onboarding UX | 78% | 22% | 100% |
| P1 | Data Quality management UX | 72% | 28% | 100% |
| P1 | Agent explainability and Agent 360 | 68% | 32% | 100% |
| P1 | Administration UX | 62% | 38% | 100% |
| P1 | End-to-end journey certification | 68% | 32% | 100% |
| P1 | Metadata and Dataset 360 | 72% | 28% | 100% |
| P2 | Governance score explainability | 65% | 35% | 100% |
| P2 | Remediation lifecycle | 62% | 38% | 100% |
| P2 | Self-learning capability | 40% | 60% | 100% |
| P2 | Documentation and product coherence | 70% | 30% | 100% |
| P2 | Performance and scale certification | 50% | 50% | 100% |
| P2 | Security and production hardening | 80% | 20% | 100% |

## 3. Gap pattern

The current deficiency profile falls into five primary categories.

| Gap class | Severity | Description |
|---|---:|---|
| Experience gap | Very High | Capability exists but is not fully discoverable, operable or explainable through the UI |
| Integration gap | High | Strong components exist but do not always form one seamless business flow |
| Completion gap | High | Multiple capabilities remain in the 70 to 90% range rather than reaching fully certified completion |
| Validation gap | High | Implementation maturity is ahead of production-proven behavior |
| Scope dilution | Medium | Infrastructure and runtime expansion sometimes competes with closure of core DataNexus journeys |

## 4. Product definition of complete

A DataNexus capability is not complete when only schema, API, engine or unit tests exist.

A capability is complete only when the following chain is satisfied:

```text
Authoritative data model
→ Engine or service
→ API or server action
→ User experience
→ Explainability and evidence
→ Governed action
→ Validation
→ Audit
→ Monitoring
→ Documentation
→ Production certification
```

## 5. Canonical DataNexus golden paths

The implementation program must prioritize complete journeys over additional disconnected capability.

### Golden Path 1: CSV governance lifecycle

```text
CSV Upload
→ Dataset Registration
→ Dataset Version
→ Schema Discovery
→ Profile Run
→ Metrics
→ Findings
→ Quality Score
→ Governance Insight
→ Recommendation
→ User or governed action
→ Validation
→ Evidence
```

### Golden Path 2: Database governance lifecycle

```text
Database Source
→ Connection Validation
→ Dataset Registration
→ Schema Availability
→ Profile Run
→ Metrics
→ Findings
→ Quality Score
→ Governance Insight
→ Recommendation
→ Validation
```

### Golden Path 3: Closed-loop remediation

```text
Finding
→ Business impact
→ Recommendation
→ Risk classification
→ Approval if required
→ Agent or governed action
→ Remediation
→ Verification
→ Before/after evidence
→ Closure
```

### Golden Path 4: Autonomous governed execution

```text
Governance trigger
→ Agent selection
→ Authorization
→ Tool selection
→ Execution
→ Monitoring
→ Failure handling
→ Recovery
→ Validation
→ Evidence
→ Outcome
```

### Golden Path 5: Learning loop

```text
Recommendation
→ Human decision
→ Governed action
→ Outcome
→ Measured effectiveness
→ Learning record
→ Future retrieval
→ Improved future recommendation
```

## 6. Optimum 100% implementation plan

The optimum program uses six parallel closure workstreams with explicit dependencies and hard exit gates.

### Stream A: Product Experience and UX

**Objective:** Make existing DataNexus capability fully visible and operable.

#### High-level steps

1. Establish canonical information architecture.
2. Build DataNexus Home and control tower.
3. Complete Dataset 360.
4. Complete Profiling Explorer.
5. Complete Findings and Governance Intelligence views.
6. Complete Agent 360.
7. Complete administration UX.
8. Standardize all states, actions and evidence presentation.

#### Low-level implementation

- unified side navigation
- global project context
- canonical breadcrumbs
- universal search
- dataset overview page
- schema tab
- version history tab
- profiling tab
- data quality tab
- findings tab
- governance tab
- lineage tab
- agent actions tab
- evidence tab
- column metrics explorer
- distribution visualization
- null, unique, duplicate and outlier views
- score decomposition
- finding detail drawer
- recommendation and rationale display
- remediation action controls
- approval state display
- execution progress display
- consistent empty, loading, partial and failure states
- accessible keyboard navigation
- responsive desktop layouts
- usability analytics and task completion telemetry

#### Exit gate

A normal authorized user can complete Golden Paths 1 to 3 without SQL, raw logs, repository knowledge or hidden operator actions.

---

### Stream B: Profiling, Quality and Governance Core Completion

**Objective:** Certify the original DataNexus product spine.

#### High-level steps

1. Stabilize metric execution and result persistence.
2. Resolve unavailable and partial metric semantics.
3. Complete findings generation.
4. Complete quality scoring.
5. Complete governance insight generation.
6. Complete rerun, retry and idempotency.
7. Connect evidence to UX.

#### Low-level implementation

- verify `profile_runs`
- verify `profile_columns`
- verify `profile_metrics`
- verify uniqueness and idempotency contracts
- validate metric type persistence
- explicit unavailable metric representation
- deterministic finding rules
- severity mapping
- confidence and evidence generation
- quality score weighting
- quality score decomposition
- profile comparison
- anomaly and drift evaluation
- failed and partial run semantics
- stale run cleanup policy
- transactional run-state transitions
- replay-safe generation
- API contract tests
- UI integration tests

#### Exit gate

Both CSV and database Golden Paths complete successfully from source onboarding through persisted governance outputs and user-visible evidence.

---

### Stream C: Handsfree Governance and Remediation

**Objective:** Convert DataNexus from detection into governed closed-loop action.

#### High-level steps

1. Introduce canonical Governance Run.
2. Connect findings to recommendations.
3. Connect recommendation to risk and authority.
4. Route approvals where required.
5. Execute approved or safe autonomous actions.
6. Verify outcomes.
7. Close or reopen based on evidence.

#### Low-level implementation

- governance run model
- run stage state machine
- correlation IDs across profiling, findings and agent runs
- policy evaluation
- action risk tiering
- approval binding
- immutable execution fingerprint
- retry and cancellation semantics
- idempotent side effects
- post-action verification
- before/after evidence
- rollback metadata
- unresolved-state escalation
- remediation ownership
- SLA tracking
- closure reason
- learning outcome emission

#### Exit gate

A finding can travel from detection through governed remediation and validation with complete provenance and no manual database intervention.

---

### Stream D: Observability and Neural Job Monitor

**Objective:** Make autonomous execution understandable in real time.

#### High-level steps

1. Unify execution event contracts.
2. Display domain topology.
3. Display milestone progression.
4. Add real-time state updates.
5. Add evidence and failure drilldown.
6. Add recovery and retry visualization.
7. Add historical replay.

#### Low-level implementation

- canonical execution event schema
- job, run, agent and tool correlation
- stage timestamps
- percent progress
- milestone graph
- dependency edges
- active-node animation
- blocked-state representation
- retry count
- recovery status
- approval-wait state
- evidence drawer
- logs and structured event summary
- cost and token display
- failure cause
- recovery cause
- completed run replay
- SLA indicators
- alert hooks

#### Exit gate

An authorized user can understand current state, current actor, completed work, pending work, blockers, recovery and final evidence from the Job Monitor alone.

---

### Stream E: Governance Knowledge, Agents and Learning

**Objective:** Activate the AI Governance Intelligence roadmap with real evidence.

#### High-level steps

1. Activate governance corpus.
2. Activate CDEs.
3. Activate ownership and stewardship.
4. Activate policies, contracts and certifications.
5. Complete all eight specialized agents.
6. Exercise four memory classes.
7. Complete governed learning.

#### Low-level implementation

- seed non-trivial glossary corpus
- governed policy documents
- document chunking and embeddings
- policy to dataset relationships
- CDE registry
- CDE to column mapping
- owner and steward assignment
- contract examples
- certification examples
- DQ rule examples
- exception and waiver examples
- agent-specific tool allowlists
- agent-specific acceptance scenarios
- evidence contracts
- working memory
- episodic memory
- semantic memory
- relational memory
- recommendation feedback
- before and after effectiveness measurement
- learning authority checks
- versioned learning artifacts
- rollback of promoted learning

#### Exit gate

Every enabled agent has a successful domain-specific E2E scenario, and at least one later run demonstrably uses a prior governed outcome.

---

### Stream F: Consolidation, Documentation and Production Readiness

**Objective:** Remove fragmentation and produce one canonical product and operational model.

#### High-level steps

1. Consolidate documentation.
2. Reconcile architecture with runtime.
3. Close superseded plans and dead paths.
4. Complete administration UX.
5. Complete secret hygiene and operational hardening.
6. Complete performance certification.

#### Low-level implementation

- update `PROJECT_STATE_v2.md`
- maintain canonical architecture diagram
- maintain domain ownership map
- maintain migration ownership map
- archive superseded design notes
- map every active capability to code, tests and UI
- approval administration UX
- delegation management UX
- resource ACL administration
- notification administration
- secret hygiene verification
- leaked-password protection decision
- RLS review
- least-privilege review
- audit completeness
- dependency audit
- CodeQL
- representative load test
- concurrency test
- large CSV test
- wide-table profiling test
- timeout and retry test
- cost and resource profiling

#### Exit gate

Documentation, runtime, tests and deployed behavior agree. No material capability is represented as complete without evidence.

## 7. Sequencing and dependencies

### Phase 1: Baseline and freeze

- freeze canonical domain contracts
- define golden-path fixtures
- establish test baselines
- define completion evidence matrix
- stop creating overlapping implementations for the same capability

### Phase 2: Core closure

Run in parallel:

- Stream A UX
- Stream B profiling and quality core
- Stream D observability
- Stream F documentation and consolidation

### Phase 3: Closed-loop governance

Run in parallel:

- Stream C Handsfree remediation
- Stream E governance knowledge and agents
- Stream A remaining UX integration

### Phase 4: Integrated certification

- Golden Path 1 certification
- Golden Path 2 certification
- Golden Path 3 certification
- Golden Path 4 certification
- Golden Path 5 certification

### Phase 5: Production rollout

```text
Exact head
→ CI green
→ Preview
→ Integration validation
→ Canary
→ Production
→ Production revalidation
→ Certification evidence freeze
```

## 8. Definition of 100% implementation complete

Implementation is 100% only when all of the following are true:

- required schema exists
- forward-only migrations are verified
- service and engine behavior exists
- authorization is server-enforced
- user-facing UX exists
- failure states are user-visible
- audit and evidence are persisted
- observability exists
- unit tests pass
- integration tests pass
- negative tests pass
- failure tests pass
- golden-path E2E tests pass
- documentation is current
- no known P0 or P1 implementation gaps remain

Merge is not equivalent to complete.

## 9. Certification plan

Certification is independent from implementation completion.

### Certification dimensions

| Dimension | Required evidence |
|---|---|
| Functional | Golden paths and acceptance criteria |
| Authorization | positive and negative permission cases |
| Data integrity | persisted results, idempotency, transactions |
| UX | task completion and failure-state behavior |
| Security | RLS, ACL, secret hygiene, CodeQL, dependency audit |
| Reliability | retries, cancellation, recovery, partial failures |
| Performance | load, concurrency, large-volume behavior |
| Observability | complete run and evidence trace |
| Governance | approval, delegation, audit, provenance |
| Recovery | rollback or controlled repair validation |
| Deployment | exact-head preview and production identity |

### Certification gates

1. requirement to code mapping
2. code to test mapping
3. test to evidence mapping
4. clean database reconstruction
5. exact-head CI
6. preview deployment validation
7. canary validation
8. production smoke validation
9. production E2E validation
10. evidence reconciliation

## 10. Post-implementation assurance plan

Post-implementation assurance must attempt to disprove correctness.

### 10.1 Independent revalidation

A reviewer or agent that did not implement the feature should:

- read requirements before code
- derive its own expected behavior
- inspect authorization boundaries
- inspect migrations
- inspect API and server actions
- inspect UI
- run tests independently
- create new tests where implementation tests mirror implementation assumptions
- compare runtime evidence against documentation

**Pass condition:** no unexplained difference between requirement, runtime behavior and documented state.

### 10.2 Independent adversarial audit

The audit must include:

- unauthorized project access
- cross-tenant access
- resource ACL bypass
- DENY precedence bypass
- UI-only permission bypass attempt
- direct endpoint invocation
- approval replay
- stale approval
- fingerprint mutation
- same-user dual approval
- revoked delegation
- expired delegation
- forged delegation provenance
- risk downgrade attempt
- tool allowlist bypass
- schema validation bypass
- prompt injection against agent tools
- unsafe tool output
- malformed model response
- replayed execution
- duplicate side effect
- retry amplification
- cancellation race
- concurrent execution race
- privilege escalation
- secret disclosure
- log leakage
- evidence tampering
- audit gap
- recovery without authorization
- recovery exceeding allowed risk tier
- learning promotion without authority

**Pass condition:** all attempts either fail closed or are explicitly allowed and fully audited.

### 10.3 Unit testing standard

Unit tests are required for:

- state transitions
- metric calculations
- finding rules
- score calculations
- risk calculations
- policy decisions
- approval rules
- delegation rules
- action eligibility
- idempotency keys
- retry ceilings
- timeouts
- serialization
- event generation
- evidence construction
- input validation
- output validation
- learning eligibility
- rollback decisions

Targets should emphasize critical-path branch coverage rather than only global line coverage.

Recommended gates:

- 90%+ statement coverage for critical governance modules
- 90%+ branch coverage for policy, authorization, scoring, approval and recovery logic
- 100% coverage for explicit security invariants where practical

### 10.4 Negative testing

Every positive acceptance case should have a corresponding negative case.

Examples:

- valid project versus wrong project
- valid dataset versus foreign dataset
- authorized agent versus unauthorized agent
- allowed tool versus disallowed tool
- valid schema versus malformed schema
- current approval versus expired approval
- matching fingerprint versus changed fingerprint
- active delegation versus revoked delegation
- available metric versus unavailable metric
- valid profile state transition versus illegal transition

### 10.5 Failure and fault-injection testing

Inject:

- database timeout
- deadlock
- partial transaction failure
- storage timeout
- object storage unavailable
- model provider timeout
- malformed model output
- provider fallback
- tool timeout
- tool partial failure
- network interruption
- notification provider unavailable
- worker restart
- process crash
- duplicate delivery
- out-of-order event
- delayed event
- stale lease
- lost heartbeat
- queue backlog
- rate limit
- quota exhaustion
- concurrent cancellation
- retry during recovery
- deployment restart during run

For each injected fault verify:

- bounded retry
- no duplicate side effect
- correct final state
- preserved audit trail
- recoverability
- visible operator status
- no authorization weakening

### 10.6 Database and migration validation

- clean reconstruction from migrations
- forward-only migration validation
- schema diff against expected state
- RLS policy validation
- privilege validation
- constraint validation
- index review
- migration replay in clean environment
- backfill validation
- rollback strategy documentation for material changes

### 10.7 Integration testing

Test subsystem boundaries:

- Source → Dataset
- Dataset → Profiling
- Profiling → Metrics
- Metrics → Findings
- Findings → Score
- Score → Governance
- Governance → Agent
- Agent → Tool
- Tool → Evidence
- Evidence → Verification
- Verification → Learning
- Runtime → Job Monitor
- Approval → Execution
- Delegation → Approval
- Recovery → Runtime

### 10.8 E2E acceptance

Required persona journeys should include:

- Data Owner
- Data Steward
- Governance Admin
- Analyst
- Operator
- Agent-authorized user
- Read-only user
- Unauthorized user

Each should exercise normal, denied, partial and failure outcomes.

### 10.9 Performance and scale

Minimum certification scenarios:

- small CSV
- large CSV
- narrow table
- wide table
- high-null dataset
- high-cardinality dataset
- large profile history
- concurrent profile runs
- concurrent agent runs
- burst notifications
- long-running approval wait
- long-running governed job
- repeated retries
- large evidence bundle

Measure:

- p50, p95 and p99 latency
- throughput
- queue delay
- CPU and memory
- database load
- token usage
- model calls
- storage growth
- cost per run
- failure rate
- recovery time

### 10.10 Security assurance

- CodeQL
- dependency audit
- secret scanning
- secret hygiene review
- CSP and security header review
- SSRF protection
- injection protection
- prompt injection tests
- XSS
- CSRF where applicable
- auth/session validation
- RLS verification
- least privilege
- signed token verification
- replay protection
- sensitive-data redaction

### 10.11 Chaos and recovery

Exercise:

- worker termination
- database failover simulation where supported
- provider outage
- storage outage
- queue outage
- partial dependency outage
- repeated transient error
- hard permanent error

Measure against declared RTO and RPO where applicable.

### 10.12 Production revalidation

After production deployment:

1. verify exact deployed SHA
2. verify build identity
3. run authenticated smoke tests
4. execute synthetic Golden Path 1
5. execute synthetic Golden Path 2 where safe
6. verify Job Monitor evidence
7. verify audit records
8. verify notification behavior
9. verify authorization negative case
10. verify recovery path in safe synthetic scope
11. verify no unexpected production errors
12. reconcile production evidence into project state

## 11. Independent certification principle

The implementation team should not be the sole source of certification.

At minimum, independent certification should include:

- implementation evidence review
- adversarial review
- security review
- E2E review
- migration review
- documentation reconciliation

The independent reviewer must be permitted to fail the release.

## 12. Completion scoreboard

The program reaches 100% only when all gates below are green.

| Gate | Weight | Current planning estimate | Target |
|---|---:|---:|---:|
| Product UX | 15% | 62% | 100% |
| Core profiling and DQ | 15% | 80% | 100% |
| Governance intelligence | 10% | 68% | 100% |
| Handsfree remediation | 10% | 60% | 100% |
| Agent and learning capability | 10% | 55% | 100% |
| Product integration | 10% | 72% | 100% |
| Observability | 8% | 72% | 100% |
| Security and authorization | 7% | 80% | 100% |
| Performance and reliability | 5% | 50% | 100% |
| E2E certification | 5% | 68% | 100% |
| Documentation and architecture coherence | 5% | 70% | 100% |

Weighted planning baseline is approximately **68% overall**.

This number should not be interpreted as production certification. It is a closure-planning score.

## 13. Immediate execution order

1. Freeze Golden Path acceptance criteria.
2. Complete UX information architecture.
3. Complete CSV profiling E2E.
4. Complete database profiling E2E.
5. Complete findings, score and governance drilldowns.
6. Complete Governance Run.
7. Complete remediation loop.
8. Complete Agent 360 and Job Monitor integration.
9. Complete administration UX.
10. Activate governance corpus and eight-agent acceptance.
11. Complete learning loop.
12. Run full post-implementation certification.
13. Resolve all P0 and P1 audit findings.
14. Perform exact-head production rollout.
15. Revalidate in production.
16. Update project-state documentation with final evidence.

## 14. Final decision rule

Do not add major new capability while a P0 Golden Path remains incomplete unless the new work is required to complete that path or remove a production-critical risk.

The near-term objective is to convert the existing breadth of DataNexus into a smaller number of fully integrated, fully usable, fully certified journeys.

That is the shortest path from the current strong engineering foundation to the originally intended DataNexus product experience.


## 15. Best-practice hardening review and revised controls

This section records the second-pass review performed before finalization. It strengthens the original implementation and post-implementation plan against current secure-development, application-security, AI-risk, software-supply-chain, accessibility, resilience and test-engineering practices.

### 15.1 Reference baseline

The program should map its controls to the following external references where applicable:

- NIST SP 800-218 SSDF Version 1.1 as the current final Secure Software Development Framework baseline.
- NIST SP 800-218 Rev. 1 / SSDF 1.2 draft as a forward-looking reference only until finalized.
- NIST SP 800-218A for AI-specific secure software development practices.
- NIST AI RMF 1.0 and NIST AI 600-1 Generative AI Profile for AI risk management.
- OWASP ASVS 5.0.0 for application security verification.
- OWASP API Security Top 10 for API-specific authorization, resource-consumption, SSRF, inventory and third-party API risks.
- OWASP Top 10 for LLM and Generative AI Applications 2025 for prompt injection, sensitive-information disclosure, supply-chain, poisoning and output-handling risks.
- OWASP SCVS for software-component verification.
- SLSA 1.2 for build provenance and software-supply-chain integrity.
- W3C WCAG 2.2, target AA conformance for user-facing DataNexus workflows.

These references are verification guides, not substitutes for DataNexus-specific threat modeling and risk decisions.

### 15.2 Add a requirements and threat-model gate before implementation

Every P0/P1 capability must have an implementation-ready requirement pack containing:

- business objective
- user/persona
- authoritative data owner
- trust boundaries
- assets requiring protection
- allowed and prohibited actions
- authorization rules
- data classification
- risk tier
- audit requirements
- SLOs and error budgets
- failure semantics
- rollback or recovery semantics
- migration impact
- observability requirements
- accessibility requirements
- acceptance criteria
- abuse cases
- security invariants
- AI-specific misuse cases where applicable

For material capabilities, maintain a lightweight threat model covering:

- spoofing and identity confusion
- tenant/project boundary escape
- authorization bypass
- tampering
- repudiation/audit gaps
- information disclosure
- denial of service/resource exhaustion
- privilege escalation
- prompt and tool injection
- poisoned retrieval or memory
- unsafe third-party API consumption
- excessive agent authority
- autonomous escalation chains

**Gate:** implementation may begin only when the requirement pack is sufficient to derive tests independently from the implementation.

### 15.3 Replace percentage-only completion with evidence-backed traceability

Maintain a requirements traceability matrix for every P0/P1 capability:

```text
Requirement
→ Threat / Abuse Case
→ Design / ADR
→ Code / Migration
→ Unit Test
→ Contract Test
→ Integration Test
→ Negative Test
→ Failure Test
→ E2E Test
→ Runtime Evidence
→ Documentation
```

No item reaches 100% because a percentage field was manually updated. It reaches 100% only when required evidence links exist and the certification gates pass.

### 15.4 Adopt a layered test strategy

Use a test portfolio rather than relying on unit tests plus E2E tests.

#### Required layers

1. static analysis and type checks
2. unit tests
3. property-based tests for invariants and boundary-heavy logic
4. mutation tests for critical policy/scoring/authorization modules
5. schema and contract tests
6. database/RLS tests
7. component tests
8. integration tests
9. API security tests
10. UI interaction tests
11. E2E persona tests
12. performance tests
13. chaos/fault-injection tests
14. adversarial security tests
15. AI evaluation and red-team tests
16. production smoke and synthetic tests

#### Testing principles

- tests must be derivable from requirements, not copied from implementation
- every important positive case must have one or more negative cases
- test oracles must be explicit
- deterministic fixtures should be preferred for certification
- randomized/property tests should persist failing seeds
- flaky tests must not be silently retried until green
- quarantine requires an owner, reason, expiry date and non-blocking justification
- critical security/governance tests may not be quarantined to unblock release
- regression tests are mandatory for every escaped defect
- incident fixes must add a test reproducing the original failure where practical

### 15.5 Strengthen critical-module verification beyond coverage percentages

Coverage thresholds remain useful but are not sufficient.

For authorization, policy, risk, approval, scoring, recovery, idempotency and state-machine modules:

- require branch and decision coverage
- require boundary-value cases
- require illegal-transition cases
- use mutation testing to prove tests detect meaningful logic changes
- use property-based testing for invariants
- use concurrency/race tests where state can be updated by parallel workers
- use fuzz testing on parser, schema, API and external-input boundaries where practical

Key invariants should include:

- DENY always overrides ALLOW
- project/tenant scope is never widened implicitly
- approval cannot survive a material fingerprint change
- the same actor cannot satisfy incompatible approval axes
- revoked/expired delegation never grants authority
- retries do not duplicate side effects
- cancellation cannot create a successful terminal state after unauthorized continuation
- recovery cannot exceed original or current policy authority
- audit evidence is append-only or immutably revisioned as designed
- unavailable metrics cannot silently become valid zeros
- score calculations are deterministic for identical authoritative inputs

### 15.6 Add consumer-driven contract and compatibility testing

For boundaries between DataNexus domains, establish explicit versioned contracts and compatibility tests.

Required boundaries include:

- Source → Dataset
- Dataset → Profiling
- Profiling → Metrics
- Metrics → Findings
- Findings → Score
- Score → Governance
- Governance → Runtime
- Runtime → Tool
- Runtime → Job Monitor
- Runtime → Notifications
- Approval → Execution
- Delegation → Approval
- Recovery → Runtime
- Outcome → Learning

Test:

- backward compatibility
- missing optional fields
- unknown future fields
- incompatible schema versions
- null/unavailable semantics
- idempotent replay
- duplicate delivery
- out-of-order events

### 15.7 Formalize API and resource-abuse testing

Add explicit verification for:

- object-level authorization
- property-level authorization
- function-level authorization
- authentication/session integrity
- resource and cost consumption limits
- sensitive business-flow automation abuse
- SSRF
- security misconfiguration
- API inventory/version drift
- unsafe third-party API consumption
- pagination and query abuse
- oversized payloads
- recursive/deeply nested input
- expensive filter/sort combinations
- request smuggling/header ambiguity where relevant
- rate-limit bypass
- batch endpoint privilege mixing

### 15.8 Add software-supply-chain certification

The release pipeline should produce and verify:

- dependency lockfile integrity
- SBOM
- vulnerability scan
- license/policy review where required
- artifact digest
- build provenance
- source revision identity
- builder identity
- immutable mapping from deployed artifact to Git commit
- provenance verification before production promotion

Target SLSA controls appropriate to the current GitHub/Vercel build architecture. Do not claim a SLSA level until its requirements are actually evidenced.

### 15.9 Add UI accessibility and usability certification

User Experience closure must include accessibility as a release criterion.

Target WCAG 2.2 AA for principal DataNexus workflows.

Validate at least:

- keyboard-only navigation
- logical focus order
- visible focus states
- accessible names and labels
- contrast
- zoom/reflow
- tables and data-grid semantics
- form validation and error association
- dialogs/drawers
- charts with non-visual equivalents
- status not conveyed only by color
- live progress announcements where appropriate
- reduced-motion behavior for neural/job-monitor animation
- timeout/session-extension behavior
- screen-reader navigation for primary Golden Paths

Also run task-based usability validation for Golden Paths 1 to 4 with measurable completion, error and recovery rates.

### 15.10 Add observability quality gates

A feature is not production-ready if failures cannot be diagnosed from supported telemetry.

For material flows, require:

- correlation/trace ID
- project and resource scope
- run/job ID
- agent/tool identity
- state transition events
- latency
- retries
- failure category
- authorization decision
- approval state
- recovery action
- final outcome
- privacy-safe error context
- relevant cost/token metrics
- SLO indicators

Define telemetry cardinality and sensitive-data rules to prevent observability itself becoming a security or cost risk.

### 15.11 Use SLO-based release gates

For critical user journeys, define and measure:

- availability
- success rate
- p95/p99 latency
- queue delay
- run completion time
- retry rate
- error rate
- recovery success rate
- stale-run rate
- notification delivery rate where applicable
- cost/token envelopes where applicable

Release/canary promotion should be blocked when objective SLO or error-budget thresholds are exceeded without an approved exception.

### 15.12 Strengthen AI and agent adversarial testing

In addition to conventional application-security tests, all agent-enabled flows must test:

- direct prompt injection
- indirect prompt injection from documents, metadata, webpages or tool outputs
- tool instruction hijacking
- retrieval poisoning
- memory poisoning
- cross-agent context contamination
- malicious handoff content
- fabricated citations/evidence
- unsupported confidence claims
- sensitive-data exfiltration through prompts or tools
- unsafe output handling
- hidden instructions in uploaded content
- tool parameter smuggling
- excessive agency
- unauthorized tool chaining
- recursive agent delegation
- budget exhaustion
- denial-of-wallet behavior
- model/provider fallback that weakens policy
- unsafe learned behavior promotion
- malicious feedback manipulating learning
- hallucinated authorization or approval
- attempts to treat model text as authoritative policy

**Gate:** model output must never create authority by itself. Authoritative permissions, policies, approvals and governed state remain server-controlled.

### 15.13 Formalize AI evaluation and non-regression

For every production agent/version maintain:

- versioned evaluation dataset
- expected evidence requirements
- tool-selection expectations
- authorization expectations
- refusal/deny expectations
- groundedness checks
- hallucination/error checks
- confidence calibration checks
- latency/cost measures
- regression baseline

Evaluate new agent/model/provider versions against the same baseline before promotion.

Use shadow or canary evaluation for material changes. A new version must not become default solely because it performs better on a single aggregate score. Security, authorization and critical-governance regressions are release blockers.

### 15.14 Strengthen chaos engineering discipline

Fault injection should follow controlled chaos principles:

1. define steady-state behavior
2. define a falsifiable hypothesis
3. constrain blast radius
4. run in non-production first
5. use synthetic/safe production scope only when explicitly permitted
6. observe recovery and user-visible impact
7. stop automatically when safety thresholds are exceeded
8. persist evidence
9. convert failures into regression tests

Do not use chaos testing as a substitute for deterministic failure testing.

### 15.15 Add data-quality and migration safety gates

For all material data model changes:

- migration linting
- forward compatibility check
- backward compatibility during rolling deployment
- lock-duration assessment
- query-plan review for large tables
- backfill resumability
- backfill idempotency
- partial-backfill recovery
- constraint validation strategy
- dual-read/write period where needed
- clean reconstruction
- representative-volume rehearsal
- production verification query set

Destructive cleanup should be a later explicit phase after read/write cutover and evidence confirms old paths are unused.

### 15.16 Add test-data governance

Certification data must be:

- synthetic or explicitly approved
- reproducible
- versioned
- free of unnecessary production secrets/PII
- representative of edge cases
- large enough for scale tests
- designed to include invalid, partial and adversarial examples

Golden datasets should carry expected outputs so changes in metrics, findings and scores are objectively detectable.

### 15.17 Add release-artifact and rollback verification

Before production promotion verify:

- exact source SHA
- exact dependency lock state
- exact migration set
- artifact digest
- build provenance
- environment/config version
- feature flags
- model/provider version
- policy version

Rollback/recovery tests must verify not only that the application comes back, but that:

- schema compatibility is preserved
- in-flight runs settle correctly
- duplicate side effects do not occur
- approvals remain valid only when their binding still matches
- evidence remains intact
- Job Monitor reflects the real terminal state

### 15.18 Add post-release observation period and defect feedback loop

After each material production rollout:

- watch defined SLOs and error budgets
- compare canary versus baseline
- review new error signatures
- review authorization denials/anomalies
- inspect retry/recovery patterns
- review cost/token deviations
- confirm no unexpected migration or query load
- reconcile production state with documentation

Every confirmed production defect must feed back into:

```text
Defect
→ root cause
→ missing/failed control
→ regression test
→ control improvement
→ documentation update
```

### 15.19 Independent assurance separation

For P0 and security-sensitive P1 capabilities, independence should be explicit.

Where practical:

- implementer writes implementation and primary tests
- independent reviewer derives acceptance/adversarial tests from requirements
- security reviewer examines trust boundaries and abuse cases
- certification runner executes the final suite against exact head
- production revalidation uses the deployed artifact identity, not a locally rebuilt approximation

No reviewer should approve merely because the implementation team reports its own test suite as green.

## 16. Revised 100% completion gates

The following are now non-negotiable for a capability to be called 100% complete where applicable:

| Gate | Requirement |
|---|---|
| Requirement completeness | Acceptance criteria, failure semantics and invariants documented |
| Threat model | Trust boundaries and abuse cases reviewed |
| Data model | Schema and migrations validated |
| Authorization | Server-side positive and negative cases pass |
| Core implementation | Service/engine behavior complete |
| Contracts | Boundary compatibility tests pass |
| UX | Complete normal, empty, loading, denied, partial and failed states |
| Accessibility | Principal flows meet WCAG 2.2 AA target |
| Observability | Supported telemetry can explain state and failure |
| Unit/property tests | Critical logic proven at boundaries and invariants |
| Mutation/fuzz tests | Applied to critical or parser/input-heavy modules as appropriate |
| Integration | All dependent domain boundaries pass |
| Negative/failure | Denied and injected-failure cases pass |
| Security | ASVS/API/AI-relevant controls verified |
| Supply chain | SBOM, dependency/security checks and provenance controls pass |
| Performance | SLO/load envelopes pass |
| E2E | Relevant Golden Paths pass |
| Adversarial | Independent adversarial suite passes |
| Exact-head CI | Protected required checks pass on exact commit |
| Deployment | Preview/canary/production artifact identity verified |
| Production revalidation | Synthetic/safe production checks pass |
| Documentation | Project state and evidence map reconciled |

## 17. Revised post-implementation certification sequence

The recommended final sequence is:

```text
Implementation freeze for release candidate
→ Requirements traceability reconciliation
→ Threat-model review
→ Static/type/security analysis
→ Unit + property + mutation/fuzz verification
→ Contract + DB/RLS testing
→ Integration testing
→ Negative and failure-case testing
→ API security testing
→ AI/agent adversarial evaluation
→ E2E persona and Golden Path acceptance
→ Accessibility/usability validation
→ Performance/load/SLO certification
→ Controlled chaos/recovery exercises
→ Supply-chain/SBOM/provenance verification
→ Independent adversarial audit
→ Clean database reconstruction
→ Exact-head protected CI
→ Preview validation
→ Canary deployment
→ Canary SLO/error-budget evaluation
→ Production promotion
→ Production synthetic revalidation
→ Post-release observation
→ Final evidence/documentation reconciliation
→ Certification sign-off
```

## 18. Best-practice conclusion

The implementation plan is optimal only if it prioritizes closure of the canonical user journeys and prevents infrastructure or agent-runtime expansion from outrunning product usability.

The post-implementation plan is optimal only if certification can fail independently of implementation, tests can falsify the design rather than mirror it, exact deployed artifacts are verified, and security, resilience, accessibility, supply-chain integrity and AI-specific adversarial behavior are treated as first-class release gates.

This hardened plan supersedes any weaker interpretation of the earlier completion criteria in this document.


## 19. Scope decision: operational certification and hardening deferred

By product decision, operational certification and production hardening are not active implementation objectives at this stage because DataNexus is not being operationalized imminently.

The following are therefore **deferred, not deleted**:

- production certification
- production hardening
- canary rollout
- production revalidation
- chaos certification
- release sign-off
- production SLO/error-budget gates
- operational supply-chain certification
- production rollback rehearsal
- operational post-release observation

Development-level quality remains in scope:

- unit testing
- property and invariant testing where useful
- contract testing
- integration testing
- negative testing
- failure-case testing
- E2E functional testing
- UI/UX component functionality testing
- agent acceptance tests
- safe adversarial development tests

The active definition of done is therefore **functional implementation completeness with development-level validation**, not operational certification.

## 20. DataNexus agent learning taxonomy

DataNexus should distinguish learning mechanisms instead of treating every adaptation as "self-learning."

### 20.1 Level A: Runtime working learning

Short-lived learning within one run.

Examples:

- observations gathered during the run
- tool results
- intermediate hypotheses
- rejected hypotheses
- current task constraints
- active plan and checkpoints

This context expires with the run except for evidence that is deliberately promoted into a durable case.

### 20.2 Level B: Episodic case learning

The agent stores an approved prior case containing:

- problem/context
- authoritative inputs
- relevant project/domain characteristics
- tools used
- decisive evidence
- actions/trajectory
- outcome
- verification result
- human decision
- reusable lessons
- conditions under which the case is applicable
- conditions under which it is not applicable

A later similar case may retrieve and adapt this experience.

### 20.3 Level C: Positive and negative experience learning

The learning store should include both:

- successful patterns worth reusing
- failed/rejected patterns worth avoiding

Negative cases are first-class because they prevent repeated mistakes, false positives and ineffective strategies.

### 20.4 Level D: Feedback learning

Capture explicit human signals such as:

- accepted recommendation
- rejected recommendation
- modified recommendation
- false positive
- false negative
- useful explanation
- poor explanation
- correct evidence
- missing evidence
- correct escalation
- unnecessary escalation
- preferred action
- rejection reason

Feedback should be tied to the exact agent/version/use case and evidence context.

### 20.5 Level E: Outcome and effectiveness learning

Do not equate "execution completed" with "execution was good."

Where the domain supports it, capture:

- before state
- action/recommendation
- after state
- verification result
- stakeholder satisfaction
- recurrence/non-recurrence
- measurable improvement
- side effects
- reversals
- time/cost saved
- whether the original confidence was calibrated

### 20.6 Level F: Strategy learning

Agents may learn reusable problem-solving patterns, for example:

- which evidence sources are most useful
- which tool sequence is effective
- which profiling strategy fits a dataset class
- which traversal strategy works for governance investigation
- which explanations are most useful to stakeholders
- which findings tend to be noise
- which escalation paths are appropriate

Strategy learning must remain versioned and explainable.

### 20.7 Level G: Retrieval and relevance learning

Agents may improve how they retrieve prior cases and evidence by learning:

- which attributes make two cases truly similar
- which past cases are misleading despite superficial similarity
- which evidence should carry more weight
- which domain-specific relationships matter
- when a prior case should not be reused

### 20.8 Level H: Cross-agent transferable learning

A case learned by one agent may become useful to another agent only when the shared knowledge has an explicit reusable contract.

Example:

```text
Profiling Agent detects recurring distribution shift
→ approved case records evidence pattern
→ Data Quality Agent retrieves it as a candidate drift signal
→ Governance Analyst uses the same verified case as supporting evidence
```

Cross-agent learning must not transfer authority, hidden state or unrestricted prompts.

### 20.9 Level I: Proactive human-validated case acquisition

This is the additional learning mode approved for DataNexus.

It is **not autonomous self-learning**.

Recommended name:

**Proactive Governed Case Learning (PGCL)**

Alternative descriptive name:

**Admin-Validated Positive Case Learning**

#### Trigger

After a successful **Supervised** or **Handsfree E2E** run, each participating agent evaluates whether its own portion of the run produced a potentially reusable use case.

The agent does not automatically learn it.

Instead:

```text
Successful Supervised / Handsfree E2E run
→ participating agent identifies candidate reusable lesson
→ agent creates Candidate Learning Case
→ agent explains:
   • what happened
   • why it believes the case succeeded
   • what evidence proves success
   • what part is reusable
   • applicability boundaries
   • risks of reuse
→ Data Governance Admin receives learning proposal
→ Admin chooses:
   APPROVE POSITIVE CASE
   APPROVE WITH EDITS
   REJECT
   DEFER
   MARK AS ONE-OFF / NON-REUSABLE
→ only approved case enters reusable experience memory
→ future similar runs may retrieve the approved case
```

#### Important rule

A technically successful execution is not automatically a positive learning example.

The system must separate:

- execution success
- governance correctness
- outcome quality
- reusability

A case is promoted only after the Data Governance Admin confirms that it is an appropriate positive precedent.

#### Candidate case record

Each proposal should capture:

- run ID
- contributing agent
- agent version
- use-case type
- problem signature
- dataset/asset characteristics
- evidence used
- tools/actions used
- execution trajectory summary
- result
- verification evidence
- stakeholder/approval context
- reason proposed as positive
- reusable lesson
- applicability conditions
- exclusion conditions
- confidence
- Data Governance Admin decision
- Admin edits
- decision reason
- promoted case version
- later usage count
- later success/failure feedback

#### Avoid notification fatigue

Do not ask the Admin after every trivially successful step.

Candidate generation should apply a significance filter such as:

- new use-case pattern
- materially different context
- high-value successful resolution
- first success after previous failures
- novel but verified tool sequence
- reusable governance decision pattern
- material efficiency improvement
- repeated pattern reaching promotion threshold
- existing case whose applicability can be broadened

Duplicate or near-duplicate candidate cases should be clustered before asking for confirmation.

### 20.10 Level J: Pattern consolidation learning

After enough approved cases accumulate, the system may propose a generalized pattern:

```text
Approved Case A
+ Approved Case B
+ Approved Case C
→ common pattern detected
→ generalized reusable guidance proposed
→ Data Governance Admin reviews
→ approved guidance becomes a versioned skill/pattern
```

The source cases remain linked so the generalized pattern has provenance.

### 20.11 Level K: Governed adaptive learning

Agents may propose improvements to:

- prompts/instructions
- tool-selection guidance
- retrieval strategies
- heuristics
- case-indexing rules
- recommendation templates
- investigation plans

These changes must be versioned and must not silently alter:

- authorization
- RLS
- agent/tool authority
- approval rules
- prohibited actions
- governance policy
- stakeholder authority

### 20.12 Autonomous self-modification remains out of scope

Agents must not directly rewrite or promote their own production behavior, authority, tool permissions, policies or approval requirements.

## 21. Priority-agent learning catalogue

### 21.1 Profiling Agent

The Profiling Agent should be able to learn:

- dataset archetypes
- schema archetypes
- domain-specific column patterns
- semantic-type patterns
- candidate-key patterns
- composite-key patterns
- profile depth needed for different column/data types
- metric combinations useful for particular data classes
- sampling strategies
- full-scan versus sampled profiling decisions
- thresholds at which deeper profiling becomes useful
- high-cardinality handling patterns
- skew/distribution patterns
- missingness patterns
- duplicate patterns
- temporal-data patterns
- string-pattern families
- outlier patterns
- suspicious distribution shapes
- normal seasonality where verified
- recurring schema drift patterns
- recurring profile drift patterns
- expected relationships among metrics
- columns that typically require deeper profiling
- metrics that repeatedly produce low-value noise
- failed metric strategies
- timeout-prone strategies
- successful fallback strategies
- useful source-specific profiling techniques
- profile comparison patterns
- confidence calibration for semantic-type suggestions
- false-positive profiling findings
- false-negative patterns discovered later
- reusable investigation paths
- successful tool sequences
- cost/time-efficient profiling strategies
- dataset-specific baselines when approved
- cross-dataset reusable profiling templates
- conditions where prior cases should not be reused

### 21.2 Data Quality Agent

The Data Quality Agent should be able to learn:

- effective DQ-rule patterns
- domain-specific rule templates
- accepted/rejected rule recommendations
- useful completeness thresholds
- validity thresholds
- uniqueness expectations
- referential-integrity expectations
- timeliness/freshness expectations
- consistency expectations
- business-rule patterns
- distribution-drift thresholds
- anomaly patterns
- seasonal exceptions
- expected-value ranges
- schema-quality relationships
- metric-to-rule mappings
- common false positives
- common false negatives
- waiver/exception patterns
- recurrent violations
- recurring root causes
- relationship between profile changes and DQ failures
- high-signal evidence combinations
- business-impact patterns
- CDE-specific quality expectations
- policy-sensitive quality patterns
- useful severity mappings
- confidence calibration
- accepted recommendations
- rejected recommendations and reasons
- recommendation modifications
- successful non-data remediation patterns
- ineffective remediation recommendations
- verification methods that best demonstrate resolution
- recurrence after apparent closure
- escalation patterns
- ownership-routing patterns
- SLA-risk patterns
- known transient versus persistent failure signatures
- successful investigation sequences
- useful historical comparison windows
- cases where no rule should be proposed
- cases requiring stakeholder judgment rather than automated recommendation

### 21.3 Governance Analyst Agent

The Governance Analyst Agent should be able to learn:

- recurring governance questions
- evidence sources most useful for each question class
- authoritative versus supporting evidence
- useful cross-domain joins
- graph traversal patterns
- common policy-to-asset relationships
- regulation-policy-control mappings
- glossary/CDE relationships
- ownership/stewardship patterns
- certification evidence patterns
- contract-governance patterns
- sensitive-data governance patterns
- high-risk combinations of evidence
- risk-factor contributions
- historical risk patterns
- common governance gaps
- issue recurrence patterns
- business-impact relationships
- technical versus business impact distinction
- useful investigation plans
- successful hypothesis-elimination strategies
- alternate hypotheses that proved important
- stakeholder-specific explanation preferences
- executive versus steward-level explanation patterns
- evidence depth required for different decisions
- unsupported conclusion patterns
- previously rejected interpretations
- confidence calibration
- useful citation/provenance patterns
- patterns requiring escalation
- patterns requiring stakeholder approval
- patterns fully within DG Admin authority
- cases where insufficient evidence should result in abstention
- recurring governance opportunities
- effective prioritization heuristics
- outcome patterns following previous recommendations
- reusable governance precedents approved by DG Admin

### 21.4 Data Steward Agent

The Data Steward Agent should be able to learn:

- approved glossary mappings
- rejected glossary mappings
- preferred business terms
- synonyms and aliases
- domain terminology
- semantic definitions
- term-to-column mapping patterns
- classification patterns
- sensitive-data patterns
- classification false positives
- classification false negatives
- approved CDE nominations
- rejected CDE nominations
- CDE-to-column mapping patterns
- ownership patterns
- stewardship-routing patterns
- domain-owner relationships
- orphan-asset patterns
- unmapped-column patterns
- conflicting-definition patterns
- duplicate-term patterns
- policy applicability patterns
- certification evidence patterns
- contract metadata patterns
- stewardship SLA patterns
- waiver/exception patterns
- approved metadata corrections
- recurring metadata gaps
- accepted/rejected stewardship recommendations
- useful evidence for classification suggestions
- confidence calibration
- when a human steward is required
- when DG Admin authority is sufficient
- stakeholder response patterns
- reusable stewardship cases
- successful bulk-governance patterns
- data-domain-specific conventions
- conditions where a learned mapping must not be propagated

## 22. DataNexus learning governance rule

The learning hierarchy should be:

```text
Observe
→ Record
→ Evaluate
→ Propose
→ Human-validate where promotion is material
→ Promote as versioned case/pattern
→ Retrieve
→ Adapt
→ Measure outcome
→ Reinforce, revise or retire
```

DataNexus should learn from both success and failure, but **reusable positive precedent must be intentionally promoted rather than inferred solely from technical success**.
