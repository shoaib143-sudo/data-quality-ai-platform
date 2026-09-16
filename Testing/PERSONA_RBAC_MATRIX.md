# Persona and RBAC Matrix

## Baseline personas

| Persona | Primary responsibility |
| --- | --- |
| Platform Administrator | Platform/project administration |
| Business/Data Owner | Business accountability and approval |
| Governance/Data Steward | Governance decisions and stewardship |
| Data Engineer | Source onboarding and technical operations |
| Analyst | Profiling/results consumption |
| Governance Specialist | Policies, controls, classification |
| Read-only User | Non-mutating access |
| Unauthorized User | Negative authorization cases |
| Agent Executor | Governed machine execution |

## Required checks

For each critical feature record who can view, create, modify, approve, execute, delegate, delete, and administer. Test both allowed and denied operations, cross-project resource identifiers, expired/revoked authority, and separation-of-duties combinations.

No role matrix entry is considered covered without executable evidence.
