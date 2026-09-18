# Persona Execution Certification Tracker

**Updated:** 2026-09-18  
**Purpose:** Persistent test-completion ledger for persona-by-persona execution-mode certification.

Status vocabulary: `PENDING`, `IN_PROGRESS`, `PASS`, `FAIL`, `BLOCKED`.

| Persona | Contract/unit | Functional | Negative/failure | Independent adversarial | UI/UX | Accessibility | RBAC/auth | Execution modes | Concurrency/idempotency | E2E lifecycle | Final certification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Data Steward | PASS | IN_PROGRESS | PASS | PASS | PASS | PENDING | PASS | IN_PROGRESS | IN_PROGRESS | IN_PROGRESS | IN_PROGRESS |
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

## Data Steward evidence checkpoint — 2026-09-18

- Deterministic disposable Data Steward fixture now covers organization membership, authorized + unauthorized projects, dataset/version, completed profile, quality rule, finding, glossary term, suggested classification, issue, stewardship assignment, independent approver, allowed capabilities, and prohibited capabilities.
- Data Steward execution-mode tests now exercise OFF, GUIDED, GOVERNED_AUTO, FULL_AUTONOMOUS, destructive-action approval gating, disallowed tools, and emergency-stop precedence against that fixture.
- Disposable PostgreSQL E2E fixture now materializes MEMBER tenancy, one active DATA_STEWARD binding, authorized and negative-scope projects, dataset/version, completed profile, enabled quality rule, draft glossary term, suggested classification, open issue, active stewardship assignment, and all four canonical autonomy policy modes inside a rollback-only CI transaction.
- Concurrency/idempotency coverage now checks quality-run idempotency namespacing/reuse, finding-to-issue deduplication including concurrent inserts, stewardship unique-conflict handling, canonical classification review RPC usage, and invalid/replayed glossary lifecycle transitions.

- Contract/unit, negative-boundary, independent adversarial, and UI/UX certification scripts passed in GitHub Actions on PR #692.
- Production read-only authorization verification confirmed the retained Data Steward test principal is an organization MEMBER with exactly one active DATA_STEWARD project binding.
- Positive project capabilities verified: catalog.read, catalog.update, glossary.manage, quality.execute, issues.manage, classification.review, stewardship.manage, profiling.execute, agent.execute, execution.retry, execution.cancel.
- Explicit negative capabilities verified: admin.manage, source.manage, schedule.manage, policy.approve, quality.exception.approve, execution.approve, agent.admin.
- Cross-project negative verification confirmed stewardship.manage and agent.execute are false outside the single bound UI Regression Test Project; schedule.manage is false everywhere.
- The retained Data Steward principal still has no literal password-login evidence (last_sign_in_at is null), so deployed authenticated functional/E2E and manual accessibility evidence remain pending.
- Repository-governance workflow-count failure was repaired by folding Data Steward certification into the existing Persona Workspace Policy workflow rather than adding another permanent workflow.
- Production fixture adequacy check found the bound UI Regression Test Project has zero datasets, stewardship assignments, quality rules, glossary terms, classifications, and issues; it is suitable for authorization regression but not realistic Data Steward functional E2E.
- Direct Data API privilege review found glossary_terms and glossary_mappings were the only Data Steward canonical-task tables retaining authenticated INSERT/UPDATE/DELETE grants. This is tracked and remediated separately in PR #697; other checked stewardship, issue, classification, and quality tables are SELECT-only for authenticated.
- Live-route adversarial check confirmed navigating directly to /home/data-steward under a different authenticated persona resolves back to that authenticated persona rather than accepting the URL slug as authority.
- Production execution-mode fixture check found no governance.orchestrator_autonomy_policies row for the Data Steward-bound UI Regression Test Project; the only current orchestrator policy is GUIDED on Product, where the Data Steward test principal has no project authority. Production GUIDED/GOVERNED_AUTO/FULL_AUTONOMOUS persona E2E therefore remains intentionally unclaimed without a fixture/configuration change.

Final certification requires authenticated deployed-persona evidence in addition to automated CI coverage.
