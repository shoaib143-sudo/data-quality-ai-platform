# DataNexus Feature Registry

## Purpose

This registry is the canonical inventory for certification scope. It must be reconciled against current `main` before each full certification cycle.

## Capability domains

| Domain | Representative capabilities | Primary risk |
| --- | --- | --- |
| Identity and access | Authentication, sessions, personas, authorization | Unauthorized access |
| Projects and tenancy | Projects, isolation, resource ownership | Cross-scope leakage |
| Source onboarding | CSV, database, object storage, connectivity, validation | Incorrect source binding |
| Dataset management | Registration, versions, schema | Data integrity |
| Profiling | Schema discovery, metrics, results | Incorrect measurement |
| Data quality | Rules, findings, scores | Incorrect quality conclusions |
| Governance | Classification, CDE, policies, controls, ownership | Governance failure |
| Lineage | Relationships, change impact | Incorrect provenance |
| Semantic governance | Business meaning and semantic relationships | Incorrect interpretation |
| Remediation | Recommendations, execution, reprofile | Unsafe mutation |
| Approvals | Authority, delegation, decisions, evidence | Approval bypass |
| Agents | Specialist execution, tools, routing | Excessive agency |
| AI memory/retrieval | Memory, RAG, embeddings, learning | Leakage or poisoning |
| Autonomous governance | Planning, policy, risk, approval, execution | Unsafe autonomy |
| Observability | Logs, metrics, traces, alerts | Undetected failure |
| Reporting/certification | Evidence, reports, certification state | False assurance |
| Storage | R2/object lifecycle and access | Loss/leakage |
| Platform operations | Deployment, migrations, recovery | Availability/integrity |

## Registry fields

Every discovered feature must record: feature ID, domain, feature name, requirement, criticality, UI routes, APIs, services, database/storage objects, external dependencies, personas, state machine, security controls, AI involvement, test IDs, evidence IDs, owner, and certification status.

## Criticality

- T0: read-only low-impact capability
- T1: ordinary governed computation
- T2: governance metadata mutation
- T3: AI recommendation or consequential decision support
- T4: AI or automation modifies governed state/data
- T5: autonomous destructive, privileged, or external action

T4 and T5 require the strongest E2E, authorization, adversarial, rollback, evidence, and human-control certification.

## Maintenance rule

The registry is incomplete until repository discovery has enumerated current pages, API routes, services, migrations/RPCs, agents, workers, storage integrations, and test assets. Any discovered capability without mapped certification evidence is a coverage gap.
