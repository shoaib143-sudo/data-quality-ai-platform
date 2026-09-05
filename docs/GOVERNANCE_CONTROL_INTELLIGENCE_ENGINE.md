# Governance Control Intelligence Engine

## Objective

Convert governance knowledge requirements into machine-evaluable controls while preserving human approval boundaries and evidence provenance.

## Lifecycle

1. Governance knowledge is ingested as requirements.
2. An authorized catalog actor may propose a control linked to one or more requirements.
3. Proposed controls remain `PROPOSED/PENDING` and cannot be evaluated as active policy.
4. A `policy.approve` reviewer may activate a control only when at least one linked requirement belongs to governance knowledge that is eligible to act as authority.
5. Evidence is recorded through governed server/database boundaries.
6. Active automated or hybrid controls are evaluated to `PASS`, `WARN`, `FAIL`, or `UNKNOWN`.
7. Evaluation evidence and immutable audit records remain coupled to the decision path.

## Initial assertion contract

The first production slice supports the deterministic `EVIDENCE_COUNT` assertion:

```json
{
  "assertion": {
    "kind": "EVIDENCE_COUNT",
    "evidenceTypes": ["GLOSSARY", "LINEAGE", "ATTESTATION"],
    "minimum": 1,
    "failureResult": "FAIL"
  }
}
```

This deliberately starts with a narrow deterministic contract. Later evidence collectors may populate evidence from CDEs, glossary metadata, quality-rule runs, lineage, contracts, classification, stewardship, and audit history without changing the lifecycle boundary.

## Human boundary

AI and automation may propose controls and collect evidence. They may not turn a pending enterprise document into authority and may not approve a control. Approval remains a `policy.approve` human decision enforced in PostgreSQL.

## Core tables

- `governance.control_definitions`
- `governance.requirement_control_links`
- `governance.control_scope_bindings`
- `governance.control_evidence`
- `governance.control_evaluations`
- `governance.governance_findings`

## Initial RPC boundaries

- `governance.propose_governance_control(...)`
- `governance.review_governance_control(...)`
- `governance.record_governance_control_evidence(...)`
- `governance.evaluate_governance_control(...)`

Direct browser DML on the control-intelligence tables is not part of the application contract.
