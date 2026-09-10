# Role Experience Implementation and Operational Continuation

Date: 2026-09-10
Status: Current product/UX continuation record

## Context

This discussion continues the 2026-09-09 role-based business UI work and records the decisions made during implementation, interaction review, testing and production incident response.

The earlier six-persona and eleven-persona checkpoints are historical. The implemented governance experience now uses thirteen personas.

## Current persona model

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

Metadata Analyst and Data Quality Analyst are first-class governance personas. Data Custodian / Technical Steward now has a dedicated landing experience.

Data Analyst and Data Engineer remain useful operational concepts but are not part of the formal governance-persona baseline unless a future decision explicitly adds them.

## Product experience principle

The core UX principle remains:

**Show the answer first. Show the mechanics only when requested.**

Persona pages are decision-support experiences, not generic SaaS dashboards.

A user should rapidly understand:

- What is the current state?
- What changed?
- Why does it matter?
- Who owns it?
- What action or decision is required?
- Are things improving?
- What evidence supports this conclusion?

## Interaction rule

A strict product rule has been adopted:

**If an object looks interactive, it must have a task.**

This applies to buttons, icons, cards, KPI tiles, rows, charts, dropdowns, filters, tabs, sub-tabs, breadcrumbs, search results, activity items, Recently Viewed objects and AI prompt starters.

An interactive-looking object must navigate, drill down, filter, expand/collapse, open a detail/action surface, execute an authorized action or start an AI conversation. Otherwise it should not be presented as interactive.

Whole-card semantic interactions are preferred when a card represents one entity or decision. Avoid forcing users to click only a small chevron or decorative icon.

Controls should provide appropriate hover, focus, pressed, loading and disabled states. Keyboard accessibility is part of the interaction contract, not optional polish.

## Persona-safe interaction

The UI must not advertise actions or destinations a persona cannot use.

Navigation visibility and authorization remain separate, but they must agree from the user's perspective:

- hide or disable unavailable actions appropriately
- retain route/API capability checks server-side
- do not rely on users discovering authorization through a 403 page
- filter Global Search results before returning inaccessible destinations
- preserve persona safety on dataset, issue, lineage, profiling, classification, stewardship, audit, workflow, contract and platform-control drill-downs

Nested workspaces may have stronger manage/approve permissions than their parent read surface.

## Visual direction

The agreed design language is:

- dark mode
- minimalism
- selective soft Neumorphism
- premium enterprise tone
- restrained hierarchy
- limited visual clutter
- no duplicated information
- progressive disclosure

Recently Viewed should be collapsible and sit above the DataNexus AI Agent where applicable.

The AI Agent should remain visually prominent without duplicating generic help panels.

## AI Agent experience

Every persona landing page should provide approximately four to five persona-specific conversation starters based on the responsibilities and decisions of that persona.

Examples of valid AI behavior:

- explain current state
- summarize changes
- identify risk
- surface evidence
- recommend next actions
- explain governed concepts
- help find trusted data

AI suggestions do not become governance authority. AI must not silently approve, certify, accept risk, approve an exception or mutate authoritative governance state.

Important AI answers should progressively expose the evidence used, especially when the answer affects trust, risk, certification, privacy or governance decisions.

## Analyst experiences

### Metadata Analyst

The Metadata Analyst experience should be dataset-centric and support summarization across the estate.

Useful filters include:

- Dataset
- Business Domain
- Source
- Time Range

Useful summaries/charts include:

- metadata completeness
- ownership coverage
- glossary mapping
- classification coverage
- lineage coverage
- schema changes
- metadata gaps by dataset/domain/source

### Data Quality Analyst

The Data Quality Analyst experience should support both dataset-level investigation and aggregated quality analysis.

Useful filters include:

- Dataset
- Business Domain
- Source
- Quality Dimension
- Time Range

Useful summaries/charts include:

- overall quality trend
- completeness
- validity
- accuracy
- uniqueness
- freshness where persisted
- issue trends
- anomaly signals
- root cause evidence
- dataset/domain comparison

Where possible, related filters should synchronize the full analytical section so users do not have to manually keep separate charts aligned.

## Governed data truth

The frontend must consume governance outputs rather than manufacture them.

Do not infer business impact from finding keywords. Do not invent regulatory exposure, privacy exposure, certification, criticality, decision readiness, fitness for use, domain confidence, lineage, ownership or policy/control evidence.

The product should preserve traceability from high-level business conclusions to technical/source evidence.

Target chain:

Executive Summary -> Business Insight -> Governance Finding -> Quality Metric -> Column / Dataset -> Source Data

## Canonical dataset destination

A governed read-only Dataset object is the preferred drill-down destination:

`/catalog/dataset/[datasetId]`

The conceptual evidence chain is:

Dataset -> Trust -> Quality Dimensions -> Certification -> Criticality -> Business Domain -> Glossary -> Classification -> Ownership -> CDEs -> Issues -> Profiling Evidence -> AI Explanation

This should replace generic list-page navigation wherever a stable object-level route exists.

## Production incident: persona landing pages unavailable

A live production failure caused persona landing pages to show the generic Next.js server-error screen.

Observed error:

`permission denied for table control_evaluations`

Route:

`/home/[persona]`

Next.js digest:

`2974166875`

Cause:

The shared landing loader used the trusted server `service_role` client to aggregate governance evidence. `governance.control_evaluations` had an authenticated project-member SELECT policy but lacked the object-level `service_role` SELECT privilege required by the server aggregation path.

Fix:

`20260910062422_grant_service_role_control_evaluations_read`

The fix granted only service-role read access. RLS was preserved and no public/user access was broadened.

Lesson:

PostgreSQL object privileges and RLS are different layers. Server-side governance aggregation must be tested against both.

## Data Quality retry and zero-control correctness

A Data Quality execution failed because the Render JDBC bridge timed out after sleeping. Its durable retry then exposed a duplicate `(agent_run_id, step_order)` problem because a successful step was recreated.

The retry flow was changed to resumable semantics. Completed steps are reused, failed steps resume in place, and historical evidence is preserved.

The successful retry then exposed a semantic defect: zero enabled/approved rules were evaluated, yet the old code returned `CONTROLLED` with a 100% pass rate.

Future behavior is now:

- zero active controls -> `NO_ACTIVE_CONTROLS`
- pass rate -> `null`
- control coverage explicitly recorded as none
- suggested controls remain pending until governed approval

Do not automatically activate suggested Data Quality controls merely to produce a score.

## Operational runtime lessons

### Render JDBC bridge

The bridge is correctly configured but can sleep on the Render Free plan. Cold starts were observed around one minute. DataNexus must distinguish dependency warming/degradation from invalid configuration.

### Durable worker

Production has shown `/api/jobs/worker` 403s alongside successful worker calls. Worker authentication must not be weakened. Fresh runtime logs and secret-dispatch configuration should be checked before changing the route.

## Remaining highest-priority implementation gap

### Active organization context

`lib/governance/landing-access.ts` still selects the earliest organization membership when resolving `/home`.

That is incorrect for a user belonging to multiple organizations with different personas, permissions or governed data scopes.

The next implementation should introduce a server-validated active organization context and propagate it through:

- persona resolution
- projects
- landing evidence
- workspace authorization
- Global Search
- Recently Viewed
- AI context
- governance actions

A client-provided organization ID must never be trusted without validating current membership. A stale selection must fail safely. Simply choosing the latest membership instead of the first does not solve the architecture problem.

## Recommended continuation

After active-organization correctness:

1. Re-run persona landing, tab, sub-tab and action authorization tests.
2. Test complete business journeys rather than isolated screens.
3. Continue IDOR/BOLA, cross-project and cross-organization security review.
4. Test AI retrieval isolation, evidence grounding and authorization boundaries.
5. Continue accessibility and responsive testing.
6. Harden dependency-outage/retry behavior.
7. Continue application observability and usage instrumentation.
8. Continue ADR-006 items only when their required governance contracts or infrastructure exist.

## Acceptance mindset

A page is not complete merely because it renders. A persona experience is complete only when the user can accomplish the intended governance job end to end, every visible action has a meaningful task, evidence is truthful, authorization is correct, and failures degrade safely.
