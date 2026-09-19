# Frozen Governance Baseline and Optimized Implementation Plan

**Date:** 2026-09-19  
**Status:** FROZEN  
**Change control:** No further requirement changes, additions, enhancements, optimizations, architectural extensions, or scope modifications unless explicitly reopened or approved by the product owner.

## 1. Decision

The DataNexus requirement baseline is frozen. Implementation now focuses on completion, integration, testing, defect remediation, production hardening, revalidation, independent adversarial audit, and exact-head production certification.

The governance document assessment identified 35 enhancement candidates. Those candidates remain **PENDING APPROVAL** and are not executable requirements. The assessment is retained as frozen context only. No additional requirements may be introduced during delivery without explicit approval.

## 2. Target lifecycle

Dataset → Dataset Version → Profile Run → Schema Discovery → Profile Columns → Metric Execution → Metric Results → Findings Generation → Quality Score → Governance Insights → Validation.

The governed extension connects:

Policy / Standard → Requirement → Control → DQ Rule → Dataset / CDE → Profile Evidence → Finding → Score → Governance Issue → Remediation → Validation → Audit Evidence.

## 3. Execution principles

1. Preserve the existing architecture. Do not rebuild from scratch.
2. Run independent workstreams in parallel where contracts are stable.
3. Converge through explicit integration gates.
4. Keep findings as machine evidence and governance issues as workflow objects.
5. Keep deterministic numerical scoring independent from hidden AI judgement.
6. Reuse schema discovery for technical metadata rather than duplicating discovery.
7. Preserve provenance and identifiers through the complete evidence chain.
8. No new enhancement or requirement enters implementation without explicit approval.

## 4. Parallel implementation workstreams

| ID | Workstream | Scope | Parallelism | Dependency | Completion gate |
| --- | --- | --- | --- | --- | --- |
| W0 | Baseline and architecture guard | Exact main SHA, PR inventory, migrations, requirement-to-code/test mapping, fixtures, CI baseline | First | None | Reproducible baseline |
| W1 | Source onboarding | Dataset, version, CSV, DB/JDBC, source validation, schema availability, profiling-ready | Yes | W0 | CSV and DB profiling-ready |
| W2 | Profiling engine | Schema discovery, columns, metric planning/execution/persistence, retries | Yes | W0 and W1 contract | Deterministic profile run |
| W3 | Rules and governance context | DQ rules, CDEs, domains, ownership, thresholds, applicability | Yes | W0 | Rules bind to governed assets |
| W4 | Metadata governance | Dictionary, glossary, technical/business metadata, provenance | Yes | W0 and W1 | Governed metadata linked |
| W5 | Findings and scoring | Findings engine, deterministic scoring, governance insights | Yes after contracts | W2 and W3 | Evidence → finding → score |
| W6 | Issues and remediation | Issue lifecycle, assignment, remediation, revalidation, closure | Yes after contracts | W5 | Closed governance loop |
| W7 | Evidence and traceability | Requirement/rule/evidence relationships and audit trail | Yes | W2 and W3 contracts | End-to-end traceability |
| W8 | UI and visualization | Source onboarding, dataset/schema, metrics, findings, scores, governance, issues, traceability | Yes | Stable APIs | Complete user journeys |
| W9 | Integration | Cross-stream reconciliation and integrated release candidate | Convergence | W1-W8 | Integrated RC |
| W10 | Certification | Revalidation, adversarial audit, failure testing, production certification | Final | W9 | Exact-head certification |

## 5. Integration gates

| Gate | Required certification |
| --- | --- |
| G0 | Repository and environment baseline reproducible |
| G1 | Dataset reaches profiling-ready |
| G2 | Metrics execute and persist |
| G3 | Persisted metrics generate deterministic findings |
| G4 | Findings generate deterministic scores |
| G5 | Governance context linked correctly |
| G6 | Issue and remediation loop functional |
| G7 | Complete evidence chain intact |
| G8 | UI and API integration passes |
| G9 | Full end-to-end lifecycle passes |
| G10 | Production exact-head certification |

A workstream may continue independently while another gate is being resolved unless it directly depends on that gate.

## 6. Findings and scoring requirements

The findings engine must deterministically handle threshold breach, missing metric, unexpected metric, no-finding, multiple findings, duplicate metric, partial execution, and insufficient evidence.

Scoring must be deterministic, explainable, reproducible, and version-aware. Identical persisted metric and rule inputs must produce identical scores.

## 7. Closed governance loop

Finding → Governance Issue → Owner / Steward → Remediation → Revalidation → Closure.

A finding is evidence. An issue is a managed governance workflow object. Closure requires validation evidence.

## 8. Evidence chain

Source Document → Document Version → Requirement → DQ Rule → Dataset / CDE → Profile Run → Metric → Finding → Issue → Remediation → Validation.

Every material relationship must retain identifiers and provenance sufficient for audit and explanation.

## 9. UI integration

Required user journeys include source registration, dataset inspection, schema/column exploration, profile execution, column metrics, findings, quality scores, governance insights, issue/remediation workflow, evidence traceability, metadata dictionary/glossary, and drilldown from dataset to column to metric to finding.

## 10. Post-implementation validation

Certification is a separate phase and does not rely solely on prior CI success.

### 10.1 Unit testing

Critical deterministic domain logic receives direct branch-focused coverage, including dataset registration/versioning, source validation, schema discovery, metric planning/execution/persistence, rule boundaries, findings, scoring, CDE applicability, metadata provenance, issue state transitions, remediation, validation, and evidence integrity.

Target: 100% branch coverage where practical for critical deterministic domain logic. Repository-wide line coverage is not a substitute for meaningful behavioral coverage.

### 10.2 Integration testing

Exercise real boundaries:

Source → Dataset → Version → Profile → Metrics → Rules → Findings → Score → Issue → Remediation → Validation.

Database tests must exercise real constraints, transactions, and RLS rather than mocks alone.

### 10.3 End-to-end certification

Two independent golden paths are mandatory.

**CSV:** Upload → Dataset → Version → Schema → Profile → Metrics → Rules → Findings → Score → Governance Insight → Issue → Remediation → Re-profile → Validate → Close.

**Database:** The same lifecycle against a disposable database table.

## 11. Negative testing

Mandatory cases include:

| Area | Cases |
| --- | --- |
| CSV | Empty, header-only, malformed, duplicate columns, invalid encoding, oversized field |
| Schema | Unsupported datatype, null-only column, schema change during run |
| Database | Unavailable, wrong credentials, missing table |
| Execution | Duplicate profile request, duplicate metric, partial metric failure, retry |
| Rules | Missing threshold, missing target column, exact boundary conditions |
| Findings/scoring | Zero findings, missing metric, scoring failure |
| Workflow | Missing owner, invalid transition, closure without validation |
| Security | Unauthorized mutation/access |
| Readiness | Stale dataset version and missing governed dataset/version |

## 12. Failure injection

Inject controlled failures at database connection, metric execution, metric persistence, finding generation, score persistence, issue creation, remediation, validation, network boundaries, authentication, and transaction commit.

Every failure must demonstrate: no corrupt partial state, no duplicate effects, no orphan evidence, retry safety, observable failure state, and recoverability.

## 13. Boundary and pathological data

Exercise 0 rows, 1 row, all NULL, all identical, all unique, extreme cardinality, wide tables, long strings, Unicode, mixed dates, NaN/Infinity where applicable, extreme numerics, nested JSON, duplicate logical records, high null rates, and exact threshold boundaries.

For a 98% threshold, the frozen semantics must be explicitly tested immediately below, exactly at, and immediately above the boundary.

## 14. Clean-room revalidation

After implementation completion:

Fresh checkout → Fresh dependencies → Fresh disposable database → Apply all migrations → Seed controlled fixtures → Static checks → Unit tests → Integration tests → Negative tests → Failure tests → CSV E2E → Database E2E → Production build.

Capture the exact Git SHA after success. Any subsequent commit invalidates exact-head certification and triggers the appropriate revalidation subset.

## 15. Independent adversarial audit

The independent audit starts from the frozen requirements and attempts to disprove compliance.

Audit dimensions: requirements traceability, schema integrity, RLS, APIs, malformed profiling input, duplicate metrics, rule applicability, findings/evidence consistency, deterministic scoring, workflow transition controls, remediation closure controls, audit immutability, retry/recovery behavior, UI/backend consistency, concurrency, and authorization.

The auditor must specifically attempt to create false PASS, false CLOSED, false SCORE, and false SUCCESS states.

## 16. Regression discipline

Every discovered defect follows:

Failure reproduction → Regression test → Fix → Original test → Adjacent tests → Relevant E2E.

A defect is not closed merely because its immediate symptom disappears.

## 17. Production certification criteria

| Dimension | Required result |
| --- | --- |
| Frozen requirements | 100% traced |
| P0 defects | 0 open |
| P1 defects | 0 open |
| Critical test suite | 100% pass |
| Unit tests | Pass |
| Integration tests | Pass |
| Negative tests | Pass |
| Failure injection | Pass |
| CSV E2E | Pass |
| Database E2E | Pass |
| RLS/security | Pass |
| Migration replay | Pass |
| Rollback/recovery | Pass |
| Independent adversarial audit | Pass or explicit approved exception |
| Production build | Pass |
| Exact HEAD | Certified |
| Evidence | Persisted |

No arbitrary percentage threshold substitutes for frozen requirement compliance. A frozen critical requirement is either PASS or covered by an explicit approved exception.

## 18. Definition of 100% complete

100% complete means every frozen requirement is implemented, traceable to code and tests, integrated, tested against positive, negative, boundary, and failure cases, independently revalidated, subjected to adversarial review, successfully exercised end to end against CSV and database sources, and certified against an exact repository HEAD with no unresolved P0/P1 defect.

## 19. Change-control lock

This document records the frozen baseline. Requirement discovery is closed. Implementation findings may result in defect fixes, tests, integration corrections, and production hardening within the frozen scope. Any new capability, enhancement, optimization, architecture extension, or material scope change requires explicit product-owner approval before implementation.
