# ADR: Role-Based Governance Landing Pages

Date: 2026-09-09
Status: Accepted, extended by `ADR-2026-09-09-role-landing-availability-and-workspace-authorization.md`

## Decision

DataNexus will provide role-specific landing pages for the final eleven-persona model:

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Steward
5. Data Governance Admin
6. Data Governance Specialist
7. Compliance & Risk Officer
8. Privacy & Security Officer
9. Data Custodian / Technical Steward
10. Data Product Owner
11. Source System / Application Owner

## Rationale

The current DataNexus technical workspaces remain necessary for governance operations, but they are not appropriate as a universal entry experience. The business UI must consume underlying governance outputs and translate them into role-appropriate outcomes rather than expose profiling or platform internals directly.

The role-aware experience is powered by governance intelligence derived from profiling, findings, quality scores, policies, controls, ownership, criticality, lineage, risk, impact and remediation evidence.

## Landing Page Intent

| Role | Landing page intent |
|---|---|
| Senior Leadership | Enterprise trust, material risk, business impact, accountability, change and outcomes |
| Business User | Find, understand, trust and safely use governed data |
| Data Owner | Accountability, tolerance, critical data, risk, certification, decisions and remediation |
| Data Steward | Operational stewardship, issue investigation, metadata, classifications, quality and remediation coordination |
| Data Governance Admin | Platform configuration, users, permissions, workflows, connections, integrations and system health |
| Data Governance Specialist | Governance framework effectiveness, policy, controls, adoption, maturity and governance KPIs |
| Compliance & Risk Officer | Regulatory exposure, policy/control breaches, risk and audit readiness |
| Privacy & Security Officer | Sensitive data, privacy classification, handling controls and access risk |
| Data Custodian / Technical Steward | Technical controls, source health, profiling, observability and technical remediation |
| Data Product Owner | Data product trust, certification, SLA, lineage, consumers and product issues |
| Source System / Application Owner | Upstream source reliability, downstream impact and recurring source defects |

## UX Principles

- Show business outcomes before technical evidence.
- Use progressive disclosure.
- Preserve end-to-end traceability from leadership summary to source evidence.
- Keep governance calculations and thresholds in the governance layer, not the frontend.
- Use role-specific navigation derived from the role matrix.
- Keep navigation visibility separate from route authorization.
- Treat Critical Data Elements, fitness for use, certification, tolerance, ownership, policy compliance and business impact as first-class concepts.
- Benchmark role semantics and governance patterns across Collibra, Informatica and Alation when ambiguity exists.
- Use Minimalism with selective Neumorphism for role landing experiences.

## Target Traceability

Executive Summary -> Business Insight -> Governance Finding -> Quality Metric -> Column / Dataset -> Source Data

## Access Control

Landing-page availability and workspace authorization are separate controls. Organization administrators can enable or disable persona landing pages, while operational routes enforce server-side persona authorization independently. See `Architecture/ADR-2026-09-09-role-landing-availability-and-workspace-authorization.md`.

## Related Records

- `Major discussion/2026-09-09-role-based-business-ui-and-governance-personas.md`
- `Major discussion/2026-09-09-role-landing-access-control-and-admin-toggles.md`
