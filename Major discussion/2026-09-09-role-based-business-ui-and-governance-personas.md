# DataNexus Role-Based Business UI and Governance Persona Discussion

Date: 2026-09-09
Status: Finalised for UX and governance architecture baseline

## Context

The current DataNexus UI is too technical for senior leadership, business users, and governance stakeholders. The agreed direction is to retain the underlying profiling, data quality, findings, scoring, governance, and technical capabilities, while presenting business-facing outcomes through role-specific landing pages.

The business UI should be the consumption layer of the underlying Data Governance outputs, not a disconnected reporting layer and not a manual summary layer.

## Core Principle

DataNexus should translate technical governance evidence into business-facing answers such as:

- Can I trust this data?
- Can I use this data for this business purpose?
- Where is the biggest risk?
- What changed?
- What business processes, reports, or decisions are affected?
- Who is accountable?
- What action is required?
- Are things improving?

The underlying traceability must remain intact from executive summary down to evidence.

Executive Summary -> Business Insight -> Governance Finding -> Quality Metric -> Column / Dataset -> Source Data

## Business-Facing Governance Intelligence

The target flow is:

Source Data -> Profiling / Validation -> Metrics -> Findings -> Quality Scores -> Governance Rules / Controls -> Governance Insights -> Business Risk / Impact / Ownership / Actions -> Role-Based Landing Pages

The frontend should not implement governance logic such as thresholds or severity rules. Those should be generated in the governance layer and exposed as structured outputs.

## Important Governance Concepts to Preserve

The following concepts should be first-class in DataNexus:

1. Data Confidence
2. Critical Data Confidence
3. Fitness for Use / Decision Readiness
4. Business Criticality and Critical Data Elements
5. Risk Tolerance and Appetite
6. Certification / Trusted Status
7. Reports, KPIs, Decisions, and Processes at Risk
8. Governance Ownership and Stewardship
9. Policy and Control Compliance
10. Risk Acceptance and Exceptions
11. Recurring and Reopened Issues
12. Root Cause
13. Downstream Consumers and Dependencies
14. Governance Effectiveness and Maturity
15. AI Readiness as a future extensibility area

## Final DataNexus Role Matrix

| Role | Primary purpose | Accountable / responsible for | Key decisions | Landing page should answer |
|---|---|---|---|---|
| Senior Leadership | Enterprise oversight of data trust and governance | Enterprise risk, strategic data outcomes, material governance exposure | Where must leadership intervene? Is material data risk acceptable? | Can we trust critical data? Where are we exposed? What changed? Are we improving? |
| Business User | Find, understand and safely consume governed data | Appropriate use of data and reporting known issues | Is this the right data? Can I use it? Is it trusted? | Can I find, understand and confidently use the data I need? |
| Data Owner | Business accountability for a data domain or critical data assets | Quality expectations, criticality, access decisions, controls, risk, certification and remediation accountability | Approve standards, tolerance, certification, exceptions, priorities and risk acceptance | Is the data I own under control, and what requires my decision? |
| Data Steward | Operational governance and stewardship | Definitions, metadata, quality monitoring, classifications, issue investigation and remediation coordination | Validate issues, maintain metadata, recommend rules, coordinate remediation | What requires my attention and action today? |
| Data Governance Admin | Operate and configure DataNexus | Platform configuration, users, roles, workflows, source integrations and system health | Configure and administer the governance environment | Is DataNexus correctly configured, secure and operating normally? |
| Data Governance Specialist | Operate and improve the governance programme | Policies, standards, governance framework, controls, CDE programme, adoption, maturity and governance KPIs | Where should governance intervention occur? Are policies and operating models working? | Is governance effective across the organisation and where are the gaps? |

## Supporting Technical Role

A Data Custodian / Technical Steward should be recognised in the governance operating model but does not require a dedicated business landing page initially.

Typical responsibilities:

- Technical implementation of controls
- Pipelines and storage
- Security enforcement
- Technical remediation
- Source availability
- Integration health
- Technical lineage
- Execution of technical data quality fixes

Operating relationship:

Data Owner -> accountable

Data Steward -> governs and coordinates

Data Custodian / Technical Steward -> technically implements

Engineering / Source System -> executes platform or source changes

## Role Boundaries

### Senior Leadership vs Data Owner

Senior Leadership sees enterprise exposure, material risk, governance outcomes, and accountability. Data Owners are accountable for specific domains or data assets.

### Data Owner vs Data Steward

The Data Owner decides and is accountable. The Data Steward manages, investigates, curates, and coordinates governance activity day to day.

### Data Governance Specialist vs Data Governance Admin

The Data Governance Specialist governs the governance programme, operating model, policies, controls, adoption, and maturity. The Data Governance Admin governs the DataNexus platform, configuration, permissions, workflows, integrations, and technical operations.

## Decision Rights Matrix

A = Accountable, R = Responsible, C = Consulted, I = Informed, V = View / consume

| Governance activity | Leadership | Business User | Data Owner | Data Steward | DG Admin | DG Specialist |
|---|---|---|---|---|---|---|
| View enterprise governance health | A | V | V | V | V | R |
| Define data criticality | I | I | A | R | I | C |
| Define quality tolerance | I | I | A | R | I | C |
| Monitor quality | I | V | A | R | I | C |
| Investigate issue | I | I | A | R | I | C |
| Prioritise remediation | C | I | A | R | I | C |
| Execute remediation | I | I | A | R | I | C |
| Accept business data risk | C/A for material risk | I | A | C | I | C |
| Certify data | I | V | A | R | I | C |
| Approve business definitions | I | C | A | R | I | C |
| Maintain glossary / metadata | I | V | A | R | I | C |
| Define governance policy | C | I | C | C | I | A/R |
| Monitor governance maturity | A | I | C | C | I | R |
| Configure DataNexus | I | I | I | I | A/R | C |
| Configure roles / permissions | I | I | C | I | A/R | C |
| Report data problem | I | R | R | R | I | I |

## Landing Page Purpose by Persona

### Senior Leadership

Primary questions:

- Are we exposed?
- Can we trust critical data?
- What changed?
- Who is accountable?
- Are risks reducing?
- Can critical reports and decisions be trusted?

Primary landing page content:

- Enterprise Data Confidence
- Critical Data Confidence
- Decision Readiness
- Material Risks
- Significant Changes since last review
- Business Impact
- Reports / KPIs / Decisions at Risk
- Regulatory exposure
- Overdue high-priority actions
- Executive accountability
- Governance maturity and outcomes
- Executive narrative generated from governance evidence

### Business User

Primary questions:

- Can I find the right data?
- Can I understand it?
- Can I safely use it?
- Is it certified or trusted?
- Is there a known issue?

Primary landing page content:

- Search / discover governed data
- Trusted / certified status
- Fitness for use
- Business definitions and glossary
- Known issues
- Business impact
- Usage guidance
- Ability to report a data problem

### Data Owner

Primary questions:

- Is the data I own healthy?
- What is outside tolerance?
- What requires my decision?
- What critical data is affected?
- Who is resolving it?

Primary landing page content:

- Domain / asset confidence
- Critical Data Elements
- Tolerance breaches
- Open material issues and risks
- Issue ageing and recurring issues
- Certification decisions
- Policy and control compliance
- Ownership and stewardship coverage
- Reports, processes, and consumers affected
- Approvals, exceptions, and risk acceptance
- Remediation progress

### Data Steward

Primary questions:

- What needs my attention today?
- What requires investigation?
- What metadata is incomplete?
- Which rules or controls failed?
- What remediation needs coordination?

Primary landing page content:

- Assigned governance work
- New and high-priority issues
- Issue ageing
- Recurring issues
- Root cause analysis
- Affected records
- Data quality rules and controls
- Metadata completeness
- Classification completeness
- Glossary and definitions
- Lineage and dependencies
- Remediation coordination

### Data Governance Admin

Primary questions:

- Is DataNexus operating correctly?
- Are sources connected?
- Are workflows functioning?
- Are permissions correct?
- Are jobs or integrations failing?

Primary landing page content:

- Platform health
- Source and connection health
- Profiling / job health
- Workflow health
- Integration health
- Users and permissions
- Role assignments
- Configuration completeness
- Failed jobs / operational alerts
- Audit and administration activity

### Data Governance Specialist

Primary questions:

- Is governance working across the organisation?
- Where are the governance gaps?
- Are owners and stewards fulfilling responsibilities?
- Are policies and controls effective?
- Which domains need intervention?

Primary landing page content:

- Enterprise governance health
- Governance KPI trends
- Governance maturity
- Critical Data coverage
- Ownership and stewardship coverage
- Policy compliance
- Control effectiveness
- Domain-level governance gaps
- Adoption metrics
- Exceptions and accepted risks
- Overdue governance actions
- Recurring issues
- Regulatory exposure

## UI / UX Direction

The business-facing experience should use minimalism and soft neumorphism, with a premium enterprise style, restrained visual hierarchy, simple language, and progressive disclosure.

The business-facing application should not expose technical concepts such as profile run IDs, metric definitions, schema internals, or execution engines unless the user drills down into technical evidence.

The core UX principle is:

Show the answer first. Show the mechanics only when requested.

Target consumption behaviour:

- 5 seconds: understand overall health
- 30 seconds: understand what changed and where the risk is
- 2 minutes: understand impact, ownership, and action
- Drill down only when needed: governance and technical evidence

## Leadership UX Narrative

The leadership experience should answer in this sequence:

How healthy is our data? -> Where are we exposed? -> Why does it matter? -> Who owns it? -> What are we doing about it? -> Are things improving?

## Benchmarking Direction

The role model and UX should be benchmarked across established products and practices rather than copied from one vendor. Collibra, Informatica, and Alation are explicit reference points when terminology, role boundaries, stewardship responsibilities, governance workflows, trust, certification, critical data, policy, and issue-management patterns need validation.

## Decision

The six requested DataNexus personas are final for landing-page design:

1. Senior Leadership
2. Business User
3. Data Owner
4. Data Steward
5. Data Governance Admin
6. Data Governance Specialist

Data Custodian / Technical Steward is retained as a supporting operating-model role without a dedicated business landing page for the first release.

The next UX step is to convert the P1 information for each persona into the top half of its landing page, place P2 information below it, and expose P3 information only through drill-down.
