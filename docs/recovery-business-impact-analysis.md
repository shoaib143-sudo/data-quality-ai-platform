# DataNexus AI Recovery Business Impact Analysis

This document is the business-impact baseline for recovery planning. It complements `docs/recovery-assurance-v2.md` and exists to keep technical recovery objectives tied to actual service impact rather than to backup tooling alone.

## Status and authority

The currently enforced technical recovery objectives are:

- target RPO: 60 minutes
- target RTO: 240 minutes
- full recovery drill interval: 90 days

These are operational targets already represented in the recovery policy. They are not evidence that the objectives are currently achieved. Recovery Assurance must continue to fail closed until measured evidence demonstrates that the required recovery scopes meet these objectives.

A business owner may later approve stricter objectives. This document must not silently relax the database recovery policy merely to make readiness pass.

## Critical business capabilities

### Tier 0: governance system of record

Includes Supabase PostgreSQL data that represents catalog, profiling, governance, audit, authorization relationships, recovery evidence, execution state, AI governance controls, and other canonical persisted state.

Business impact of loss or corruption:

- loss of authoritative governance evidence
- inability to prove historical controls or decisions
- incorrect catalog, quality, ownership, lineage, or certification state
- inability to reconstruct application behavior from trusted state

Recovery priority: first.

### Tier 0: identity and authorization

Includes Supabase Auth users plus application-side organization/project membership, RLS policy behavior, OAuth/SSO settings where configured, redirect settings, API/JWT keys, SMTP and other identity-provider configuration.

Business impact of loss or corruption:

- users cannot authenticate
- users may be denied legitimate access
- incorrect authorization reconstruction could expose tenant data

Recovery priority: first, alongside the governance system of record.

### Tier 1: application and worker runtime

Includes the Vercel application, worker cron, Supabase Edge Functions, Render OPA, OTEL collector, JDBC bridge, and other executable services required to operate DataNexus AI.

Business impact of loss:

- UI and API outage
- profiling, orchestration, governance automation, or AI execution becomes unavailable
- scheduled work stops

Recovery priority: after trusted state and identity are recoverable, before service cutover.

### Tier 1: object storage

Includes Supabase Storage bucket configuration, object metadata, policies and object bytes.

Business impact depends on whether objects are present. A database backup only protects Storage metadata, not the object bytes themselves. The Storage scope therefore remains independently required even when a database restore succeeds.

Recovery priority: before declaring a recovered service ready whenever production objects exist.

### Tier 1: external decision and integration dependencies

Includes OPA, model providers, retrieval/search services, email/identity providers and source-system connectors.

Business impact of loss:

- policy enforcement or governed AI execution may fail closed
- catalog discovery or profiling may become partially unavailable
- notifications or external integrations may not function

Recovery priority: restore or prove a safe degraded mode before service cutover.

### Tier 2: telemetry and secondary observability

Includes OTEL export and non-authoritative operational telemetry.

Business impact of loss:

- reduced diagnosis, auditability and SLO evidence
- application state may remain intact, but recovery confidence is lower

Recovery priority: restore before full operational certification where telemetry is a required recovery dependency.

## Recovery impact dimensions

Every recovery test and architecture change must consider:

- confidentiality: a recovery process must not expose production credentials or tenant data
- integrity: restored data, policies, RLS, functions, audit chains and configuration must match trusted evidence
- availability: the platform must be usable, not merely have a restored database
- legal/audit evidence: immutable governance and audit records must remain verifiable
- financial impact: avoid unnecessary standing DR infrastructure while preserving truthful recovery evidence
- operational impact: workers, queues, scheduled jobs and external integrations must resume safely without duplicate or uncontrolled actions

## Recovery objectives and measurement

RPO is measured from an authoritative recoverable point, such as a completed portable backup or managed PITR point, relative to the incident time. An operator-entered estimate is not authoritative evidence.

RTO starts when recovery begins and ends only after the required service-validation checks pass. Database restore duration is only a phase metric.

The current 60-minute RPO is therefore a target, not an achieved service level. On the current Supabase Free plan, the portable backup cadence must eventually be frequent enough to meet that target before Recovery Assurance may claim compliance.

## Maximum tolerable disruption

A separate business-approved maximum tolerable disruption has not yet been formally approved. Recovery Assurance must not invent one. Until business approval exists, the enforced 240-minute RTO remains the operative technical recovery objective and any inability to meet it is reported as a recovery gap.

## Recovery sequencing

1. protect evidence and freeze unsafe writes where possible
2. restore or reconstruct trusted database state
3. reconstruct identity and authorization configuration
4. restore Storage configuration and object bytes where applicable
5. reconstruct Edge Functions and application/runtime infrastructure
6. verify external dependencies or safe degraded behavior
7. run service validation including auth, catalog, profiling, queue/worker, governance and AI routing
8. reconcile writes and events created during the incident window
9. declare recovery complete only when required scopes pass and policy evaluates to `READY`

## Reassessment triggers

Reassess this BIA after any of the following:

- a material change to the data model or critical schemas
- introduction of production Storage objects
- new identity providers or authentication modes
- new external stateful dependencies
- new regulatory or contractual recovery commitments
- major infrastructure/provider changes
- a recovery drill failure or missed RPO/RTO
- significant growth in production data volume

## Ownership and approval

Engineering owns technical recovery implementation and evidence. Business approval is required for any change that weakens RPO/RTO objectives or changes accepted business impact. Recovery tooling must never silently downgrade a failed objective to make readiness green.
