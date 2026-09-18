# Persona Execution Certification Tracker

**Updated:** 2026-09-18  
**Purpose:** Persistent test-completion ledger for persona-by-persona execution-mode certification.

Status vocabulary: `PENDING`, `IN_PROGRESS`, `PASS`, `FAIL`, `BLOCKED`.

| Persona | Contract/unit | Functional | Negative/failure | Independent adversarial | UI/UX | Accessibility | RBAC/auth | Execution modes | Concurrency/idempotency | E2E lifecycle | Final certification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Data Steward | IN_PROGRESS | PENDING | IN_PROGRESS | IN_PROGRESS | IN_PROGRESS | PENDING | IN_PROGRESS | IN_PROGRESS | PENDING | PENDING | IN_PROGRESS |
| Data Quality Analyst | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Governance Analyst / Operator | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Data Engineer / Data Custodian | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Governance Lead / Manager | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Approver | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Service Account / System Agent | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Platform Admin | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Data Consumer / Business User | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Execution Recovery Agent | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

## Data Steward execution-mode authority under test

| Mode | Expected Data Steward posture |
| --- | --- |
| Manual governed work | Allowed within task capabilities |
| Assisted / GUIDED | May initiate eligible execution; approval remains with independently authorized approver |
| Automated / GOVERNED_AUTO | May initiate when project autonomy policy already permits it |
| Straight-through | Permitted outcome of an authorized run |
| Human-in-the-loop | May initiate/participate; no implicit approval authority |
| Human-on-the-loop | May observe governed execution through authorized workspaces; autonomy-policy administration remains separately gated |
| Handsfree | May initiate within `agent.execute` scope once the handsfree P0/P1 recovery contract is complete |
| Self-healing Handsfree | Pending Execution Recovery Agent P0/P1 implementation/certification |
| Autonomous goal-driven | May submit an authorized goal where active project policy permits; cannot administer policy without separate `admin.manage` |
| System-triggered autonomous | Data Steward does not configure schedules by default; `schedule.manage` is intentionally absent |

## Data Steward canonical tasks

1. Triage ownership and stewardship work — `stewardship.manage`
2. Investigate and execute applicable quality checks — `quality.execute`
3. Curate governed business terminology — `glossary.manage`
4. Review data classifications — `classification.review`
5. Investigate and coordinate governance issues — `issues.manage`

Final certification requires authenticated deployed-persona evidence in addition to automated CI coverage.
