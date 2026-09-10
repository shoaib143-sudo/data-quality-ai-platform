# ADR: Role-Based Governance Landing Pages

Date: 2026-09-09
Status: Accepted, amended 2026-09-10 to the implemented thirteen-persona model and extended by `ADR-2026-09-09-role-landing-availability-and-workspace-authorization.md`

## Decision

DataNexus provides role-specific landing pages for the implemented thirteen-persona governance model:

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Product Owner
5. Data Steward
6. Data Governance Specialist
7. Compliance & Risk Officer
8. Privacy & Security Officer
9. Data Governance Admin
10. Data Custodian / Technical Steward
11. Source System / Application Owner
12. Metadata Analyst
13. Data Quality Analyst

The 2026-09-10 amendment makes Metadata Analyst and Data Quality Analyst first-class governance personas and gives Data Custodian / Technical Steward a dedicated landing experience. Earlier six-persona and eleven-persona design checkpoints remain useful historical context but are superseded where they conflict with this list.

## Rationale

The DataNexus technical workspaces remain necessary for governance operations, but they are not appropriate as a universal entry experience. The business UI consumes underlying governance outputs and translates them into role-appropriate outcomes rather than exposing profiling or platform internals directly.

The role-aware experience is powered by governance intelligence derived from profiling, findings, quality scores, policies, controls, ownership, criticality, lineage, risk, impact and remediation evidence.

## Landing Page Intent

| Role | Landing page intent |
|---|---|
| Senior Leadership | Enterprise trust, material risk, business impact, accountability, change and outcomes |
| Business User | Find, understand, trust and safely use governed data |
| Data Owner | Accountability, tolerance, critical data, risk, certification, decisions and remediation |
| Data Product Owner | Data product trust, certification, service reliability, lineage, consumers and product issues |
| Data Steward | Operational stewardship, issue investigation, metadata, classifications, quality and remediation coordination |
| Data Governance Specialist | Governance framework effectiveness, policy, controls, adoption, maturity and governance KPIs |
| Compliance & Risk Officer | Regulatory exposure, policy/control breaches, risk, exceptions and audit readiness |
| Privacy & Security Officer | Sensitive data, privacy classification, handling controls, access risk and impact visibility |
| Data Governance Admin | Governance platform health, workflows, connections, integrations, role configuration and technical governance operations without implicit organization-admin authority |
| Data Custodian / Technical Steward | Technical controls, source health, profiling, observability, schema changes and technical remediation |
| Source System / Application Owner | Upstream source reliability, downstream impact and recurring source defects |
| Metadata Analyst | Dataset-level metadata completeness, ownership, glossary, classification, lineage, schema change and metadata-gap analysis |
| Data Quality Analyst | Dataset-level quality dimensions, trends, findings, anomalies, root cause, control outcomes and comparative quality analysis |

## UX Principles

- Show business outcomes before technical evidence.
- Use progressive disclosure.
- Preserve end-to-end traceability from leadership summary to source evidence.
- Keep governance calculations and thresholds in the governance layer, not the frontend.
- Use role-specific navigation derived from the role matrix.
- Keep navigation visibility separate from route authorization.
- Treat Critical Data Elements, fitness for use, certification, tolerance, ownership, policy compliance and business impact as first-class concepts.
- Use dark-mode minimalism with selective soft Neumorphism for the role landing experience.
- Avoid duplicated information and decorative dashboard clutter.
- The DataNexus AI Agent remains prominent and supplies four to five persona-specific conversation starters.
- Recently Viewed is collapsible and should be scoped to the current governance context.
- Metadata Analyst and Data Quality Analyst receive richer dataset-level filters and charts than executive/business personas.

## Interaction Contract

The role-based UI follows a strict interaction rule:

**Visual affordance implies functional affordance.**

Any button, icon, card, KPI, row, chart affordance, dropdown, tab, filter, breadcrumb or other object that looks interactive must perform a real task such as navigation, drill-down, filtering, expand/collapse, opening a detail/action surface, executing an authorized action, or seeding an AI conversation. If there is no meaningful task, the element must not be styled as interactive.

Additional requirements:

- Prefer whole-card semantic click targets over tiny chevron-only interactions.
- Preserve useful context during drill-down, including organization, project, business domain, dataset, source, quality dimension, time range, finding and issue where applicable.
- Provide hover, focus, pressed, loading and disabled states where relevant.
- Do not advertise destinations or actions that the current persona cannot use.
- Route guards remain mandatory even when navigation is hidden.
- Empty states should remain useful and actionable where evidence/history exists.

## Analyst Interaction Requirements

Metadata Analyst should support contextual filtering such as Dataset, Domain, Source and Time Range, with summaries and drill-downs for metadata completeness, ownership coverage, glossary mapping, classification coverage, lineage coverage and schema changes where evidence exists.

Data Quality Analyst should support Dataset, Domain, Source, Quality Dimension and Time Range filtering, with summaries and drill-downs for overall quality, completeness, validity, accuracy, uniqueness, freshness where persisted, issue trends, anomalies, root cause and dataset/domain comparisons.

Filters should synchronize related widgets when they represent one analytical context rather than behave as disconnected chart controls.

## Governance Truth Boundary

The frontend must not manufacture governance semantics. Business impact, severity, certification, trust, readiness, risk, ownership, classification, lineage and control outcomes must come from persisted profiling/governance evidence or approved governance-layer aggregation.

Technical findings must not be translated into invented business consequences in frontend code.

AI recommendation remains separate from governance authority. The AI Agent may explain, summarize, recommend and surface evidence, but it cannot silently certify data, approve governance decisions, accept risk, approve exceptions or otherwise mutate authoritative governance state.

## Target Traceability

Executive Summary -> Business Insight -> Governance Finding -> Quality Metric -> Column / Dataset -> Source Data

A canonical governed dataset drill-down should support the broader object chain:

Dataset -> Trust -> Quality Dimensions -> Certification -> Criticality -> Business Domain -> Glossary -> Classification -> Ownership -> CDEs -> Issues -> Profiling Evidence -> AI Explanation

## Access Control

Landing-page availability and workspace authorization are separate controls. Organization administrators can enable or disable persona landing pages, while operational routes enforce server-side persona authorization independently. See `Architecture/ADR-2026-09-09-role-landing-availability-and-workspace-authorization.md`.

Organization privilege and governance persona are separate dimensions. Data Governance Admin does not imply organization ADMIN. A MEMBER may legitimately hold the Data Governance Admin persona, while `/admin` remains restricted to organization OWNER/ADMIN.

Nested workspace permissions may be stronger than parent read access. Examples include lineage management, observability management, Data Quality rule/exception management, contract management/approval, workflow step decisions and platform control actions.

## Known Multi-Organization Gap

As of the 2026-09-10 checkpoint, `lib/governance/landing-access.ts` still resolves `/home` from the earliest organization membership. This is not sufficient for a user who belongs to multiple organizations with different personas.

The next substantial role-experience correctness change should introduce an explicit server-validated active-organization context and propagate it to persona resolution, project scope, landing evidence, search, Recently Viewed, AI context and workspace authorization. Changing the resolver from "first" to "latest" membership is not an acceptable substitute.

## 2026-09-10 Operational Findings

The role landing implementation exposed two production-quality lessons that are architectural rather than merely cosmetic:

1. The shared landing evidence loader failed for all personas when `governance.control_evaluations` lacked `service_role` SELECT even though its RLS policy existed. The correct fix was the narrow object-level grant `20260910062422_grant_service_role_control_evaluations_read`; RLS was not disabled or broadened.
2. A Data Quality retry must be resumable and evidence-preserving. Completed run steps are reused, failed steps resume in place, and governed history is not deleted to make a retry pass.

A subsequent Data Quality correctness fix introduced `NO_ACTIVE_CONTROLS`. Zero active controls must not be reported as a 100% pass rate or `CONTROLLED`; future executions use `pass_rate = null` and `NO_ACTIVE_CONTROLS` when no approved/enabled controls are evaluated.

The Render-hosted Generic JDBC bridge is correctly configured but can cold-start in roughly one minute on the Free plan. Readiness and execution behavior must distinguish a sleeping/warming dependency from a configuration failure.

## Related Records

- `Major discussion/2026-09-09-role-based-business-ui-and-governance-personas.md`
- `Major discussion/2026-09-09-role-landing-access-control-and-admin-toggles.md`
- `Major discussion/2026-09-10-role-experience-implementation-and-operational-checkpoint.md`
- `Architecture/2026-09-10-role-experience-implementation-and-operational-checkpoint.md`
