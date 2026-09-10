# Role Experience Implementation and Operational Checkpoint

Date: 2026-09-10
Status: Current implementation checkpoint

## Purpose

This record captures the implemented role-based experience, authorization and interaction contracts, production incidents uncovered during verification, and the next correctness priorities. Read it with the role-based landing ADR and the landing availability/workspace authorization ADR.

## Implemented persona model

DataNexus currently supports thirteen governance personas:

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

Metadata Analyst and Data Quality Analyst were added as first-class personas after the earlier six- and eleven-persona checkpoints.

## Authorization model

Organization privilege and governance persona are separate dimensions.

Organization privilege remains OWNER, ADMIN, MEMBER. Governance persona controls role landing/workspace behavior. Organization OWNER/ADMIN controls organization administration access.

Data Governance Admin does not imply organization ADMIN. A MEMBER may legitimately hold the Data Governance Admin persona while remaining ineligible for `/admin`.

Landing availability and workspace authorization are separate. Hiding navigation is never sufficient authorization. Nested routes may require stronger capabilities than their parent workspace.

## Role landing implementation

Primary files:

- `components/governance/role-landing-page.tsx`
- `app/home/[persona]/page.tsx`
- `lib/governance/personas.ts`
- `lib/governance/resolve-persona.ts`
- `lib/governance/landing-access.ts`
- `lib/governance/workspace-access.ts`
- `lib/governance/persona-role-keys.ts`

The shared landing experience uses a dark enterprise visual language based on minimalism and selective soft Neumorphism. Persona pages consume persisted profiling/governance evidence and translate it into role-appropriate outcomes.

The DataNexus AI Agent remains prominent and should expose four to five persona-specific conversation starters. Recently Viewed is collapsible and should remain scoped to the active governance context.

## Interaction contract

Every element that looks interactive must have a real task.

This applies to buttons, cards, KPI tiles, rows, actionable icons, tabs, sub-tabs, dropdowns, filters, chart affordances, search results, breadcrumbs, activity entries and AI prompt starters.

Valid behavior includes navigation, drill-down, filtering, expand/collapse, opening details, executing an authorized action or starting an AI conversation. If an element has no meaningful task, it must not be styled as interactive.

Links and actions must be persona-safe before rendering. Route authorization still remains mandatory as defense in depth. Preserve useful drill-down context where possible and provide hover, focus, pressed, loading and disabled states where relevant.

## Analyst requirements

Metadata Analyst should support Dataset, Domain, Source and Time Range filtering with summaries and drill-down for metadata completeness, ownership, glossary mapping, classification, lineage coverage and schema changes where evidence exists.

Data Quality Analyst should support Dataset, Domain, Source, Quality Dimension and Time Range filtering with summaries and drill-down for overall quality, completeness, validity, accuracy, uniqueness, freshness where persisted, issues, anomalies, root cause and dataset/domain comparisons.

Related filters should synchronize the analytical context rather than behave as disconnected chart controls.

## Canonical dataset drill-down

A read-only governed dataset detail route exists at:

`/catalog/dataset/[datasetId]`

Target drill-down chain:

Dataset -> Trust -> Quality Dimensions -> Certification -> Criticality -> Business Domain -> Glossary -> Classification -> Ownership -> CDEs -> Issues -> Profiling Evidence -> AI Explanation

Use object-level destinations rather than generic list pages whenever a stable destination exists.

## Governance truth boundary

The frontend must not invent governance meaning from technical keywords or local heuristics. Business impact, trust, severity, readiness, certification, risk, ownership, classification, lineage and control outcomes must come from persisted evidence or governed aggregation.

AI suggestion remains separate from human/governed authority. AI may explain, summarize, recommend and surface evidence, but cannot silently certify data, accept risk, approve exceptions or mutate authoritative governance state.

## Data Quality retry incident

Live agent run:

`282bb366-034d-497d-9a74-f37bbfeaabe7`

Initial sequence:

- `sync_quality_rules` succeeded
- `execute_quality_rules` failed because the Generic JDBC bridge timed out during a Render cold start
- durable retry then attempted to recreate a completed step and collided with the unique `(agent_run_id, step_order)` constraint

The execution path was changed to resumable semantics:

- completed steps are reused
- failed steps resume/reset in place
- governed evidence is preserved
- historical durable-job records are not deleted to make retries succeed

Retry job `64e0e817-f1f2-47df-894b-12aa3e098f3c` completed successfully and the original agent run reached `SUCCEEDED`.

## Zero active controls semantics

The retry exposed another correctness problem. Eight suggested controls existed, all pending governed approval and none enabled. The previous execution reported a 100% pass rate and `CONTROLLED` despite evaluating zero active controls.

Future executions now use:

- `pass_rate = null`
- governance status `NO_ACTIVE_CONTROLS`
- explicit evidence that control coverage is none

Suggested controls remain pending until governed approval. Historical rows created before the fix are not silently rewritten.

Migration:

`20260910060919_add_no_active_data_quality_controls_status`

## Landing page production incident

The shared landing loader queried `governance.control_evaluations` through the trusted server `service_role` client. The table had an authenticated SELECT policy but lacked the object-level `service_role` SELECT grant.

This produced:

`permission denied for table control_evaluations`

on `/home/[persona]`, with Next.js digest `2974166875`, causing the generic server-error landing screen for users.

The narrow fix was applied through:

`20260910062422_grant_service_role_control_evaluations_read`

It grants only `SELECT` on `governance.control_evaluations` to `service_role`. RLS was not disabled and public access was not expanded.

This incident reinforces that PostgreSQL object privileges and RLS are separate layers and both must be validated for server-side aggregation paths.

## Production runtime findings

### Generic JDBC bridge

The Render-hosted Java/Spring Generic JDBC bridge is correctly configured. When warm, DataNexus readiness sees it as healthy. On the current Free plan it can sleep after inactivity and cold-start in roughly 58 to 63 seconds, which can exceed application readiness/execution expectations.

Long-term options include an always-on runtime, explicit warming/degraded readiness semantics and carefully scoped retry/timeout behavior.

### Durable worker

Production logs have shown repeated `/api/jobs/worker` 403 responses alongside successful 200 responses. Worker authentication must not be weakened. Inspect fresh Vercel/Supabase secret-dispatch state before changing behavior.

## Verification completed

Role/workspace hardening established checks for:

- thirteen persona navigation definitions
- top-level governed workspace authorization
- nested stronger-capability routes
- organization admin separation
- persona-safe shared landing links
- persona-safe Global Search destinations
- capability-aware Contracts
- capability-aware Workflows
- capability-aware Platform Controls
- governed Dataset detail drill-down
- database RLS/grant invariants
- production build/deployment verification

Literal browser click-through must still be performed whenever supported browser interaction tooling is available. Source/build/runtime checks must not be represented as manual browser E2E testing.

## Highest-priority remaining correctness work

### Explicit active organization context

`lib/governance/landing-access.ts` still resolves `/home` from the earliest organization membership. This is insufficient for users who belong to multiple organizations and may hold different governance personas in each.

The next implementation should introduce a server-validated active-organization context and propagate it to:

- persona resolution
- project scope
- landing evidence
- workspace authorization
- Global Search
- Recently Viewed
- AI context
- governance actions

The selected organization must always be revalidated against current membership. A stale or client-forged organization identifier must fail safely. Replacing "first organization" with "latest organization" is not a valid solution.

## Continuation order

1. Verify current landing routes remain healthy after the control-evaluations grant.
2. Implement active-organization context and multi-org isolation tests.
3. Re-run all persona, tab, sub-tab and action-level authorization checks.
4. Continue end-to-end business journey testing across trust, issue, impact, ownership, remediation, certification and exception flows.
5. Continue security review for IDOR/BOLA, cross-project, cross-org, search and AI retrieval leakage.
6. Harden JDBC cold-start behavior and durable-worker production configuration without weakening security.
7. Continue ADR-006 backlog only after current product correctness/security items are stable.
