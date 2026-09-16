# DataNexus Testing and Certification Strategy

## Purpose

DataNexus testing is a product certification program, not a collection of isolated tests. The objective is to make every known capability traceable to requirements, implementation surfaces, test evidence, and an exact deployed revision.

No practical test program can guarantee zero defects. DataNexus therefore does not use "100% tested" as a certification claim. The target is 100% traceability and 100% completion of mandatory critical gates, with zero known critical or high severity defects at certification.

## Certification principles

1. Test business journeys, not only individual components.
2. Exercise production-equivalent UI, API, database, storage, worker, and agent paths for critical journeys.
3. Reconcile UI, API, database, and audit state.
4. Treat every escaped defect as a permanent regression case.
5. Test both legal and illegal state transitions.
6. Require deterministic, fail-closed behavior when execution evidence or authorization is incomplete.
7. Bind certification to an exact Git commit and deployment.
8. Use synthetic certification projects, datasets, and personas for repeatability.
9. Automate Layers 1 through 5 wherever practical and retain structured human exploratory testing.
10. Never use an agent's assertion of success as certification evidence without independent system-state verification.

## Six testing layers

| Layer | Scope | Typical automation target |
| --- | --- | --- |
| L1 | Unit and code-level contracts | 100% of critical contracts |
| L2 | API, service, and database integration | 100% of critical interfaces |
| L3 | Cross-module business workflows | At least 95% of critical workflows |
| L4 | Negative, adversarial, boundary, concurrency, and failure cases | At least 95% of critical cases |
| L5 | Real browser end-to-end journeys | 100% of critical journeys, broad coverage elsewhere |
| L6 | Human exploratory and usability testing | Risk-based charters |

## Feature Registry and traceability

The canonical Feature Registry must be derived from the current repository and deployed application rather than maintained only from memory or documentation.

For every capability, maintain this trace:

```text
Feature
  -> Requirement
  -> Business rule
  -> UI route
  -> API
  -> Service
  -> Database/storage objects
  -> Security requirements
  -> Test cases
  -> Evidence
  -> Certification result
```

Repository discovery should inventory pages, API routes, services, database objects, agents, workers, storage integrations, policies, controls, and externally integrated capabilities.

## Business journey certification

Critical features are certified as complete journeys.

### Profiling

```text
Login
 -> Create/select project
 -> Upload or connect source
 -> Register dataset
 -> Create dataset version
 -> Discover schema
 -> Run profiling
 -> Persist metrics
 -> Generate findings
 -> Calculate quality score
 -> Display and reconcile results
 -> Generate governance insights
 -> Reprofile
```

### Database onboarding

```text
Configure connection
 -> Validate connection
 -> Discover schemas
 -> Select table
 -> Register dataset
 -> Create version
 -> Profile table
 -> Generate findings
 -> Display and reconcile results
```

### Governance

```text
Dataset
 -> Classification/CDE
 -> Policy
 -> Control
 -> Violation/finding
 -> Remediation
 -> Approval
 -> Execution
 -> Evidence
 -> Certification
```

### Autonomous governance

```text
User goal
 -> Policy evaluation
 -> Agent selection and plan
 -> Risk calculation
 -> Approval
 -> Exact execution resume
 -> Specialist execution
 -> Evidence
 -> Memory/learning
 -> Monitoring
 -> Report
```

## Mandatory test matrix

Every critical workflow must cover, where applicable:

| Dimension | Required examples |
| --- | --- |
| Happy path | Valid operation completes |
| Empty/invalid input | Empty, malformed, unsupported |
| Boundary | Min/max sizes and cardinalities |
| Authorization | Allowed and denied personas |
| State | Valid and invalid transitions |
| Concurrency | Simultaneous mutations and decisions |
| Retry | Transient failure and recovery |
| Idempotency | Duplicate submission/double click |
| Persistence | Refresh/reload after every important transition |
| Recovery | Browser, worker, network, or service interruption |
| Integration | Downstream consumer receives complete contract |
| Security | Cross-project and cross-organization denial |
| Audit | Actor, action, target, decision, timestamp, evidence |
| UI consistency | UI equals authoritative backend state |
| Negative contract | Each required downstream field removed/corrupted |
| Temporal | Expiry, stale state, policy/authority changes |
| Performance | Expected operating envelope |
| Accessibility | Critical user journeys |

## System invariants

Tests must assert system truths rather than only HTTP success.

Examples:

```text
Profile run SUCCEEDED
=> metrics exist
AND findings are generated as required
AND quality score exists
AND dataset version matches
AND UI/API/DB agree
```

```text
READY_TO_EXECUTE
=> required approvals are satisfied
AND execution payload is complete
AND fingerprint is valid
AND policy remains valid
AND executor is authorized
AND target still exists
```

A state that violates an invariant must not be exposed as executable.

## State-machine testing

For each stateful capability:

1. Enumerate all legal transitions.
2. Prove each legal transition.
3. Attempt every meaningful illegal transition and prove rejection.
4. Exercise retry, expiry, cancellation, rejection, concurrency, and recovery.
5. Reconcile persisted state and UI after each transition.

Examples include profiling runs, approval requests, remediation, agent execution, onboarding, and deployment/certification workflows.

## Property-based and generated-data testing

Generate datasets and inputs containing combinations of nulls, duplicates, Unicode, extreme numeric values, long strings, malformed and valid dates, mixed types, empty columns, special characters, schema changes, and varying row/column cardinality.

Assert invariants such as:

```text
0 <= quality_score <= 100
null_count <= row_count
distinct_count <= row_count
profiled_columns == discovered_columns
finding.dataset_version == profile.dataset_version
```

## Mutation testing

Critical governance, authorization, scoring, profiling, state-transition, and execution code should use mutation testing where practical. The purpose is to verify that tests fail when important conditions or calculations are deliberately changed.

Code coverage alone is not evidence that tests can detect incorrect behavior.

## AI and agent certification

AI capabilities require dedicated tests for:

- Prompt injection and hostile retrieved content
- Unauthorized tool invocation
- Hallucinated resource identifiers
- Invalid or malformed structured output
- Provider timeout and provider fallback
- Repeated tool calls and execution loops
- Budget exhaustion
- Context truncation
- Memory contamination
- Cross-project retrieval
- Conflicting specialist conclusions
- Human handoff
- Policy override attempts
- Retry and partial-execution behavior

Agent-reported success must be independently reconciled against authoritative database, storage, audit, and execution state.

## Security certification

Security is an independent certification stream covering authentication, authorization, RLS, IDOR, cross-project and cross-organization isolation, CSRF, XSS, injection, SSRF, file upload abuse, secrets exposure, log leakage, API abuse, rate limits, privilege escalation, approval bypass, agent/tool authorization, storage authorization, webhook authenticity, dependencies, and supply-chain controls.

Sensitive controls require explicit denial tests.

## Concurrency and race testing

Critical cases include:

- Two approvers acting simultaneously
- Two profiling runs targeting the same dataset/version
- Duplicate Execute requests
- Authority revocation during approval
- Policy change after approval
- Dataset mutation during profiling
- Concurrent remediation
- Concurrent schema-version arrival
- Retry after the client loses a successful response

Results must be deterministic or explicitly conflict-controlled.

## Fault injection and recovery

Deliberately exercise:

- Worker termination during execution
- Database timeout
- Storage/R2 outage
- Model/provider timeout
- Network loss after commit
- Partial downstream failure
- Browser/session interruption
- Queue delay and duplicate delivery

Every case must either recover safely or fail closed without silent corruption.

## Performance and scalability

Define product operating envelopes before certification. Test latency, throughput, CPU, memory, database load, storage, queue depth, timeout behavior, failure rate, and recovery under small, normal, large, spike, stress, and endurance workloads.

Limits must come from intended product requirements rather than arbitrary test values.

## Personas and authorization matrix

Maintain synthetic certification identities representing at least:

- Platform Administrator
- Business/Data Owner
- Governance/Data Steward
- Data Engineer
- Analyst
- Governance Specialist
- Read-only User
- Unauthorized User
- Agent/automation executor

Test each critical capability against the relevant role and authority combinations, including separation of duties.

## Certification data

Maintain a resettable certification project with controlled datasets such as:

- clean data
- dirty data
- null-heavy data
- duplicate-heavy data
- schema drift versions
- PII/sensitive data
- large data
- empty data
- malformed data

Equivalent database-table and object-storage scenarios should exist where relevant.

## Cross-feature combination testing

Systematically test combinations such as:

- CSV + PII + profiling
- Database + schema drift + lineage
- CDE + quality finding + remediation
- Agent + approval + policy change
- Profiling + remediation + reprofile
- Dataset deletion + existing lineage
- Version change + existing findings
- Delegated approver + high-risk action
- R2 object + profiling + governance

Use pairwise/combinatorial generation where exhaustive testing is impractical, supplemented by risk-based critical combinations.

## UI/API/DB/audit reconciliation

For every critical mutation:

```text
UI state == API state == authoritative database/storage state == audit state
```

Any disagreement fails certification even when individual components return success.

## Deployment certification

```text
PR
 -> Static validation
 -> Unit/contract tests
 -> Mutation/property tests
 -> Integration
 -> E2E
 -> Negative/adversarial/security tests
 -> Preview deployment
 -> Preview smoke
 -> Merge
 -> Production deployment
 -> Production smoke
 -> Synthetic journey
 -> DB/audit reconciliation
 -> CERTIFIED
```

Production certification must record the exact commit and deployment.

## Continuous production verification

Run safe synthetic probes for critical capabilities after deployment and on an appropriate recurring cadence. Examples include authentication, project access, dataset retrieval, profiling health, approval health, agent health, monitoring health, and storage read/write health.

A failed mandatory production probe invalidates or suspends the affected certification until investigated.

## Parallel certification streams

Execute these streams independently where safe:

1. Feature discovery and requirements traceability
2. Functional and cross-module certification
3. Security certification
4. Reliability, concurrency, recovery, and fault injection
5. AI/agent certification
6. Performance and scalability
7. Production E2E and evidence reconciliation

All streams feed a common certification evidence model.

## Certification evidence

Each certification run should record:

- Certification run ID
- Exact Git commit SHA
- Exact deployment/environment
- Test suite versions
- Test counts and results
- Feature and journey coverage
- Failed and blocked cases
- Screenshots where appropriate
- API evidence
- Database/storage assertions
- Audit records
- Execution/run/request IDs
- Fingerprints
- Timestamps
- Known defects and severity

## Definition of certified

A critical feature is certified only when all applicable mandatory gates pass:

```text
IMPLEMENTED
+ UNIT/CONTRACT VERIFIED
+ INTEGRATION VERIFIED
+ DATABASE VERIFIED
+ NEGATIVE VERIFIED
+ ADVERSARIAL VERIFIED
+ SECURITY VERIFIED
+ CONCURRENCY/RECOVERY VERIFIED
+ REAL UI E2E VERIFIED
+ UI/API/DB/AUDIT RECONCILED
+ REGRESSION AUTOMATED
+ EXACT-DEPLOYMENT PRODUCTION SMOKE PASSED
= CERTIFIED
```

## Reporting standard

Do not report "100% tested." Report measurable coverage and gate status, for example:

| Measure | Certification target |
| --- | --- |
| Known-feature inventory | 100% accounted for |
| Requirement traceability | 100% for certification scope |
| Mandatory critical gates | 100% pass |
| Critical browser E2E journeys | 100% pass |
| Critical RBAC/security matrix | 100% pass |
| Critical negative/invariant cases | 100% pass |
| UI/API/DB/audit reconciliation | 100% pass |
| Known critical defects | 0 |
| Known high-severity defects | 0 |
| Exact-main certification | PASS |
| Production smoke | PASS |

## Immediate implementation sequence

1. Derive the Feature Registry from current `main`.
2. Map each feature to UI/API/service/database/storage/agent surfaces.
3. Map existing automated tests to the registry.
4. Identify uncovered requirements, journeys, boundaries, and integration edges.
5. Build the certification matrix and evidence schema.
6. Automate critical journeys first.
7. Add negative, adversarial, property, mutation, concurrency, recovery, security, and performance suites.
8. Establish preview and production certification gates.
9. Add recurring synthetic production verification.
10. Convert every newly discovered production defect into a permanent regression test.

The current Autonomous Governance E2E journey remains an active certification case and should be completed under this standard.
