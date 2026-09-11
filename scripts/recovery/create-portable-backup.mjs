import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { collectRecoveryIntegrity, runBuffered, scalar } from './recovery-integrity.mjs'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optional(name) {
  return process.env[name]?.trim() || null
}

function sourceProjectRefFromUrl(raw) {
  const url = new URL(raw)
  const usernameMatch = url.username.match(/^postgres\.([a-z0-9]+)$/i)
  const directMatch = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
  return usernameMatch?.[1] ?? directMatch?.[1] ?? null
}

async function sha256File(path) {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

async function command(binary, args, options = {}) {
  return await runBuffered(binary, args, options)
}

async function toolVersion(binary, args = ['--version']) {
  const result = await command(binary, args)
  return (result.stdout || result.stderr).trim()
}

async function dump(supabaseBinary, sourceUrl, file, extraArgs = []) {
  await command(supabaseBinary, ['db', 'dump', '--db-url', sourceUrl, '-f', file, ...extraArgs])
}

function sameIntegrity(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function main() {
  const sourceUrl = required('SOURCE_DATABASE_URL')
  const ageRecipient = required('RECOVERY_AGE_RECIPIENT')
  const outputDir = resolve(optional('RECOVERY_BACKUP_OUTPUT_DIR') ?? 'recovery-backups')
  const supabaseBinary = optional('SUPABASE_CLI_BINARY') ?? 'supabase'
  const expectedProjectRef = JSON.parse(await readFile('infra/recovery/platform-manifest.json', 'utf8')).supabase?.projectRef
  const observedProjectRef = sourceProjectRefFromUrl(sourceUrl)

  if (!observedProjectRef || observedProjectRef !== expectedProjectRef) {
    throw new Error(`SOURCE_DATABASE_URL must identify the governed Supabase project ${expectedProjectRef}; observed ${observedProjectRef ?? 'unknown'}`)
  }

  await mkdir(outputDir, { recursive: true, mode: 0o700 })
  const workdir = await mkdtemp(join(tmpdir(), 'datanexus-portable-backup-'))
  const backupStartedAt = new Date().toISOString()
  const backupId = `${backupStartedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const encryptedPath = join(outputDir, `${backupId}.datanexus-backup.tar.gz.age`)
  const sidecarPath = `${encryptedPath}.evidence.json`
  const archivePath = join(workdir, 'portable-backup.tar.gz')

  try {
    const [supabaseVersion, dockerVersion, psqlVersion, ageVersion, sourceServerVersion, sourceDatabaseSize] = await Promise.all([
      toolVersion(supabaseBinary),
      toolVersion('docker'),
      toolVersion('psql'),
      toolVersion('age'),
      scalar(sourceUrl, 'show server_version;'),
      scalar(sourceUrl, 'select pg_database_size(current_database())::text;'),
    ])

    console.log('Collecting pre-export recovery integrity fingerprints')
    const integrityBefore = await collectRecoveryIntegrity(sourceUrl)

    const files = {
      roles: join(workdir, 'roles.sql'),
      schema: join(workdir, 'schema.sql'),
      data: join(workdir, 'data.sql'),
      historySchema: join(workdir, 'history_schema.sql'),
      historyData: join(workdir, 'history_data.sql'),
    }

    console.log('Creating Supabase-compatible portable logical export')
    await dump(supabaseBinary, sourceUrl, files.roles, ['--role-only'])
    await dump(supabaseBinary, sourceUrl, files.schema)
    await dump(supabaseBinary, sourceUrl, files.data, [
      '--use-copy', '--data-only',
      '-x', 'storage.buckets_vectors',
      '-x', 'storage.vector_indexes',
    ])
    await dump(supabaseBinary, sourceUrl, files.historySchema, ['--schema', 'supabase_migrations'])
    await dump(supabaseBinary, sourceUrl, files.historyData, ['--use-copy', '--data-only', '--schema', 'supabase_migrations'])

    console.log('Collecting post-export recovery integrity fingerprints')
    const integrityAfter = await collectRecoveryIntegrity(sourceUrl)
    const sourceStableDuringExport = sameIntegrity(integrityBefore, integrityAfter)

    const fileEvidence = {}
    for (const path of Object.values(files)) {
      const info = await stat(path)
      fileEvidence[basename(path)] = { bytes: info.size, sha256: await sha256File(path) }
    }

    const backupCompletedAt = new Date().toISOString()
    const manifest = {
      schemaVersion: 1,
      kind: 'DATANEXUS_PORTABLE_LOGICAL_BACKUP',
      backupId,
      recoveryMechanism: 'PORTABLE_LOGICAL_EXPORT',
      sourceProjectRef: expectedProjectRef,
      sourceServerVersion,
      sourceDatabaseSizeBytes: Number(sourceDatabaseSize),
      backupStartedAt,
      backupCompletedAt,
      recoveryPointAt: null,
      rpoEvidenceAuthoritative: false,
      consistency: {
        sourceStableDuringExport,
        mode: sourceStableDuringExport ? 'SOURCE_INTEGRITY_STABLE_ACROSS_EXPORT_WINDOW' : 'SOURCE_CHANGED_DURING_EXPORT_WINDOW',
        transactionalSnapshot: false,
        note: 'Supabase CLI roles/schema/data/history exports are separate dump operations. Stability across the export window is evidence, not a shared transactional snapshot.',
      },
      tooling: { supabaseVersion, dockerVersion, psqlVersion, ageVersion },
      files: fileEvidence,
      integrityBefore,
      integrityAfter,
      scopeBoundaries: {
        database: 'portable logical database export only',
        storageObjectBytes: 'not included',
        identityProviderConfiguration: 'not included',
        edgeRuntimeConfiguration: 'source controlled separately',
        fullPlatformReady: false,
      },
    }

    await writeFile(join(workdir, 'backup-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })

    console.log('Creating encrypted recovery bundle')
    await command('tar', ['-czf', archivePath, '-C', workdir,
      'roles.sql', 'schema.sql', 'data.sql', 'history_schema.sql', 'history_data.sql', 'backup-manifest.json'])
    await command('age', ['-r', ageRecipient, '-o', encryptedPath, archivePath])

    const encryptedStat = await stat(encryptedPath)
    const encryptedSha256 = await sha256File(encryptedPath)
    const sidecar = {
      schemaVersion: 1,
      kind: 'DATANEXUS_PORTABLE_BACKUP_EVIDENCE',
      backupId,
      sourceProjectRef: expectedProjectRef,
      recoveryMechanism: 'PORTABLE_LOGICAL_EXPORT',
      encryptedArtifact: {
        fileName: basename(encryptedPath),
        bytes: encryptedStat.size,
        sha256: encryptedSha256,
        encryption: 'age recipient encryption',
      },
      backupStartedAt,
      backupCompletedAt,
      sourceStableDuringExport,
      recoveryPointAt: null,
      rpoProven: false,
      offProviderCopyVerified: false,
      fullPlatformReady: false,
      operatorActionRequired: 'Copy the encrypted artifact and this evidence sidecar to an approved off-provider location, then record that independent copy in governance evidence.',
    }
    await writeFile(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, { mode: 0o600 })

    console.log(JSON.stringify({
      status: 'CREATED',
      backupId,
      encryptedArtifact: encryptedPath,
      evidenceSidecar: sidecarPath,
      encryptedSha256,
      sourceStableDuringExport,
      rpoProven: false,
      offProviderCopyVerified: false,
      note: 'Encrypted portable backup created locally. This does not prove RPO, full-platform recovery, or off-provider retention until separate evidence exists.',
    }, null, 2))
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
