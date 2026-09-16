# Data Governance Test Plan

## Scope

Certify dataset/version management, metadata, schema discovery, profiling, data-quality metrics, findings, quality scores, classification, sensitive-data handling, CDEs, glossary/semantics, policies, controls, ownership/stewardship, lineage, remediation, approvals/delegation, evidence, monitoring, reporting, and governance insights.

## Required scenario families

For each applicable capability test happy path, malformed/empty input, boundaries, authorization, cross-project isolation, persistence/reload, legal and illegal state transitions, idempotency, concurrency, retries, recovery, temporal expiry, audit evidence, and UI/API/DB reconciliation.

## Governance truth tests

Known synthetic datasets must have deterministic expected outcomes for row counts, nulls, duplicates, distinctness, schema, sensitive classifications, findings, scores, lineage relationships, policy applicability, and remediation effects.

## Critical journeys

1. Source to dataset to version to schema to profile to metrics to findings to score.
2. Sensitive data to classification to policy/control to finding to steward action.
3. CDE to quality failure to remediation to approval to execution to reprofile.
4. Schema change to lineage impact to governance review.
5. Authority assignment/delegation to decision to exact execution to immutable evidence.

Every escaped governance defect becomes a permanent regression case.
