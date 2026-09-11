# DataNexus Portable Backup and Local Restore

This procedure implements the current zero-additional-cost database recovery path for DataNexus AI. It follows Supabase's current CLI backup/restore guidance while keeping DataNexus recovery claims fail closed.

## Purpose

The goal is to prove that the production database can be exported with Supabase-compatible filtering, encrypted before long-term retention, restored into an isolated local Supabase/Docker environment, and validated against deterministic integrity evidence.

This path is **database recovery evidence only**. It does not prove managed PITR, Storage object byte recovery, Auth provider configuration recovery, Vercel/Render reconstruction, dependency recovery, or service-level RTO.

## Why Supabase CLI is authoritative for the portable export

Use `supabase db dump`, not raw `pg_dump`, for the governed portable backup. Supabase's CLI applies provider-specific filtering for managed schemas and reserved roles. The export set is:

- `roles.sql` using `--role-only`
- `schema.sql`
- `data.sql` using `--use-copy --data-only`
- `history_schema.sql` for `supabase_migrations`
- `history_data.sql` for `supabase_migrations`

`storage.buckets_vectors` and `storage.vector_indexes` remain excluded from the data dump in line with Supabase's migration guidance.

## Trusted execution boundary

A production backup may contain production user, governance, catalog, profiling, and audit data. Therefore:

- do not create production backups on a GitHub-hosted runner;
- run the backup from a trusted operator machine or an explicitly approved self-hosted runner;
- keep the plaintext SQL files only in the script's temporary working directory;
- never commit plaintext or encrypted production backup artifacts to Git;
- never store database credentials or the private decryption identity in the repository.

The encrypted artifact must be copied to an approved off-provider location after creation. The backup script intentionally reports `offProviderCopyVerified: false` because creating a local file is not evidence that an independent copy exists.

## Encryption

Portable backup bundles use `age` recipient-based authenticated encryption. `RECOVERY_AGE_RECIPIENT` is the public recipient and may be supplied to the backup process. The corresponding private age identity must be kept outside the repository and supplied only to the restore process through `RECOVERY_AGE_IDENTITY_FILE`.

The backup process emits:

- `<backup-id>.datanexus-backup.tar.gz.age`
- `<backup-id>.datanexus-backup.tar.gz.age.evidence.json`

The sidecar contains only non-secret evidence such as SHA-256, timestamps, backup identifier, source project reference, and recovery truth-boundary flags.

## Backup consistency and RPO truth boundary

Supabase's documented CLI procedure creates roles, schema, data, and migration history through **separate dump operations**. Those operations do not share one exported PostgreSQL transaction snapshot.

DataNexus therefore records integrity fingerprints before and after the export window. If the governed source fingerprints change during that window, the local restore harness fails closed and the backup cannot be used as certified restore evidence.

Even when the source is stable across the export window, this mechanism does not claim a shared transactional snapshot. Consequently:

- `recoveryPointAt` remains `null`;
- the current 60-minute RPO remains a target rather than a proven service level;
- a real authoritative recovery point requires stronger timing/backup evidence than this multi-dump workflow alone provides.

Do not weaken the 60-minute objective to make recovery status green.

## Creating an encrypted portable backup

Prerequisites:

- Supabase CLI
- Docker-compatible runtime
- PostgreSQL `psql`
- `age`
- `tar`
- production database connection string for the governed Supabase project

Example environment:

```bash
export SOURCE_DATABASE_URL='postgresql://...'
export RECOVERY_AGE_RECIPIENT='age1...'
export RECOVERY_BACKUP_OUTPUT_DIR="$HOME/datanexus-recovery"

node scripts/recovery/create-portable-backup.mjs
```

The script verifies that the database URL identifies the governed Supabase project before exporting.

After successful creation, copy both the encrypted artifact and evidence sidecar to the approved off-provider backup location. That independent retention action must be recorded separately before off-provider protection can be claimed.

## Local Supabase restore rehearsal

The restore harness can use either:

1. an ephemeral Supabase local stack started by the script, or
2. an operator-supplied loopback PostgreSQL URL for a disposable local Supabase/Docker instance.

The local Supabase environment is for recovery testing only. It must never be exposed publicly.

Example:

```bash
export RECOVERY_BACKUP_FILE="$HOME/datanexus-recovery/<backup>.datanexus-backup.tar.gz.age"
export RECOVERY_AGE_IDENTITY_FILE="$HOME/.config/age/keys.txt"
export ALLOW_LOCAL_RECOVERY_TARGET='YES_I_UNDERSTAND_THIS_REPLACES_LOCAL_RECOVERY_DATA'

node scripts/recovery/restore-portable-backup-local.mjs
```

When `RECOVERY_LOCAL_DATABASE_URL` is omitted, the script initializes a temporary Supabase work directory and starts a clean local stack with no DataNexus migrations. This avoids restoring production schema on top of the repository's already-replayed local migrations.

If supplying a target explicitly, the harness accepts only loopback hosts (`localhost`, `127.0.0.1`, or `::1`) and still requires explicit destructive confirmation.

## Restore validation

Before restoration, the harness verifies:

- encrypted artifact SHA-256 when the sidecar is present;
- backup identifier consistency;
- per-file byte size and SHA-256;
- source stability across the original export window.

The restore then follows Supabase's documented ordering:

1. roles
2. schema
3. `SET session_replication_role = replica`
4. data
5. migration-history schema and data

For a pre-Postgres-17 local target, the harness may remove the Postgres 17-only `SET transaction_timeout` statement from the derived restore copy after validating the original encrypted backup hashes. Any such transformation is recorded in the restore evidence.

Post-restore validation compares deterministic fingerprints for critical DataNexus content and governed database objects, including:

- catalog datasets and versions
- profiling runs and metrics
- governance audit events and semantic embeddings
- Auth users
- Storage buckets and object metadata
- owned schema columns
- RLS policies
- database functions
- triggers
- grants
- migration history
- required extensions
- governance audit-chain validity

A mismatch fails the rehearsal.

## What a passing local rehearsal means

A passing rehearsal proves that the `DATABASE` scope has a zero-cost encrypted portable export and isolated local restore path with deterministic integrity comparison.

It does **not** prove:

- Storage object bytes, even if Storage metadata restored successfully;
- external identity provider configuration, SMTP, JWT/key rotation, or redirect settings;
- Edge Function runtime secrets;
- Vercel or Render reconstruction;
- external provider/dependency recovery;
- authoritative 60-minute RPO;
- service-ready 240-minute RTO;
- full-platform `READY`.

Those scopes remain independently fail closed under Recovery Assurance v2.
