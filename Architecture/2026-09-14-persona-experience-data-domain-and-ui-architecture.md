# Persona Experience, Data Domain Scope, and Product UI Architecture

Date: 2026-09-14

## Purpose

This document captures the architecture decisions established during the persona-driven DataNexus UX and acceptance work completed across the current session.

It is intended as a durable implementation reference for future agents and maintainers. It should be read together with the existing persona identity, workspace-policy, authorization, and acceptance documents.

## Canonical persona model

DataNexus currently defines 13 governed application personas:

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

The persona model is authoritative through the existing governance persona registry and presentation policies. Persona landing pages must not become a single generic dashboard with renamed labels.

Each persona must preserve a distinct information hierarchy aligned to its primary question, real-life work, and allowed capabilities.

## Persona presentation families

The common visual system is shared, but information hierarchy varies by persona.

### Executive and business

Senior Leadership, Business User, Data Owner, and Data Product Owner.

The primary UX emphasis is trust, material exposure, business impact, ownership, product reliability, decisions, and safe consumption.

Senior Leadership must remain explicitly non-technical. Profiling run identifiers, engine detail, implementation internals, and low-level execution state must not become primary executive content.

### Governance and risk

Data Steward, Data Governance Specialist, Compliance & Risk Officer, and Privacy & Security Officer.

The primary UX emphasis is work requiring attention, policy/control coverage, stewardship, evidence, classifications, exceptions, risk, and remediation.

### Technical and analytical

Data Governance Admin, Data Custodian, Source System Owner, Metadata Analyst, and Data Quality Analyst.

The primary UX emphasis is platform health, sources, execution state, profiling, lineage, observability, metadata completeness, quality dimensions, root cause, and remediation.

## Shared visual architecture

The approved product-wide visual direction is a dark navy DataNexus shell with consistent spacing, cards, typography, controls, focus states, and interaction behavior.

The shared visual foundation was implemented in Batch 1 and merged through PR #401.

The product-wide root theme was completed through Batch 5 and merged through PR #409.

A subsequent screenshot review refinement was merged through PR #417.

The design system is intentionally centralized. Future pages should prefer reusable semantic surfaces and controls instead of one-off screenshot-specific CSS.

The approved interaction pattern is:

- dark navy application canvas;
- compact global utility navigation;
- consistent elevated and inset card surfaces;
- cyan-focused interaction states;
- clear visual separation between summary, evidence, and action;
- responsive layouts without permanent dead space;
- no duplicate product controls or duplicated information blocks.

## Data Domain is the canonical user-facing term

The canonical user-facing nomenclature is **Data Domain**.

The existing storage field may remain `catalog.datasets.business_domain`, but UI text should not alternate between Business Domain, Domain, business_domain, and Data Domain where these represent the same governed concept.

Batch 2, merged through PR #402, established the Data Domain scope contract.

The landing-page Data Domain selector must:

- include an `All Data Domains` option;
- derive selectable values from governed dataset evidence;
- persist useful scope in the URL where appropriate;
- remain compatible with an optional dataset filter;
- prevent a stale dataset selection from overriding a newly selected Data Domain;
- scope dataset-linked evidence consistently.

The DQ trend is not the only component governed by the selected Data Domain. Dataset-linked KPIs, findings, certification evidence, issues, metadata evidence, and business-impact links should respect the same scope where the underlying record has a Data Domain relationship.

Evidence that is inherently project-wide must remain clearly labelled as project-wide rather than being falsely presented as Data-Domain-scoped.

## Scope integrity rule

A persona dashboard must never silently mix differently scoped evidence in a way that implies one common scope.

The user must always be able to distinguish whether evidence represents:

- all governed data;
- a Data Domain;
- a dataset;
- a project;
- a data product;
- or another explicit governed resource.

A useful summary rule is:

**Summary -> scope -> evidence -> responsible action**

## Persona-specific landing composition

Batch 3, merged through PR #405, made all 13 persona landing experiences genuinely persona-specific.

The architecture uses the existing persona presentation policy as the source of truth.

Each persona landing should define:

- persona-specific hero framing;
- persona-specific trend language;
- persona-specific attention section;
- persona-specific context section;
- persona-specific next-action framing;
- persona-specific metrics;
- contextual AI starter prompts.

The same underlying governed evidence may be presented differently by persona, but the evidence itself must not change based on presentation.

A visible truth boundary is retained:

**Presentation changes by persona; governed evidence does not.**

## Floating DataNexus AI Agent

The approved AI interaction model is one global DataNexus AI Agent.

Batch 4, merged through PR #407, replaced the duplicate sidebar AI presentation with a floating left-side icon.

Required behavior:

- the initial control is a small floating icon;
- it appears once in the application;
- clicking it opens a hovering in-page chat panel;
- opening it must not resize or consume permanent dashboard layout space;
- compact and expanded overlay states are permitted;
- it must not redirect merely to begin a conversation;
- it resolves the current signed-in persona;
- it receives current page and Data Domain context where available;
- it uses governed evidence visible to the authenticated user;
- AI responses should link to supporting governed workspaces/evidence where possible;
- unavailable evidence must be reported as unavailable rather than inferred;
- an AI suggestion never becomes governance authority.

The AI provider remains behind the existing governed reasoning-provider boundary rather than introducing a second independent AI stack.

## Interactive evidence rule

Meaningful UI content should be interactive when an underlying governed source exists.

This includes, where practical:

- KPI counts;
- material-risk counts;
- issue totals;
- certification status;
- failed controls;
- Data Domain summaries;
- lineage impact;
- reports;
- classifications;
- metadata gaps;
- stewardship coverage;
- source and observability signals.

The interaction should lead to the source, underlying records, evidence, or an appropriately scoped workspace.

Decorative elements do not need artificial click behavior.

## Truthful state semantics

The product must distinguish:

- zero;
- unavailable;
- not measured;
- no evidence;
- inaccessible;
- not applicable.

A value of zero must only be used when the system has measured or enumerated the relevant governed evidence and the true result is zero.

A backend or evidence-source failure must not be rendered as a believable zero-value dashboard.

## Capability-aware UI

The UI must mirror project capabilities without becoming the security boundary.

Recent acceptance work reinforced this rule across Glossary, Profiling, Stewardship, Classification, Schedules, Issues, Observability, Data Quality, and related shared workspaces.

Examples:

- glossary mutation controls require `glossary.manage`;
- profiling execution/remediation controls require the corresponding execution/remediation capability;
- schedule operations require `schedule.manage`;
- stewardship mutation requires `stewardship.manage`;
- certification request and review remain separate authorities;
- policy approval remains distinct from classification review.

Server/API authorization remains authoritative even when UI controls are hidden.

## Real-life persona acceptance contract

The repository contains a canonical real-life task contract for all 13 personas.

Each persona must have meaningful read and, where appropriate, governed mutation tasks aligned to the production capability matrix.

Full persona acceptance is stronger than route visibility. It should establish:

1. correct identity and persona resolution;
2. correct landing page;
3. correct positive workspace access;
4. correct negative access boundaries;
5. successful applicable real-life work;
6. persisted evidence/audit state for governed mutations;
7. no cross-project or cross-organization leakage;
8. no UI defect preventing task completion.

Structural role configuration and literal browser-login evidence remain separate acceptance dimensions.

## Accessibility and responsive behavior

The shared design should retain:

- keyboard navigation;
- visible focus treatment;
- semantic control labels;
- screen-reader names;
- adequate contrast;
- status meaning not conveyed by color alone;
- no horizontal page overflow under normal responsive use;
- usable compact layouts on laptop and smaller screens;
- floating AI behavior that does not cover critical primary actions where avoidable.

## Current implementation references

The persona/UI release sequence completed through:

- PR #398: shared persona mutation-control and profiling/glossary authorization hardening;
- PR #401: shared DataNexus visual system;
- PR #402: Data Domain and landing scope integrity;
- PR #405: all 13 persona-specific landing compositions;
- PR #407: floating persona-aware DataNexus AI Agent;
- PR #409: whole-product DataNexus theme;
- PR #417: production screenshot-driven persona landing refinements.

The repository has continued to advance since those merges. Future changes must rebase against current `main` and preserve these contracts.

## Work explicitly owned elsewhere

The following workstreams are intentionally outside this document's implementation ownership because the user assigned them to other agents:

- Living Tree Job Monitor work, including the current Living Tree PRs;
- Agent Policy v2, PR #422.

Changes in this persona/UI stream should avoid conflicting edits to those workstreams unless integration requires an explicit reconciliation.

## Architectural guardrails

Future implementation should preserve the following invariants:

1. Persona presentation must not widen authorization.
2. Organization privilege and governance persona remain separate dimensions.
3. Data Governance Admin does not imply organization ADMIN.
4. Data Domain is the canonical user-facing domain term.
5. Data Product remains a distinct product concept and must not be renamed to Data Domain.
6. Persona-specific presentation does not change governed evidence.
7. AI recommendations do not become governance truth or authority.
8. Every material KPI should be traceable to governed evidence where such evidence exists.
9. Project-wide evidence must not be falsely represented as Data-Domain-scoped.
10. Shared UI primitives should be preferred over page-specific theme forks.
