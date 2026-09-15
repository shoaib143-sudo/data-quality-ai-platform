# Production operating state and governance boundaries — 2026-09-15

## Status

Accepted production operating state for the current DataNexus AI architecture.

This document records the implemented architecture after the September 2026 hardening and certification program. It does not introduce a redesign. Existing ADRs remain authoritative for their respective domains; this record captures the cross-cutting invariants that subsequent changes must preserve.

## Architecture invariants

### 1. Evidence is not authority

Automated profiling, retrieval, evaluation, backtesting, shadow evaluation, prediction, recommendations, drift observations, and continuous-learning evidence may inform governed decisions but do not independently grant production execution, promotion, retraining, policy mutation, or lifecycle approval authority.

Human review provenance and current authorization remain required wherever the existing governed boundary requires them. Historical memory or prior approval cannot substitute for current authority.

### 2. Production AI adaptation remains fail closed

Continuous learning is evidence-driven and descriptive unless a separately governed action is explicitly authorized. Automatic retraining, automatic promotion, autonomous production model mutation, and automatic execution from predictive or prescriptive output remain disabled unless a future reviewed architecture decision explicitly changes that policy.

### 3. Privileged database execution is an explicit allowlist

Authenticated `SECURITY DEFINER` execution is not an implicit capability. The application-schema privileged surface is verified against the reviewed allowlist.

Current reviewed authenticated surface:

- `app_private.is_org_admin(uuid)`;
- `app_private.is_org_member(uuid)`;
- `app_private.is_project_admin(uuid)`;
- `app_private.is_project_member(uuid)`;
- `agent.resolve_runtime_interrupt(uuid,text,text,jsonb)`;
- the separately governed recovery-administration RPC already covered by the database API security posture verifier.

`app_private` must remain outside the PostgREST exposed schema set. Anonymous execution of membership helpers and the runtime-interrupt resolver must remain denied. New authenticated privileged functions in governed application schemas are release failures until explicitly reviewed and incorporated into the governed contract.

### 4. Restricted privileged functions use explicit dependency resolution

`SECURITY DEFINER` functions must not depend on permissive search paths. Extension calls used beneath restricted search paths must be schema-qualified.

The synthetic governance integration suite therefore resolves pgcrypto through `pg_catalog.encode(extensions.digest(...))` while retaining its restricted search path. The suite remains service-role-only and is not a browser RPC.

### 5. Synthetic verification evidence never becomes production-learning authority

Synthetic datasets, fixtures, reconstructed databases, and synthetic governance-suite outputs exist to verify contracts and failure behavior. They must remain identifiable as synthetic and must not be counted as real production learning evidence, promotion evidence, model-selection authority, or governance approval evidence.

### 6. Clean reconstruction is a release invariant

A release is not certified solely because the live production database happens to work. Repository migration history must reconstruct a clean database and reproduce the governed security and authorization posture.

Where historical released state cannot be represented safely by mutating old migrations, disposable reconstruction helpers may reconcile replay prerequisites. Such helpers must affect reconstruction only, remain fail closed, and must not rewrite production history or broaden runtime privileges.

### 7. Exact-head certification precedes merge

Security-sensitive and production-relevant changes require validation against the exact pull-request head. Applicable release evidence includes:

- Quality Gate;
- V6 Operational Certification;
- clean database reconstruction;
- production/runtime SLO checks;
- CodeQL and dependency security;
- production security posture;
- P0–P5 revalidation;
- recovery assurance;
- release governance;
- domain-specific regression and negative/failure-case gates.

A stale successful run is not valid evidence for a moved head. Required checks must not be weakened simply to allow merge.

### 8. Repository workflows use least privilege

Secrets with production or service-role authority must be scoped to the smallest workflow step that consumes them. Workflow-level or job-level exposure of sensitive credentials is rejected by repository-governance tests unless a separately reviewed requirement explicitly justifies it.

GitHub Actions references remain immutable/pinned, workflow permissions remain explicit, and repository-controlled settings policy is versioned in the repository.

### 9. Account control-plane settings remain outside application authority

Controls such as Supabase Auth leaked-password protection and GitHub administrative settings are not to be simulated through application code or database grants. When the connected engineering integrations cannot mutate those account-level controls, the item is recorded as `BLOCKED_EXTERNAL` with the exact administrator action required.

An external administration blocker does not invalidate independent application implementation that has otherwise passed its certification requirements, but it must not be mislabeled as completed.

## Current production validation

The production privileged-function verifier reports a valid allowlist, no unexpected authenticated `SECURITY DEFINER` functions, an unexposed `app_private` schema, no anonymous membership-helper execution, and an authorization-guarded runtime interrupt resolver.

The production synthetic governance integration suite returns `PASSED` with all checks true and rolls its synthetic validation mutations back after execution.

## Change policy from this point

Future work must extend this architecture rather than rebuild it by default. A redesign is justified only by concrete evidence that an existing boundary is incorrect, insecure, inconsistent, or materially below an approved requirement.

Changes to authority, promotion, automated retraining, execution eligibility, privileged database surfaces, synthetic-evidence eligibility, or required release gates require explicit architectural review and corresponding negative/failure-case certification.