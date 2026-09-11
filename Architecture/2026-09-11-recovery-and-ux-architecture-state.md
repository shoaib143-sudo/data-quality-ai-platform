# 2026-09-11 Architecture State: Recovery Assurance, Platform Boundaries, and UX Foundation

## Status

Architecture checkpoint and continuation record.

This document summarizes the current architecture decisions discussed on 2026-09-11. It complements the existing ADRs and production-operating-state documents. It does not replace the formal ADR sequence.

## Architectural direction

DataNexus AI / Data Governance PowerHouse is now operating as a production-oriented governance platform with four major architectural layers:

1. **Product and workflow layer**: Next.js user experience, dashboards, role workspaces, governance workflows, profiling, lineage, remediation, reports, and AI agents.
2. **Governance and data layer**: Supabase PostgreSQL schemas, RLS/ACLs, audit chain, governance state, catalog, profiling evidence, semantic knowledge, orchestration, and recovery evidence.
3. **Runtime and integration layer**: Supabase Edge Functions, Render-hosted OPA, OpenTelemetry collector, JDBC bridge, provider integrations, model gateways, and background execution.
4. **Operational assurance layer**: protected GitHub CI, migration reconstruction, recovery contracts, production validation, evidence manifests, and branch protection.

The architectural priority has shifted from adding isolated capabilities to proving recoverability, preserving source authority, constraining runtime truth claims, and consolidating user experience.

## Current platform topology

### Application runtime

- Next.js application on Vercel.
- Production deployment is tied to GitHub `main`.
- Application configuration includes production domains and a scheduled worker route.

### Supabase

Supabase remains the primary governed data platform for:

- PostgreSQL application and governance schemas
- Auth and identity state
- Storage metadata
- Edge Functions
- pgvector and semantic embeddings
- audit and recovery evidence

The production organization is on the Free plan. Therefore the architecture must not depend on paid PITR or branch-based DR as an assumed control.

### Render

Render hosts three operational dependencies:

- OPA policy runtime
- OpenTelemetry collector
- JDBC bridge

These services are part of recovery scope `DEPENDENCIES` and, where applicable, `APPLICATION_CONFIG` / service validation. Their current production availability does not by itself prove reconstructibility or recovery.

### GitHub Actions

GitHub Actions is the governed software-delivery and operational-evidence control plane.

Protected `main` requires:

- `build`
- `analyze`
- `revalidate`
- `certify`

Recovery-related workflows add contract verification and independent evidence artifacts, but workflow artifacts are not considered permanent evidence storage.

## Recovery Assurance v2 architecture

### Recovery model

Recovery Assurance v2 separates **policy**, **backup**, **rehearsal**, **evidence**, and **operational runbook** concerns.

The system must answer two different questions independently:

- Can the system be reconstructed from governed source and configuration?
- Can real production state be restored and the resulting service made usable within approved objectives?

Those questions must not be collapsed into one readiness flag.

### Canonical recovery scopes

The platform uses seven recovery scopes:

#### `DATABASE`

Includes:

- governed PostgreSQL schemas and data
- catalog state
- profiling state and evidence
- governance records
- semantic/pgvector state
- orchestration records
- audit chain

#### `STORAGE`

Includes:

- bucket definitions
- Storage metadata
- policies/configuration
- actual object bytes

Database backup evidence alone cannot satisfy this scope because Storage object bytes are external to the PostgreSQL logical database backup.

#### `IDENTITY_CONFIG`

Includes:

- Auth configuration
- SSO/OAuth dependencies
- SMTP and identity settings
- key/secret inventory references

Secret values remain external and must never be committed.

#### `APPLICATION_CONFIG`

Includes:

- Vercel project configuration
- domains
- cron/worker configuration
- Render service topology
- runtime/environment variable inventory

#### `EDGE_RUNTIME`

Includes:

- Supabase Edge Function source
- version-controlled function configuration
- JWT verification settings
- dependency/import-map configuration

#### `DEPENDENCIES`

Includes:

- OPA
- OpenTelemetry
- JDBC bridge
- AI model providers
- retrieval/search dependencies
- email and identity dependencies

#### `SERVICE_VALIDATION`

Includes post-recovery checks proving the recovered platform is usable, such as:

- application health
- authentication
- catalog access
- profiling execution
- worker processing
- governance operations
- AI routing / agent capability
- policy enforcement

## Recovery state machine

The architectural state progression is:

`NOT_CONFIGURED -> DOCUMENTED -> SIMULATED -> RECONSTRUCTED -> RESTORED -> PRODUCTION_VERIFIED`

Interpretation:

- **DOCUMENTED**: scope, policy, and procedure exist.
- **SIMULATED**: non-destructive or synthetic exercise demonstrates procedure/control logic.
- **RECONSTRUCTED**: infrastructure/schema/runtime can be rebuilt from governed source.
- **RESTORED**: real recoverable state has been restored into an isolated recovery target.
- **PRODUCTION_VERIFIED**: the recovered service has passed full production-equivalent validation.

A clean migration replay is strong evidence for `RECONSTRUCTED`, but not for `RESTORED`.

## Recovery policy and readiness semantics

Each project currently carries recovery objectives including:

- RPO target: 60 minutes
- RTO target: 240 minutes
- recovery drill frequency: 90 days
- all seven scopes required

Readiness is intentionally fail-closed. Relevant states include:

- `NO_POLICY`
- `DISABLED`
- `DRILL_REQUIRED`
- `SCOPE_COVERAGE_INCOMPLETE`
- `EXTERNAL_EVIDENCE_REQUIRED`
- `TIMING_EVIDENCE_REQUIRED`
- `TARGETS_NOT_MET`
- `DRILL_OVERDUE`
- `READY`

`READY` must only be emitted when the latest authoritative recovery evidence satisfies required scope, evidence, timing, freshness, and objective conditions.

## Timing evidence architecture

RPO and RTO are not inferred from convenient timestamps.

Authoritative values require evidence such as:

- incident/recovery-event time
- actual recoverable backup/recovery-point time
- recovery start time
- service-ready time

Without these timestamps, the architecture preserves the 60/240-minute objectives but marks them as unproven.

This prevents false compliance caused by using deployment timestamps or database-restore duration as a substitute for service RTO.

## Production migration history boundary

Direct provider-managed migration application can create a production migration version different from the filename used in the repository.

The architectural decision is:

**Do not rewrite or fabricate production migration history.**

Instead:

- keep repository migration filenames immutable
- keep observed production versions immutable
- maintain an explicit migration-history alias registry
- verify aliases in CI
- prevent duplicate migration files using the provider-assigned timestamp

This preserves an auditable relationship between logical migration identity and provider-observed history.

## Edge Function source authority

A recovery review identified that all six required Edge Functions were active in production, but two functions were not present in Git.

The architectural rule is now:

**A production-required Edge Function is not reconstructible unless its source and deployment-relevant configuration are governed in source control.**

PR #258 addressed the missing source authority for:

- `profiling-executor`
- `connection-health-check`

The Supabase configuration now forms part of the recovery contract, including JWT verification and dependency/import-map expectations.

## Portable backup architecture

### Why portable backup exists

The production Supabase plan does not justify assuming managed PITR or a paid standby recovery target. The architecture therefore defines a provider-aware portable logical export as an independent recovery strategy.

This is separate from any future managed backup/PITR capability.

### Governed export mechanism

The governed portable path uses Supabase CLI-aware dump behavior for:

- roles
- schema
- data
- migration history

This is preferred over treating a generic raw `pg_dump` as the sole portable recovery contract because provider-specific filtering and migration handling are part of Supabase recovery behavior.

### Encryption boundary

Long-lived portable backup data must be encrypted before retention outside the trusted execution environment.

The implementation direction in PR #261 uses:

- temporary plaintext working files
- recipient-based `age` encryption
- SHA-256 integrity hashes
- deletion of plaintext after encryption
- an external/private decryption identity that is never committed

Production backup creation is explicitly forbidden on GitHub-hosted runners because that would place plaintext production state into an environment that is not the approved backup trust boundary.

### Source consistency

Portable export can require multiple logical dump operations. Therefore the backup process checks source stability across the export window.

If the source changes in a way that makes the component exports non-coherent, the resulting artifact must not be certified as a stable recovery point.

The architecture favors false-negative rejection over false-positive recovery evidence.

## Local isolated restore architecture

The zero-additional-cost recovery target is a local Supabase/Docker environment bound to loopback and protected by explicit destructive confirmation.

The local rehearsal is intended to prove:

- the backup can be decrypted
- the database can be recreated
- exported roles/schema/data/migrations can be applied
- critical data fingerprints match
- governance/audit integrity remains valid
- database security/configuration objects are present

Validation must include more than row counts.

The recovery integrity model includes deterministic evidence for:

- critical table data
- schema/column definitions
- RLS policies
- functions
- triggers
- grants
- extensions
- migration history
- audit-chain validity

A passing local rehearsal is database recovery evidence. It is not full recovery evidence for Storage object bytes, Auth configuration, Vercel/Render reconstruction, or external dependencies.

## Evidence architecture

Recovery evidence is expected to include:

- commit SHA
- workflow/run identifiers
- backup identifier
- cryptographic hashes
- source fingerprint
- recovery target identity
- covered scopes
- validation results
- timing evidence when authoritative

Evidence stored only in the source production database is insufficient because a severe incident could affect both service state and evidence state.

GitHub artifacts provide an independent copy but are retention-limited. The target architecture therefore requires at least one durable independent evidence channel for compact manifests, without copying plaintext production data into the repository.

## Business impact architecture

Recovery technology is subordinate to business impact policy.

The BIA records RPO/RTO objectives but intentionally does not fabricate Maximum Tolerable Disruption / MTPD where business approval has not been obtained.

Future governance must define:

- recovery owner
- incident authority
- escalation/communications chain
- maximum tolerable disruption
- recovery priorities across services
- criteria for declaring service recovery complete

Technical tests cannot substitute for that approval layer.

## Provider-specific recovery boundaries

### Vercel

A Vercel deployment rollback can restore application code traffic quickly, but it does not restore:

- Supabase database contents
- Supabase Auth state/configuration
- Storage object bytes
- Render dependencies
- external provider state

Therefore Vercel rollback is an application rollback mechanism, not a complete DR mechanism.

### Render

Current Render services demonstrate operational topology and availability, but recovery evidence requires controlled reconstruction or equivalent configuration replay plus validation.

Future source authority should continue moving toward infrastructure/configuration-as-code without embedding secret values.

### Supabase Storage

Storage metadata is not equivalent to object-byte recovery. A complete `STORAGE` scope requires an explicit object export/retention/restore strategy even when the current object count is zero.

### Supabase Auth

Database state and Auth platform configuration must be treated separately. Provider settings and external OAuth/SMTP/key dependencies belong to `IDENTITY_CONFIG` and cannot be assumed from a database restore.

## Current PR integration boundary

PR #261 contained the portable-backup and local-restore implementation. Its original exact head passed the required quality, security, revalidation, certification and clean reconstruction checks, but `main` later advanced through the native runtime work. The stale merge was correctly rejected by protected-branch enforcement.

Architecture rule:

**Recovery work must be synchronized onto the latest runtime contract state before merge. Do not bypass protected checks using evidence from an older base.**

The branch was subsequently synchronized with current `main`. The synchronized head `4292c027a1a0ddc0dcaa36fb1ab32925e052c54e` passed the protected gates and Recovery Assurance, and PR #261 merged as `e985d59f22801092e8f6de5d705e2b4c54131e2a`. Portable backup and loopback-only local restore are now canonical repository capabilities.

## External evidence architecture

Two capabilities intentionally remain partial because their truth depends on external enterprise data.

### Field-level lineage

The lineage architecture supports atomic ingestion, transformation identities, field mappings, governed audit, impact traversal, and agent consumption.

What remains absent is genuine source transformation metadata.

Architectural principle:

**Unknown lineage is preferable to synthetic lineage presented as fact.**

### Enterprise governance knowledge

The architecture supports governed intake, review, approval, semantic indexing/pruning, retrieval, and audit.

What remains absent is a genuine enterprise-authoritative source document approved for use.

Architectural principle:

**Bootstrap or reference content must never be promoted to enterprise authority merely to satisfy an acceptance gate.**

## UX architecture assessment

The application architecture currently contains many domain routes and workspaces. This is functionally rich but creates fragmented navigation and inconsistent presentation.

A notable divergence exists between:

- the executive dashboard shell/navigation and visual system
- the role-landing shell and its soft/neumorphic visual system
- individual operational modules

The next architecture layer should therefore introduce a shared UX foundation rather than continuing to let each module behave as a semi-independent application.

## Proposed DataNexus UX Foundation architecture

### 1. Unified application shell

Create one persistent shell for authenticated product areas with:

- DataNexus identity
- organization/project/source context
- primary navigation
- global search
- governance inbox/notifications
- role/persona context
- user/account controls
- breadcrumb / current object context

Individual modules should supply content and module-specific actions rather than recreating top-level chrome.

### 2. Global project/context provider

Introduce a single governed source of UI context for:

- organization
- project
- source/connection where relevant
- effective persona/role
- capability/permission hints

The current project must be visually obvious. Destructive or high-impact actions must include target context.

### 3. Search architecture

The current “Search DataNexus” presentation should become a real searchable command surface.

Global search should support at least:

- datasets and fields
- glossary terms
- owners/stewards
- policies and governance documents
- lineage nodes
- remediation issues
- agent runs/recommendations

Search results should preserve project and authorization boundaries.

### 4. Governance inbox architecture

Create a unified work queue for human attention:

- approvals
- ownership/stewardship requests
- unresolved findings
- failed jobs
- SLA/observability alerts
- remediation deadlines
- AI recommendations awaiting human review

The inbox should be evidence-backed, role-aware, and link directly to the affected object and next action.

### 5. Task journey orchestration

Primary product journeys should span modules without requiring the user to understand route topology.

Canonical example:

`Connect source -> Discover assets -> Profile -> Review findings -> Assign/remediate -> Re-run/verify -> Certify`

Cross-module deep links should preserve object identity and return context.

### 6. Async operation experience

Discovery, profiling, quality checks, semantic indexing, recovery operations, and AI agent runs should share a consistent job-state model:

- queued
- running
- completed
- failed
- cancelled where supported

The UI should show:

- progress/state
- elapsed time
- current phase when available
- retry/recovery action
- evidence/output link
- clear distinction between provider failure, validation failure, and policy denial

### 7. AI trust surface

AI-generated output must display provenance and governance state.

Recommended fields include:

- evidence sources used
- confidence or limitation statement
- whether output is recommendation, hypothesis, or verified fact
- required human approval
- action execution state
- final observed outcome

This extends the backend AI governance truth boundary into the UI.

### 8. Standard application states

Define reusable patterns for:

- loading
- no data yet
- no permission
- partial data
- provider unavailable
- retryable failure
- policy-blocked action
- destructive confirmation
- background job in progress

Raw provider/database error messages should not be the default user experience.

### 9. Accessibility and responsive architecture

The shared design system should be reviewed against WCAG 2.2 AA.

Particular attention is required for:

- keyboard navigation
- visible focus
- semantic controls
- color contrast
- neumorphic/low-contrast surfaces
- zoom and reflow
- dense governance tables
- lineage graphs
- large filter/control regions
- reduced motion

Responsive behavior should be designed intentionally for task completion, not treated only as CSS wrapping.

## Persona architecture

The UI should optimize around user intent:

### Executive

Primary question: **What is at risk and what needs my decision?**

### Data Owner

Primary question: **What assets, quality risks, and certifications need my attention?**

### Data Steward

Primary question: **What must I classify, approve, own, or remediate?**

### Engineer / Platform Operator

Primary question: **What failed, why, what is impacted, and what should I do next?**

### Governance / Risk

Primary question: **Are controls operating, where are the gaps, and where is the evidence?**

The shared shell can remain consistent while landing content, inbox prioritization, and default views vary by persona.

## Architectural priorities from this checkpoint

### Immediate

1. Synchronize PR #261 with current `main` / PR #262 changes.
2. Re-run protected CI on the synchronized exact head.
3. Merge #261 only when all required checks are green.
4. Execute the first trusted encrypted backup and local restore rehearsal.

### Next platform assurance increment

5. Add durable off-provider encrypted backup retention and compact evidence retention.
6. Extend recovery validation into Storage, Identity/Auth, application configuration, Edge runtime, external dependencies, and end-to-end service checks.
7. Preserve fail-closed RPO/RTO evaluation until authoritative timings exist.

### Next product architecture increment

8. Implement the DataNexus UX Foundation:
   - unified shell
   - project context provider/switcher
   - real global search
   - governance inbox
   - standard app states
   - guided onboarding
9. Refactor major user journeys to be task-oriented and cross-module.
10. Add UX/product telemetry that measures successful user outcomes rather than only technical uptime.

## Architectural invariants

The following principles should remain stable unless superseded by a formal ADR:

- Governance facts require governed evidence.
- AI suggestions are not equivalent to verified facts.
- Recovery readiness cannot be inferred from documentation alone.
- Schema reconstruction is not database restoration.
- Database restoration is not full service recovery.
- Provider rollback is not disaster recovery.
- Secrets and plaintext production backups never belong in Git.
- Production migration history is not rewritten for cosmetic consistency.
- Production runtime source/configuration must be governed when reconstruction depends on it.
- External-data acceptance gates stay partial until real external evidence exists.
- Protected-branch checks apply to the exact merge head and current base.
- User experience is now a first-class architecture layer, not a final polish phase.
