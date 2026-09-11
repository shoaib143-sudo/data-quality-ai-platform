# DataNexus Recovery Assurance v2

This document defines the production recovery contract for DataNexus AI. Recovery readiness is broader than a database restore: the platform is recoverable only when required data, application, configuration, storage, identity, infrastructure, and runtime dependencies have been reconstructed and validated.

## Recovery principles

- Prefer managed Supabase backup/PITR for operational recovery when it is actually available and funded.
- Maintain a portable logical database export for provider-independent recovery and forensic validation.
- Never restore destructively into the production database during a rehearsal.
- Treat deployment rollback as distinct from disaster recovery.
- Recovery evidence must survive loss of the source database, so every drill must produce an external evidence artifact in addition to durable governance records.
- Recovery readiness fails closed when any required scope is stale, missing, failed, or outside its RPO/RTO objective.

## Current zero-additional-cost posture

The current Supabase organization is on the Free plan and no paid recovery branch or PITR add-on is authorized. The operational recovery package therefore uses a zero-additional-cost posture until that constraint changes:

- portable logical exports are the database portability mechanism;
- source-controlled migrations, Edge Functions and platform configuration are the reconstruction authority;
- clean database reconstruction remains valid reconstruction evidence but is not a restored production-data backup;
- no workflow may claim managed PITR, `RESTORED`, or `READY` evidence without a real supported recovery event;
- the 60-minute RPO remains the target even when the current backup cadence cannot yet prove it;
- the recovery system must report that gap rather than weakening the target.

The portable backup contract is defined in `infra/recovery/portable-backup-contract.json`. Database exports must be kept outside the repository, encrypted at rest, integrity checked, and retained independently of the Supabase project. Storage object bytes are a separate recovery boundary and are never inferred from database backup success.

## Required recovery scopes

The minimum scopes for a `READY` result are:

1. `DATABASE`
   - schema and data restoration
   - extensions, functions, triggers, constraints, indexes, grants, and RLS posture
   - canonical governance audit-chain verification
   - critical-record parity and deterministic signatures
2. `STORAGE`
   - buckets and object metadata
   - storage object bytes, keys, sizes, and integrity checks
   - bucket configuration and policies
3. `IDENTITY_CONFIG`
   - Auth users in the database recovery boundary
   - OAuth/SSO, redirect, SMTP, JWT/API-key, and identity configuration inventory
4. `APPLICATION_CONFIG`
   - Vercel project topology, domains, cron/runtime settings, and secret-name inventory
   - Render services and infrastructure topology, configuration inventory, and service health
5. `EDGE_RUNTIME`
   - Supabase Edge Functions and other executable platform components
6. `DEPENDENCIES`
   - OPA, telemetry/OTEL, AI/model providers, retrieval/search, email/identity providers, and other production dependencies
7. `SERVICE_VALIDATION`
   - health/readiness endpoints
   - authentication
   - catalog and profiling critical paths
   - queue/worker processing
   - governance and AI-routing smoke checks

## RPO and RTO

RPO must be derived from authoritative recovery-point evidence, such as the selected PITR timestamp or backup creation timestamp, relative to the simulated incident time. An operator-provided number may be retained only as supplementary evidence and must not be considered authoritative by itself.

RTO starts when recovery begins and ends only after the service-validation scope passes. Database restoration time may be captured as a phase metric but is not the platform RTO.

## Recovery evidence

Each rehearsal must retain:

- source environment fingerprint without credentials
- isolated recovery target fingerprint without credentials
- source commit SHA and workflow run ID when available
- recovery mechanism and recovery-point timestamp
- database dump checksum for portable exports
- schema and critical-data fingerprints
- scope-level results and timestamps
- phase timings and measured RPO/RTO
- Vercel deployment/project identifiers used for validation
- Render service identifiers used for validation
- verification output and failure reason

Do not store secret values, access tokens, database credentials, OAuth client secrets, signing keys, or other sensitive values in drill evidence.

## Recovery mechanisms

### Supabase

Operational recovery should exercise the same managed backup/PITR mechanism intended for an incident when that mechanism is available. On the current Free-plan posture, a portable logical export plus version-controlled reconstruction is the available zero-additional-cost path. A logical export remains portability evidence and does not become managed PITR evidence by naming convention.

A database-only recovery does not prove recovery of Storage object bytes, Edge Functions, Auth configuration, Realtime configuration, or external project settings.

Supabase Edge Functions must have source authority in `supabase/functions` and security/dependency configuration in `supabase/config.toml`. A live Dashboard-only function is a recovery gap because Dashboard edits are not a version-control system.

### Vercel

Vercel deployment rollback is an application rollback mechanism, not a database or platform disaster-recovery mechanism. Recovery validation must independently confirm project configuration, domains, cron/runtime settings, environment-variable names, and a healthy production deployment.

### Render

Render service rollback or redeploy is not sufficient for stateful recovery. Service topology and non-secret configuration should be reproducible from version-controlled infrastructure definitions where practical. Secret values remain outside source control but their required names and ownership must be documented.

## Migration history reconciliation

Repository migration filenames and the live Supabase migration registry can differ when a migration is applied through management tooling that records an application timestamp. Known, verified aliases are recorded in `infra/recovery/migration-history-aliases.json`.

Do not rename an already shipped repository migration merely to match a live timestamp and do not rewrite production migration history for cosmetic alignment. Recovery tooling must recognize the documented alias and continue forward-only from the canonical repository migration set.

## Rehearsal cadence

- Run a full recovery assurance drill at least every 90 days unless a stricter project policy applies.
- Re-run affected scopes after material database, storage, authentication, infrastructure, or architecture changes.
- Run the static recovery-assurance contract on every pull request that changes recovery-sensitive files.
- Keep a manual workflow entry point for controlled rehearsals.
- Static contract verification is not a substitute for an actual backup/export cadence capable of meeting the 60-minute RPO.

## Incident decision tree

1. Classify failure: bad application release, bad migration, data loss/corruption, provider outage, secret/config loss, or dependency outage.
2. Use deployment rollback only when state is healthy and the incident is isolated to application code/deployment.
3. Use managed database PITR/backup recovery for data loss or corruption where applicable and available.
4. Use portable export recovery when provider-independent restoration is required or managed recovery is unavailable.
5. Reconstruct configuration and runtime scopes.
6. Run service-validation checks before cutover.
7. Record evidence and reconcile writes/events produced during the incident window.
8. Do not mark recovery complete until all required scopes pass and the recovery-readiness policy evaluates to `READY`.

## Abort conditions

Abort a rehearsal immediately if the target resolves to production, the source and recovery target are identical, destructive confirmation is absent, required evidence cannot be persisted safely, or recovery would expose credentials/secrets in logs or artifacts.
