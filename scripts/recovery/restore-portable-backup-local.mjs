import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { collectRecoveryIntegrity, compareRecoveryIntegrity, runBuffered, scalar } from './recovery-integrity.mjs'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optional(name) {
  return process.env[name]?.trim() || null
}

async function sha256File(path) {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

async function command(binary, args, options = {}) {
  return await runBuffered(binary, args, options)
}

function assertLoopbackDatabaseUrl(raw) {
  const url = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Recovery target must be a PostgreSQL URL')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`Local restore harness refuses non-loopback target host: ${hostname}`)
  }
  return raw
}

function parseLocalDatabaseUrl(output) {
  const match = output.match(/postgresql:\/\/[^\s]+@(?:127\.0\.0\.1|localhost):\d+\/postgres/)
  if (!match) throw new Error('Could not determine the local Supabase database URL from `supabase start` output')
  return match[0]
}

async function verifySidecar(encryptedPath) {
  const sidecarPath = `${encryptedPath}.evidence.json`
  try {
    const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'))
    const actual = await sha256File(encryptedPath)
    if (sidecar.encryptedArtifact?.sha256 !== actual) {
      throw new Error('Encrypted backup SHA-256 does not match its evidence sidecar')
    }
    return { sidecarPath, sidecar }
  } catch (error) {
    if (error?.code === 'ENOENT') return { sidecarPath: null, sidecar: null }
    throw error
  }
}

async function verifyBundleFiles(extractedDir, manifest) {
  for (const [fileName, evidence] of Object.entries(manifest.files ?? {})) {
    const path = join(extractedDir, fileName)
    const info = await stat(path)
    if (info.size !== evidence.bytes) throw new Error(`${fileName} size does not match backup manifest`)
    const sha256 = await sha256File(path)
    if (sha256 !== evidence.sha256) throw new Error(`${fileName} SHA-256 does not match backup manifest`)
  }
}

async function prepareDataSql(dataPath, targetVersionNum, workdir) {
  if (targetVersionNum >= 170000) return { path: dataPath, transformations: [] }
  const original = await readFile(dataPath, 'utf8')
  const transformed = original.replace(/^SET transaction_timeout\s*=.*;$/gm, '-- removed for pre-Postgres-17 recovery target compatibility')
  if (transformed === original) return { path: dataPath, transformations: [] }
  const path = join(workdir, 'data.restore.sql')
  await writeFile(path, transformed, { mode: 0o600 })
  return { path, transformations: ['removed Postgres 17 transaction_timeout setting for older local target'] }
}

async function startEphemeralSupabase(supabaseBinary, localWorkdir) {
  await command(supabaseBinary, ['init', '--workdir', localWorkdir])
  const start = await command(supabaseBinary, ['start', '--workdir', localWorkdir])
  return parseLocalDatabaseUrl(`${start.stdout}\n${start.stderr}`)
}

async function stopEphemeralSupabase(supabaseBinary, localWorkdir) {
  try {
    await command(supabaseBinary, ['stop', '--workdir', localWorkdir, '--no-backup'])
  } catch (error) {
    console.error(JSON.stringify({ status: 'LOCAL_SUPABASE_CLEANUP_WARNING', error: error instanceof Error ? error.message : String(error) }))
  }
}

async function main() {
  const encryptedPath = resolve(required('RECOVERY_BACKUP_FILE'))
  const ageIdentityFile = resolve(required('RECOVERY_AGE_IDENTITY_FILE'))
  const suppliedTarget = optional('RECOVERY_LOCAL_DATABASE_URL')
  const supabaseBinary = optional('SUPABASE_CLI_BINARY') ?? 'supabase'
  const evidenceDir = resolve(optional('RECOVERY_EVIDENCE_OUTPUT_DIR') ?? 'recovery-evidence')
  const destructiveConfirmation = process.env.ALLOW_LOCAL_RECOVERY_TARGET?.trim()

  if (destructiveConfirmation !== 'YES_I_UNDERSTAND_THIS_REPLACES_LOCAL_RECOVERY_DATA') {
    throw new Error('Set ALLOW_LOCAL_RECOVERY_TARGET=YES_I_UNDERSTAND_THIS_REPLACES_LOCAL_RECOVERY_DATA to run the local destructive restore rehearsal')
  }

  await mkdir(evidenceDir, { recursive: true, mode: 0o700 })
  const workdir = await mkdtemp(join(tmpdir(), 'datanexus-local-restore-'))
  const extractedDir = join(workdir, 'bundle')
  const archivePath = join(workdir, 'portable-backup.tar.gz')
  const localWorkdir = join(workdir, 'supabase-recovery-target')
  let autoStarted = false
  let targetDatabaseUrl = suppliedTarget ? assertLoopbackDatabaseUrl(suppliedTarget) : null
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()

  try {
    const { sidecarPath, sidecar } = await verifySidecar(encryptedPath)
    await mkdir(extractedDir, { recursive: true, mode: 0o700 })

    console.log('Decrypting portable backup into temporary recovery workspace')
    await command('age', ['--decrypt', '-i', ageIdentityFile, '-o', archivePath, encryptedPath])
    await command('tar', ['-xzf', archivePath, '-C', extractedDir])

    const manifest = JSON.parse(await readFile(join(extractedDir, 'backup-manifest.json'), 'utf8'))
    if (manifest.kind !== 'DATANEXUS_PORTABLE_LOGICAL_BACKUP' || manifest.recoveryMechanism !== 'PORTABLE_LOGICAL_EXPORT') {
      throw new Error('Backup manifest is not a governed DataNexus portable logical backup')
    }
    if (sidecar?.backupId && sidecar.backupId !== manifest.backupId) throw new Error('Backup ID differs between encrypted bundle and evidence sidecar')
    await verifyBundleFiles(extractedDir, manifest)

    if (!manifest.consistency?.sourceStableDuringExport) {
      throw new Error('Backup source changed during the multi-dump export window; fail closed and create a new portable backup before certifying restore integrity')
    }

    if (!targetDatabaseUrl) {
      console.log('Starting an isolated temporary Supabase local stack')
      targetDatabaseUrl = assertLoopbackDatabaseUrl(await startEphemeralSupabase(supabaseBinary, localWorkdir))
      autoStarted = true
    }

    const targetVersionNum = Number(await scalar(targetDatabaseUrl, 'show server_version_num;'))
    if (!Number.isFinite(targetVersionNum)) throw new Error('Unable to determine local recovery target PostgreSQL version')

    const dataPreparation = await prepareDataSql(join(extractedDir, 'data.sql'), targetVersionNum, workdir)

    console.log('Restoring roles, schema, and data into isolated local Supabase')
    await command('psql', [
      '--single-transaction', '--variable', 'ON_ERROR_STOP=1',
      '--file', join(extractedDir, 'roles.sql'),
      '--file', join(extractedDir, 'schema.sql'),
      '--command', 'SET session_replication_role = replica',
      '--file', dataPreparation.path,
      '--dbname', targetDatabaseUrl,
    ])

    console.log('Restoring Supabase migration history')
    await command('psql', [
      '--single-transaction', '--variable', 'ON_ERROR_STOP=1',
      '--file', join(extractedDir, 'history_schema.sql'),
      '--file', join(extractedDir, 'history_data.sql'),
      '--dbname', targetDatabaseUrl,
    ])

    console.log('Validating recovered database content and governed database objects')
    const recoveredIntegrity = await collectRecoveryIntegrity(targetDatabaseUrl)
    const comparison = compareRecoveryIntegrity(manifest.integrityAfter, recoveredIntegrity)
    if (!comparison.matches) {
      throw new Error(`Recovered database integrity differs from backup evidence: ${comparison.differences.join('; ')}`)
    }

    const auditChainValid = await scalar(targetDatabaseUrl, "select coalesce((governance.verify_audit_chain()->>'valid')::text,'false');")
    if (auditChainValid !== 'true') throw new Error('Recovered governance audit chain is invalid')

    const completedAt = new Date().toISOString()
    const evidence = {
      schemaVersion: 1,
      kind: 'DATANEXUS_LOCAL_PORTABLE_RESTORE_EVIDENCE',
      status: 'PASSED',
      backupId: manifest.backupId,
      sourceProjectRef: manifest.sourceProjectRef,
      recoveryMechanism: 'PORTABLE_LOGICAL_EXPORT',
      target: 'LOCAL_SUPABASE_LOOPBACK',
      targetPostgresVersionNum: targetVersionNum,
      startedAt,
      completedAt,
      durationSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      integrityComparison: comparison,
      auditChainValid: true,
      restoreTransformations: dataPreparation.transformations,
      encryptedArtifactEvidence: sidecarPath ? basename(sidecarPath) : null,
      scopeResults: { DATABASE: { status: 'PASSED', evidence: 'local isolated restore with deterministic integrity comparison' } },
      rpoProven: false,
      platformRtoProven: false,
      fullPlatformReady: false,
      note: 'This proves a zero-cost isolated DATABASE restore path. Storage object bytes, external identity/platform settings, runtime dependencies, and service-level RTO remain separate recovery scopes.',
    }
    const evidencePath = join(evidenceDir, `local-restore-${manifest.backupId}.json`)
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
    console.log(JSON.stringify({ ...evidence, evidencePath }, null, 2))
  } finally {
    if (autoStarted) await stopEphemeralSupabase(supabaseBinary, localWorkdir)
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
