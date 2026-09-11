# DataNexus Full-Platform Recovery Scopes

This runbook operationalizes the six non-database Recovery Assurance scopes. It complements the portable database backup and local restore procedure.

## Truth boundary

Source-controlled reconstruction evidence is not restore evidence. A scope may be documented or reconstructible without being `RESTORED`. Full `READY` requires real evidence for every required scope plus authoritative RPO/RTO timing.

## STORAGE

Recovery must preserve bucket definitions, policies, metadata, and object bytes.

The database backup covers bucket/object metadata only. Object bytes require their own inventory and restore evidence. If an authoritative production inventory shows zero objects, the object-byte restore portion may be recorded as not applicable for that specific rehearsal, but only with the zero-object inventory attached to the evidence. This exception must never be inferred from an empty local target.

Required validation:

- production bucket inventory captured;
- object count and key/size/hash inventory captured when objects exist;
- bucket policies/configuration reconstructed;
- restored objects sampled or fully hash-compared according to volume;
- no database-only result may satisfy Storage object-byte recovery.

## IDENTITY_CONFIG

Database restoration can restore Auth rows, but external identity/platform settings remain separate.

Required inventory and validation:

- Auth user/session schema availability;
- enabled OAuth/SSO providers and redirect settings;
- SMTP dependency and sender configuration;
- required JWT/API-key names and rotation ownership;
- secret names present in the approved secret store;
- no secret values committed to Git or recovery evidence.

A successful Auth table restore does not prove OAuth, SSO, SMTP or key recovery.

## APPLICATION_CONFIG

Application recovery requires the governed Vercel and Render topology.

Vercel validation must cover:

- project identity;
- framework and Node runtime;
- required domains;
- worker cron route;
- required environment-variable names;
- healthy deployment.

Render validation must cover:

- OPA service;
- OpenTelemetry collector;
- JDBC bridge;
- region/runtime/build/start or Docker configuration;
- required environment-variable names;
- health/reachability after reconstruction.

Deployment rollback remains distinct from disaster recovery.

## EDGE_RUNTIME

All required Supabase Edge Functions must exist in source control and in `supabase/config.toml`.

Recovery validation requires:

- all required functions deployed;
- JWT verification policy matches source authority;
- import-map/dependency configuration matches source authority;
- required secret names are available;
- post-deploy invocation or health validation succeeds.

## DEPENDENCIES

Recovery requires the service to operate with its governed dependencies or approved fail-closed/fallback behavior.

Minimum dependency set:

- OPA;
- OpenTelemetry;
- JDBC bridge;
- AI model providers;
- retrieval/search providers;
- email/identity providers.

A dependency can pass only through successful validation or an explicitly governed fallback mode that preserves policy and user-facing truth.

## SERVICE_VALIDATION

Platform RTO ends only after the recovered service passes the required user journeys:

1. health/readiness;
2. authentication;
3. catalog read;
4. profiling execution;
5. queue/worker processing;
6. governance operation;
7. AI routing or governed provider fallback.

The resulting evidence must include the service-ready timestamp. Database restore completion alone is not the platform RTO.

## RPO/RTO objectives

Current objectives remain:

- RPO: 60 minutes
- RTO: 240 minutes

Neither objective becomes proven through static verification. RPO needs an authoritative recoverable-point timestamp. RTO needs recovery start and final service-ready timestamps.

## Current execution posture

This repository can verify reconstructibility and required evidence contracts without paid DR infrastructure. Real restore evidence still requires the trusted recovery execution boundary defined in the portable-backup runbook.

The system must continue to fail closed until the actual evidence exists.
