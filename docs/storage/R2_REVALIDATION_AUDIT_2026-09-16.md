# R2 revalidation and adversarial audit - 2026-09-16

## Current release position

Production cutover remains blocked until live R2 conformance, browser CORS, provider-neutral profiling reads, regression, and rollback gates pass. `STORAGE_DEFAULT_PROVIDER` continues to default to `supabase`.

## Completed architecture and security checks

- Provider-neutral `ObjectStorage` contract exists.
- Supabase and R2 adapters implement the same application contract.
- R2 credentials remain server-side only.
- R2 endpoint must match the configured account ID and HTTPS S3 endpoint.
- R2 adapter rejects buckets outside configured `R2_BUCKET`.
- R2 references are constrained to configured `R2_PREFIX`.
- Object-key traversal and malformed segments are rejected.
- Presigned PUT authorizations bind Content-Type when supplied.
- Signed URL expiry is bounded.
- Server-side unsupported request body types fail closed instead of being signed as empty payloads.
- Upload cleanup never trusts a caller-supplied bucket.
- Dataset upload authorization remains project-authorized.

## Provider-neutral storage registry

Implemented and applied to the live Supabase project:

- `catalog.storage_objects`
- RLS enabled
- project-member SELECT policy
- project-admin INSERT / UPDATE / DELETE policies
- unique `(provider, bucket, object_key)` identity
- state machine covering PENDING through READY / FAILED / QUARANTINED / DELETED
- expected and observed size fields
- content type, ETag and optional SHA-256 fields
- creator and owner metadata
- supporting indexes
- `catalog.dataset_versions.storage_object_id` foreign key with `ON DELETE RESTRICT`

Live validation confirmed the registry table exists, the Dataset Version link exists, RLS is enabled, and four policies are installed.

Supabase security advisor did not report a storage-registry RLS finding after the migration. Supabase performance advisor identified the creator foreign key as initially unindexed; a follow-up migration added `idx_storage_objects_created_by`.

## Upload lifecycle implemented

The dataset upload authorization route now creates a registry row before issuing storage authorization:

`PENDING -> UPLOADING`

Authorization failures transition the registry row to `FAILED`.

A completion endpoint now performs server-side storage verification:

`UPLOADING -> VERIFYING -> READY`

Verification checks:

- object exists via HEAD
- observed size matches authorized size
- observed Content-Type matches the authorized Content-Type when both are available
- ETag and observed size are persisted as metadata

Failures transition to `FAILED` or `QUARANTINED` depending on the integrity condition. READY completion is idempotent. Deleted and quarantined rows fail closed.

## CI assurance

A dedicated `Storage R2 Assurance` workflow runs storage contract, negative, and adversarial guards. The first hardened suite passed 12/12 tests. The suite is now expanded to cover registry creation and completion lifecycle behavior.

## Live R2 conformance probe

A preview-only, fixed-input conformance endpoint is present on the R2 branch. It is restricted to the designated Vercel preview branch and performs:

`PUT -> HEAD -> GET -> content comparison -> DELETE -> HEAD absent`

The probe accepts no caller-defined bucket or object key and performs best-effort cleanup on failure. Both GET and POST invoke the same fixed-input probe so the deployment connector can execute it once the latest preview is READY.

## Remaining release gates

1. Live R2 conformance probe passes.
2. Browser direct-upload CORS passes from the intended application origin.
3. Provider-neutral FILE row access supports R2-backed dataset versions.
4. Dataset registration links a READY storage object to `dataset_versions.storage_object_id`.
5. Full Supabase-backed versus R2-backed profiling regression passes.
6. Live negative/failure injection passes, including missing object, size mismatch, Content-Type mismatch, expired/tampered authorization, duplicate completion and interrupted workflow recovery.
7. Real-provider rollback drill passes.
8. Coordinated database + object-store recovery drill passes.

No production object migration or Supabase Storage deletion is authorized before these gates pass.
