# Persona UI Release Architecture and Implementation Handoff

**Date:** 2026-09-14 (Asia/Singapore)  
**Status:** Implementation in progress  
**Scope:** Thirteen persona landing experiences, Data Domain scoping, shared DataNexus visual system, floating persona-aware AI Agent, whole-product theme, release acceptance

## Purpose

This record consolidates the implementation decisions and current release state from the extended persona-driven DataNexus AI UI work. It complements the existing persona production acceptance and presentation-engine records and is intended to provide a durable handoff without relying on chat history.

## Accepted persona baseline

The governed application continues to use thirteen personas:

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

Persona presentation may vary, but governed truth, authority, ownership, certification, risk, quality evidence and audit state must not vary by persona.

## UI architecture decisions

### Shared DataNexus visual system

The approved dark navy DataNexus visual system is a product-wide contract rather than a landing-page-only treatment. Shared semantic surfaces and controls are preferred over isolated page-specific styling. Older workspaces may use the explicit legacy dark-compatibility bridge during migration.

Batch 1, PR #401, established the shared visual foundation and has been merged.

### Persona-specific landing composition

The landing page is not a generic dashboard with only the persona name changed. Information hierarchy, terminology, emphasis and actionable content vary according to persona intent.

Senior Leadership must receive non-technical enterprise trust, material-risk and business-impact framing. Operational personas emphasize queues, investigation and remediation. Technical personas retain diagnostic evidence. Analytical personas retain evidence depth and trends.

The persona-aware presentation layer remains subordinate to canonical governed truth.

### Data Domain is the canonical scope term

The landing experience uses **Data Domain** as the single user-facing nomenclature. The Data Trust area includes a Data Domain selector. Selecting a domain must retain scope consistently across dataset-linked evidence and must disclose evidence that remains project-wide rather than falsely implying that all metrics are domain-scoped.

Batch 2, PR #402, implemented this scope-integrity contract and has been merged.

### Floating DataNexus AI Agent

The AI Agent is a single global surface. The previous duplicate sidebar AI card is removed.

The interaction contract is:

- a small floating icon on the left side;
- opens as an in-page overlay;
- does not redirect to a separate AI page for conversation;
- does not consume permanent dashboard width;
- supports compact and expanded overlay states;
- resolves the authenticated persona before the first turn;
- carries current page and Data Domain context where available;
- queries governed evidence visible through authenticated/RLS boundaries;
- exposes evidence routes;
- degrades explicitly when an evidence source or model provider is unavailable;
- never invents counts, approvals or governance authority;
- never treats AI recommendations as approval authority.

### Whole-product theme

The final visual batch applies the DataNexus page shell at the root so routed workspaces inherit the approved dark visual language. Representative coverage includes Catalog, Glossary, Data Quality, Profiling, Lineage, Issues, Observability, Reports, Workflows, Schedules, Audit, Classification, Sources/Datasets and Admin.

## Authorization architecture preserved

UI work must not weaken the independent authority controls already established in production:

- persona presentation;
- account and organization membership;
- project capability;
- workspace access;
- action-specific authorization;
- workflow approval authority;
- row-level security;
- server-side policy evaluation;
- governed mutation authority;
- audit/evidence authority.

Persona mutation and profiling/glossary hardening from PR #398 is merged and remains a prerequisite foundation.

Profile and Settings remain governed account workspaces as established independently on main. UI batches must preserve that canonical account-workspace model rather than reimplementing it.

## Release sequence

The implementation is intentionally released in dependency order:

1. authorization/mutation hardening, merged;
2. shared DataNexus visual system, Batch 1, merged;
3. Data Domain and landing scope integrity, Batch 2, merged;
4. thirteen persona-specific compositions, Batch 3;
5. floating persona-aware AI Agent, Batch 4;
6. whole-product theme, Batch 5;
7. production deployment;
8. authenticated thirteen-persona production acceptance.

Later batches are refreshed onto the exact merged parent before release. Protected branch checks are not bypassed when main advances concurrently.

## Verification contract

Each batch must pass the repository's protected workflow suite. Additional deterministic contracts cover:

- shared DataNexus theme;
- persona landing scope integrity;
- thirteen-persona content parity;
- persona presentation truth boundary;
- floating AI Agent behavior;
- whole-product theme consistency.

A green build is necessary but does not establish production acceptance. Final acceptance still requires authenticated persona execution against the deployed product.

## Current release state at capture time

- PR #398, persona mutation and capability hardening: merged.
- PR #401, Batch 1 shared visual system: merged.
- PR #402, Batch 2 Data Domain and landing scope: merged.
- PR #400, narrower Data Domain change: closed as superseded by #402.
- PR #405, Batch 3 persona-specific compositions: refreshed onto merged Batch 2 and protected CI running.
- PR #407, Batch 4 floating AI Agent: implementation complete on stacked branch, pending refresh after Batch 3 merge.
- PR #409, Batch 5 whole-product theme: implementation complete on stacked branch, pending refresh after Batch 4 merge.
- Production deployment of Batches 3 through 5: pending.
- Authenticated thirteen-persona production acceptance: pending.
- Living Tree PR #363 remains a separate draft acceptance track and is not evidence that the persona UI release is complete.

## Production acceptance requirements

After the implementation batches merge and deploy, each persona must be verified for:

1. authentication and correct landing;
2. persona-appropriate information hierarchy;
3. Data Domain filtering and scope retention;
4. navigation and drilldowns;
5. permitted actions;
6. representative expected denials;
7. evidence and audit visibility;
8. AI Agent open/chat/compact/expanded behavior;
9. AI evidence links and truthful unavailable states;
10. responsive behavior and no layout-space regression;
11. consistent dark theme across representative workspaces;
12. logout/session boundary.

Sensitive service-account credentials must never be committed to architecture or acceptance evidence.

## Remaining execution items

The open release work is deliberately narrow:

1. finish Batch 3 protected CI and merge if green;
2. refresh Batch 4 onto the exact Batch 3 merge, run full CI and merge;
3. refresh Batch 5 onto the exact Batch 4 merge, run full CI and merge;
4. deploy the resulting main revision;
5. perform the authenticated thirteen-persona production acceptance matrix;
6. record defects, narrow fixes and retest evidence;
7. declare production acceptance only after those steps succeed.

## Related records

- `Architecture/2026-09-12-persona-aware-presentation-engine.md`
- `Architecture/2026-09-13-persona-driven-production-acceptance-and-architecture-validation.md`
- `Architecture/2026-09-13-production-architecture-governance-and-remediation-checkpoint.md`
- `Major discussion/2026-09-13-chat-review-persona-production-acceptance-and-daily-decision-capture.md`
