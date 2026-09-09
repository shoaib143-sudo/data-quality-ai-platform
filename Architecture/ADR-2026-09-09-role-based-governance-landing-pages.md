# ADR: Role-Based Governance Landing Pages

Date: 2026-09-09
Status: Accepted

## Decision

DataNexus will provide role-specific landing pages for six primary personas:

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Steward
5. Data Governance Admin
6. Data Governance Specialist

A Data Custodian / Technical Steward will be recognised in the operating model but will not receive a dedicated business landing page in the first release.

## Rationale

The current DataNexus UI is too technical for non-technical governance stakeholders. The new UI must consume underlying governance outputs and translate them into role-appropriate business outcomes rather than expose profiling or platform internals directly.

The business experience will be powered by governance intelligence derived from profiling, findings, quality scores, policies, controls, ownership, criticality, lineage, risk, impact, and remediation data.

## Role Landing Page Intent

| Role | Landing page intent |
|---|---|
| Senior Leadership | Enterprise trust, material risk, business impact, accountability, change, and governance outcomes |
| Business User | Find, understand, trust, and safely use governed data |
| Data Owner | Accountability, tolerance, critical data, risk, certification, decisions, and remediation |
| Data Steward | Operational stewardship, issue investigation, metadata, classifications, quality, and remediation coordination |
| Data Governance Admin | Platform configuration, users, permissions, workflows, connections, integrations, and system health |
| Data Governance Specialist | Governance framework effectiveness, policy, controls, adoption, maturity, critical data coverage, and governance KPIs |

## UX Principles

- Show business outcomes before technical evidence.
- Use progressive disclosure.
- Preserve end-to-end traceability from leadership summary to source evidence.
- Keep governance calculations and thresholds in the governance layer, not the frontend.
- Use role-specific navigation and permissions derived from the role matrix.
- Treat Critical Data Elements, fitness for use, certification, tolerance, ownership, policy compliance, and business impact as first-class concepts.
- Benchmark role semantics and governance patterns across Collibra, Informatica, and Alation when ambiguity exists.

## Target Traceability

Executive Summary -> Business Insight -> Governance Finding -> Quality Metric -> Column / Dataset -> Source Data

## Related Record

See `Major discussion/2026-09-09-role-based-business-ui-and-governance-personas.md` for the full discussion, role matrix, decision rights, and landing-page information requirements.
