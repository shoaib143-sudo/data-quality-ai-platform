# Cloudflare R2 prerequisite audit

Date: 2026-09-16

## Executive finding

The current live Supabase object-storage footprint is not the dominant capacity consumer. The `dataset-files` bucket contains 4 objects totalling approximately 6.3 MB, while `governance-artifacts` is empty. The Postgres database is approximately 393 MB and `governance.governance_risk_prediction_events` is approximately 242 MB.

R2 remains appropriate for stopping future file/object growth, but database retention must be treated as a separate capacity workstream.

## Live database evidence

- Database: `postgres`
- Connected role used for audit: `postgres`
- Database size: approximately 393 MB
- `governance.governance_risk_prediction_events`: approximately 242 MB
- Rows in `governance.governance_risk_prediction_events`: 134,868
- Observed event window: 2026-09-06 through 2026-09-16
- `REFRESHED` events: 134,828
- Snapshot payload attributable to `REFRESHED` rows: approximately 160 MB
- `profiling.profile_metrics`: approximately 9.3 MB

## Live object-storage evidence

| Bucket | Object count | Approximate bytes |
| --- | ---: | ---: |
| `dataset-files` | 4 | 6,441,680 |
| `governance-artifacts` | 0 | 0 |

## Existing upload path

The current file onboarding endpoint is `app/api/datasets/source/upload-file/route.ts`.

Current positive controls already present:

- project-scoped authorization using `source.manage`
- zero-byte rejection
- configurable maximum file size
- extension allowlist
- filename normalization
- project-scoped canonical path validation
- non-upsert signed uploads
- randomized object paths

Current provider coupling:

- hard-coded bucket `dataset-files`
- direct `admin.storage.from(...).createSignedUploadUrl(...)`
- direct `admin.storage.from(...).remove(...)`
- returned `sourceUri` embeds the Supabase bucket/path convention

These are the principal integration points to replace with the provider-neutral storage layer.

## Prerequisites implemented on audit branch

1. Added provider-neutral storage contracts under `lib/storage/contracts.ts`.
2. Added `scripts/verify-r2-prerequisites.mjs` to fail closed when mandatory R2 server-side configuration is missing or accidentally exposed via `NEXT_PUBLIC_*` variables.
3. Preserved the existing authorization boundary and did not modify production upload behavior.

## Mandatory prerequisites before R2 write cutover

- Create environment-specific R2 buckets.
- Configure server-only credentials:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_DATASETS`
- Do not expose R2 credentials through `NEXT_PUBLIC_*` variables.
- Implement the R2 adapter behind `ObjectStorage`.
- Implement the Supabase adapter behind the same contract for rollback and legacy reads.
- Add the application-owned storage object registry.
- Update Dataset Version persistence to reference provider-neutral storage objects.
- Implement integrity verification and reconciliation before marking objects READY.
- Keep production reads dual-provider during migration.
- Prove rollback before changing the default write provider.

## Separate urgent database-capacity action

R2 does not solve the current largest database consumer. Before or in parallel with R2 implementation, investigate why `REFRESHED` risk-prediction events are being written at very high frequency and define retention/compaction rules. Do not delete those rows until governance, audit, recovery, and historical-evidence requirements are documented and validated.

## Safe sequencing

1. Stop additional object-storage growth by introducing R2 for new file uploads after adapter and validation gates pass.
2. Keep legacy Supabase Storage reads available.
3. Migrate existing objects only after integrity tooling is operational.
4. Address the risk-prediction event growth as an independent Postgres retention workstream.
5. Delete neither legacy objects nor historical database events until retention and rollback gates pass.
