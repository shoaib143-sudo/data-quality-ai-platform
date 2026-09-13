# Chat Review Decision Register and Unresolved Items

**Date:** 2026-09-13 (Asia/Singapore)  
**Status:** Current discussion synthesis for the reviewed September 13 DataNexus AI project chats  
**Repository state reconciled:** `be2fbd45d5692aaef6e73101efefeec352a31aa3`

## Purpose

This document extracts the important work-related decisions from the September 13 DataNexus AI project chats available in the shared project context and reconciles them with same-day GitHub implementation evidence.

It focuses on:

- work and release decisions;
- design decisions;
- architecture-level discussions;
- tradeoffs;
- ownership and authority boundaries;
- implementation direction;
- superseded decisions;
- unresolved architecture items.

It intentionally excludes private chain of thought and preserves only durable project knowledge.

## Reviewed chat themes

The relevant project conversations established five recurring themes.

### Final UI validation is an architecture and design exercise

The final testing pass was explicitly broadened beyond functionality and build success.

The application must be reviewed from:

- functional behavior;
- build/runtime behavior;
- architecture;
- design/presentation;
- governed authority;
- agreed requirements.

Every check output should be captured, and findings should identify the basis on which the outcome was reached.

This became visible in later PRs through fields such as `DESIGN`, `ARCHITECTURE`, `BUILD`, `AGREED_REQUIREMENT`, `GOVERNANCE_CONTRACT` and `PRODUCTION_OBSERVATION`.

### Autonomous implementation is acceptable, but assurance is mandatory

The engineering agent was authorized to proceed autonomously with implementation rather than stop at a plan.

That autonomy was coupled to explicit mandatory assurance:

- post-implementation revalidation;
- unit and contract tests;
- negative and failure cases;
- independent automated adversarial audit;
- exact-head CI;
- production verification after deployment where applicable.

Autonomous execution does not reduce the evidence standard.

### AI remediation authority was already correct; the human handoff was not

The remediation discussion established an important boundary before implementation began:

- AI remediation correctly refused an approval-gated production change;
- the defect was the human remediation path, which was vague and could send users to a governance workspace they could not access.

This meant the fix should target handoff representation and navigation, not weaken the approval gate.

### Lifecycle truth must be explicit

The conversations repeatedly required explicit distinction among:

- implemented;
- tested;
- merged;
- deployed;
- production-verified.

The first remediation release later demonstrated why: PR #355 passed earlier stages but production verification exposed another access boundary.

### Deterministic governance boundaries remain final authority

The project direction was to keep deterministic policy/verifier logic as final authority, preserve authorization boundaries, avoid “fixing” security findings by weakening permissions, and keep production mutations narrowly scoped.

Billing changes remain a separate explicitly authorized class of mutation.

## Decision register

| Topic | Decision | Authority boundary | Tradeoff / rejected alternative | Current state |
|---|---|---|---|---|
| Final UI acceptance | Evaluate functionality, build, architecture, design, governance and agreed requirements | Audit evidence and governed contracts | Build-only signoff rejected | Active engineering standard |
| Audit evidence | Capture each check output and assessment basis | Evidence trail | Single final pass/fail summary rejected | Active engineering standard |
| Lifecycle truth | Keep implemented/tested/merged/deployed/production-verified separate | Release evidence | Status compression rejected | Active architecture/release rule |
| Remediation AI action | Continue to refuse approval-gated mutation | Backend approval gate | Bypassing approval rejected | Preserved |
| Remediation human handoff | Route to workflow only when capability and workspace access both allow it | `policy.approve` + workspace policy | Permission widening rejected | Implemented in #356 |
| Catalog lifecycle | UI must use backend-supported lifecycle vocabulary | Catalog API allowlist | UI-only `ARCHIVED` vocabulary rejected | Merged #351 |
| Terminal issue action | Hide resolve-with-evidence for terminal states only | Issue API, evidence verifier | Re-running terminal resolution rejected | Merged #352 |
| Data Quality presentation | Present missing evidence as `N/A`, humanize recommendations, retain approval truth | Persisted evidence and approval state | Raw JSON/null rendering rejected | Merged #354 |
| Retrieval evaluation | Restore read with minimal SQL grants while preserving RLS and app capability | `admin.manage` + SELECT grant + RLS + SECURITY INVOKER | SECURITY DEFINER or mutation grants rejected | Merged #358 |
| Shared persona links | Compose deterministic workspace policy into presentation | Workspace policy + operation capability + direct route authorization | Visible dead-end links rejected | Merged #360 |
| Legacy theme compatibility | Apply scoped dark compatibility bridge | Design-system scope | Global recolor/full immediate rewrite rejected | Merged #361 |
| Physical asset identity | Enrich from governed trust projection by discovered asset | Source facts vs trust/identity evidence | Schema mutation or fabricated identity rejected | Merged #366 |
| Persona count | Derive count from authoritative persona catalog | Governed persona-role catalog | Hard-coded count rejected | Merged #367 |
| Job monitoring | Model actual execution tree from recorded evidence; selection must not trigger work | Scheduler/worker owns execution | Flattened inferred progress and selection-side POSTs rejected | Draft #363, unresolved |

## Architecture-level discussions and reasoning preserved from the chats

### Presentation defects can be governance defects even when backend security is correct

Several findings shared a pattern: the route or API was correctly protected, but the UI advertised an impossible, unauthorized, misleading or semantically false action.

The resulting position is:

> Presentation is not the security control, but presentation must truthfully reflect the governed control surface.

This distinction avoids both extremes:

- relying on button hiding as security;
- tolerating misleading UI because the backend will eventually deny it.

### Independent gates should be composed, not inferred

The remediation production failure showed that one positive authorization signal cannot be used as a proxy for another.

Project action capability and persona/workspace access are independent dimensions.

The same principle later generalized across Lineage, Datasets, Catalog and Physical Assets.

### Data authority must remain where the data contract says it lives

The Physical Assets finding reinforced that a UI expectation does not justify changing an authoritative relation.

Source/discovery facts and governed trust identity were already separated in the schema. The correct implementation was to compose them for presentation using the stable join key rather than move or invent authority.

### Evidence is not decision authority

Retrieval evaluation is allowed to provide evaluation evidence but is not allowed to become model-selection, promotion, deployment or governance authority merely because it is surfaced in an administrative Command Center.

This boundary protects the distinction between measurement and decision rights.

### Semantic truth should be computed from governed catalogs

The persona-count error was small visually but architecture-significant: duplicated literals create a second source of truth.

Counts, labels and state vocabularies that represent governed structures should be derived from the structures themselves wherever practical.

## Tradeoffs discussed or demonstrated

### UX correction versus permission expansion

Chosen: correct the handoff or hide the unavailable action.

Rejected: grant extra access so the existing UI link stops failing.

Reason: authorization should follow product/governance intent, not UI convenience.

### Minimal database grants versus privilege bypass

Chosen: authenticated `SELECT` only, retain RLS, retain `SECURITY INVOKER`, retain app authorization.

Rejected: `SECURITY DEFINER`, anonymous access or authenticated mutations.

Reason: restore the intended read path without creating a broader authority path.

### Deterministic presenter versus raw persistence payload

Chosen: type-check and transform persisted recommendation data for human use while preserving underlying evidence.

Rejected: render raw JSON or internal identifiers directly.

Reason: storage shape is not a user-facing contract.

### Schema fidelity versus convenient denormalization

Chosen: enrich Physical Assets from the existing trust projection.

Rejected: alter the source projection or fabricate identity.

Reason: preserve ownership boundaries and fail closed when trust evidence is absent.

### Scoped compatibility bridge versus global theme rewrite

Chosen: narrow CSS compatibility for known legacy page roots.

Rejected for this increment: global color overrides or immediate full migration of all legacy pages.

Reason: restore readability with bounded regression risk.

### Reversible monitoring rollout versus schema-heavy migration

Living Tree direction favors:

- existing recorded artifacts;
- no database migration;
- no historical backfill;
- feature-flag rollback to List view.

This keeps rollout reversible while release evidence is still incomplete.

## Ownership and authority boundaries

### User / product authority

The user owns explicit authorization for:

- scope-changing product decisions;
- billing or cost-incurring changes;
- any intentional expansion of governed permissions.

General approval to continue engineering does not imply billing authorization or permission broadening.

### Deterministic server authority

Server-side policy, API allowlists, workflow capability checks, evidence verifiers and workspace policy own actual operation authority.

The UI must represent these controls but does not replace them.

### Database authority

Database access depends on both SQL privilege and row-policy semantics.

Application authorization cannot compensate for a missing SQL grant, and a SQL grant must not bypass RLS or application capability.

### Evidence authority

Evaluation, profiling, trust and recommendation records are evidence inputs with bounded authority.

They do not automatically gain authority to mutate, approve, certify or promote other governed state.

### Execution authority

For job monitoring, scheduler/worker infrastructure owns automatic execution.

The monitor owns observation and explicit user controls but must not turn mere selection into execution.

### Release authority

Release claims require evidence appropriate to the claimed lifecycle state.

Production verification belongs to the deployed behavior, not merely the branch or merge commit.

## Superseded decisions and statements

### PR #355 capability-only remediation routing

Superseded by the combined capability + workspace-access model in #356.

The first model did not account for personas that can approve a project action but cannot enter the operator workspace.

### Earlier September 13 status of #351, #352 and #354

The morning engineering summary correctly described them as open at that time.

Later that day they were merged:

- #351 -> `d4b850235546fcd2c13de422729a3bacae8983ca`;
- #352 -> `1d5af31f5bd2a320d8cd1e60644738b6a47392bb`;
- #354 -> `e51ddb5ed1df40a59d4b5c90e603e47f92671d66`.

The earlier summary remains useful as a historical checkpoint but is no longer the current lifecycle statement.

### Retrieval-evaluation 500 listed as unresolved

The earlier summary intentionally left the production permission error outside the remediation fix.

PR #358 later addressed the read-path architecture without widening mutation authority.

### Physical Assets source-projection identity assumption

Superseded by the #366 architecture that takes stable identity from governed trust evidence and joins by `discovered_asset_id`.

### Hard-coded governance persona count

Superseded by #367, which derives the count from the same governed persona catalog used by the access-role query.

### Relying only on route denial for shared workspace actions

Superseded by #360 presentation-policy composition. Direct route denial remains authoritative, but unavailable actions should no longer be advertised.

## Unresolved items

### 1. Living Tree monitor release acceptance

PR #363 remains open and draft.

The architecture direction is accepted enough to implement and test, but release acceptance remains incomplete.

Outstanding evidence includes:

- signed-in preview verification for both authorized and unauthorized project personas;
- controlled new supervisor/profiling execution with manifest, retry and diagnostic evidence plus cleanup/rollback;
- representative API latency/payload measurements;
- current-head CI completion;
- deployed server flag verification;
- merge and exact production UI acceptance.

The draft explicitly states that READY preview state and synthetic browser tests do not equal authenticated production acceptance.

### 2. Legacy compatibility bridge retirement

PR #361 solves readability with a scoped compatibility layer.

The reviewed discussion does not define a full migration plan for retiring that bridge after all legacy pages become dark-native.

This remains design-system technical debt rather than a current production defect.

### 3. Positive live remediation persona coverage

The previously failing Senior Leadership case was production-verified after the combined-gate fix.

The fully authorized positive path is covered deterministically, but no production persona was mutated solely to manufacture that live test condition.

That remains a coverage limitation rather than an unresolved policy decision.

## Current implementation direction

Future DataNexus work should continue with the following pattern:

1. start from the authoritative contract, policy, schema or evidence source;
2. review UI behavior for design and architecture truth, not only technical function;
3. record the assessment basis for findings;
4. implement the narrowest correction that preserves ownership and authorization boundaries;
5. add normal, negative/failure and independent adversarial validation;
6. reconcile long-running branches with current protected `main` before final exact-head gates;
7. keep draft work explicitly non-production until authenticated and operational acceptance evidence is complete;
8. allow production verification to invalidate an otherwise green release and return it to defect analysis;
9. preserve historical decision documents and supersede their status statements through newer dated records rather than rewriting history.

## Current repository context

At reconciliation time, protected `main` is `be2fbd45d5692aaef6e73101efefeec352a31aa3`, the merge of PR #361.

The same-day main lineage includes the earlier remediation and release-provenance work plus later merges for retrieval-evaluation access, catalog lifecycle, terminal issue presentation, Data Quality presentation, Physical Assets schema alignment, persona semantic truth, shared workspace action composition and legacy contrast compatibility.

PR #363 remains a draft and must not be described as production accepted.

## Architecture cross reference

The architecture-oriented version of this synthesis is:

- `Architecture/2026-09-13-chat-derived-architecture-decisions-and-authority-boundaries.md`
