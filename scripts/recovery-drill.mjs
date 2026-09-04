import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function safeUrl(raw, label) {
  const url = new URL(raw)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${label} must be a PostgreSQL URL`)
  }
  return url
}

function fingerprint(url) {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`
}

function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID`)
  }
  return value
}

function optionalNonNegativeInteger(name) {
  const raw = process.env[name]?.trim()
  if (!raw) return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function assertIsolated(source, recovery) {
  if (fingerprint(source) === fingerprint(recovery)) {
    throw new Error('Recovery database must be different from the source database')
  }

  const allow = process.env.ALLOW_RECOVERY_TARGET?.trim()
  if (allow !== 'YES_I_UNDERSTAND_THIS_REPLACES_RECOVERY_DATA') {
    throw new Error(
      'Set ALLOW_RECOVERY_TARGET=YES_I_UNDERSTAND_THIS_REPLACES_RECOVERY_DATA to confirm the isolated recovery target',
    )
  }

  const sourceLabel = `${source.hostname}${source.pathname}`.toLowerCase()
  const recoveryLabel = `${recovery.hostname}${recovery.pathname}`.toLowerCase()
  if (recoveryLabel.includes('prod') || recoveryLabel.includes('production')) {
    throw new Error('Recovery target appears to be a production environment')
  }
  if (sourceLabel === recoveryLabel) {
    throw new Error('Recovery target resolves to the same labelled environment as source')
  }
}

async function command(binary, args, options = {}) {
  const result = await execFileAsync(binary, args, {
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  })
  return { stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' }
}

async function scalar(databaseUrl, sql) {
  const { stdout } = await command('psql', [databaseUrl, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql])
  return stdout.trim()
}

async function validateRecovery(recoveryUrl) {
  const checks = {
    database: await scalar(recoveryUrl, 'select current_database();'),
    catalogDatasets: Number(await scalar(recoveryUrl, 'select count(*) from catalog.datasets;')),
    profileRuns: Number(await scalar(recoveryUrl, 'select count(*) from profiling.profile_runs;')),
    governanceTables: Number(
      await scalar(
        recoveryUrl,
        "select count(*) from information_schema.tables where table_schema='governance' and table_type='BASE TABLE';",
      ),
    ),
    vectorExtension: await scalar(
      recoveryUrl,
      "select case when exists(select 1 from pg_extension where extname='vector') then 'present' else 'absent' end;",
    ),
    semanticRegistry: Number(
      await scalar(
        recoveryUrl,
        "select count(*) from information_schema.tables where table_schema='governance' and table_name='semantic_embeddings';",
      ),
    ),
    auditChainValid: await scalar(
      recoveryUrl,
      "select coalesce((governance.verify_audit_chain()->>'valid')::text,'false');",
    ),
  }

  if (!Number.isFinite(checks.catalogDatasets) || !Number.isFinite(checks.profileRuns)) {
    throw new Error('Recovery validation returned invalid record counts')
  }
  if (checks.governanceTables <= 0) throw new Error('Governance schema was not restored')
  if (checks.vectorExtension !== 'present') throw new Error('pgvector extension was not restored')
  if (checks.semanticRegistry !== 1) throw new Error('Semantic embedding registry was not restored')
  if (checks.auditChainValid !== 'true') throw new Error('Recovered governance audit chain is invalid')
  return checks
}

async function sha256File(path) {
  const bytes = await readFile(path)
  return createHash('sha256').update(bytes).digest('hex')
}

async function toolVersion(binary) {
  const { stdout } = await command(binary, ['--version'])
  return stdout
}

async function persistDrillEvidence({
  sourceRaw,
  projectId,
  status,
  startedAt,
  completedAt,
  measuredRpoMinutes,
  measuredRtoMinutes,
  evidence,
  notes,
}) {
  const sql = `
    insert into governance.backup_restore_drills(
      project_id,drill_type,status,environment,evidence,notes,started_at,completed_at,
      measured_rpo_minutes,measured_rto_minutes
    ) values (
      :'project_id'::uuid,'RESTORE_REHEARSAL',:'status','isolated-recovery',:'evidence'::jsonb,
      nullif(:'notes',''),:'started_at'::timestamptz,:'completed_at'::timestamptz,
      nullif(:'measured_rpo_minutes','')::integer,:'measured_rto_minutes'::integer
    ) returning id::text || ':' || policy_result;
  `
  const { stdout } = await command('psql', [
    sourceRaw,
    '-X',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    `project_id=${projectId}`,
    '-v',
    `status=${status}`,
    '-v',
    `evidence=${JSON.stringify(evidence)}`,
    '-v',
    `notes=${notes ?? ''}`,
    '-v',
    `started_at=${startedAt}`,
    '-v',
    `completed_at=${completedAt}`,
    '-v',
    `measured_rpo_minutes=${measuredRpoMinutes ?? ''}`,
    '-v',
    `measured_rto_minutes=${measuredRtoMinutes}`,
    '-c',
    sql,
  ])
  return stdout.trim()
}

async function main() {
  const sourceRaw = required('SOURCE_DATABASE_URL')
  const recoveryRaw = required('RECOVERY_DATABASE_URL')
  const projectId = assertUuid(required('RECOVERY_PROJECT_ID'), 'RECOVERY_PROJECT_ID')
  const measuredRpoMinutes = optionalNonNegativeInteger('RECOVERY_MEASURED_RPO_MINUTES')
  const source = safeUrl(sourceRaw, 'SOURCE_DATABASE_URL')
  const recovery = safeUrl(recoveryRaw, 'RECOVERY_DATABASE_URL')
  assertIsolated(source, recovery)

  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()
  const workdir = await mkdtemp(join(tmpdir(), 'dgp-recovery-'))
  const dumpPath = join(workdir, 'database.dump')
  let evidence = {
    source: fingerprint(source),
    recovery: fingerprint(recovery),
    projectId,
    scope: 'database',
  }

  try {
    const [pgDumpVersion, pgRestoreVersion, psqlVersion] = await Promise.all([
      toolVersion('pg_dump'),
      toolVersion('pg_restore'),
      toolVersion('psql'),
    ])
    evidence = { ...evidence, tools: { pgDumpVersion, pgRestoreVersion, psqlVersion } }

    console.log('Creating logical backup from source database')
    await command('pg_dump', [
      sourceRaw,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpPath,
    ])

    const dumpStat = await stat(dumpPath)
    evidence = {
      ...evidence,
      backup: {
        format: 'custom',
        bytes: dumpStat.size,
        sha256: await sha256File(dumpPath),
      },
    }

    console.log('Resetting isolated recovery database schema')
    await command('psql', [
      recoveryRaw,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'drop schema if exists public cascade; create schema public;',
    ])

    console.log('Restoring backup into isolated recovery database')
    await command('pg_restore', [
      '--dbname',
      recoveryRaw,
      '--no-owner',
      '--no-privileges',
      '--clean',
      '--if-exists',
      dumpPath,
    ])

    console.log('Running recovery integrity checks')
    const checks = await validateRecovery(recoveryRaw)
    const completedAt = new Date().toISOString()
    const measuredRtoMinutes = Math.max(0, Math.ceil((Date.now() - startedAtMs) / 60_000))
    evidence = { ...evidence, checks }

    const registryResult = await persistDrillEvidence({
      sourceRaw,
      projectId,
      status: 'PASSED',
      startedAt,
      completedAt,
      measuredRpoMinutes,
      measuredRtoMinutes,
      evidence,
      notes: 'Automated isolated database restore rehearsal completed successfully.',
    })

    const result = {
      status: 'PASSED',
      durationSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      measuredRpoMinutes,
      measuredRtoMinutes,
      source: fingerprint(source),
      recovery: fingerprint(recovery),
      checks,
      registryResult,
      note: 'Database recovery only. Supabase Storage object bytes and external configuration require separate recovery validation.',
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    const completedAt = new Date().toISOString()
    const measuredRtoMinutes = Math.max(0, Math.ceil((Date.now() - startedAtMs) / 60_000))
    const message = error instanceof Error ? error.message : String(error)
    try {
      await persistDrillEvidence({
        sourceRaw,
        projectId,
        status: 'FAILED',
        startedAt,
        completedAt,
        measuredRpoMinutes,
        measuredRtoMinutes,
        evidence: { ...evidence, failure: { message } },
        notes: 'Automated isolated database restore rehearsal failed. Review evidence before retrying.',
      })
    } catch (registryError) {
      console.error(
        JSON.stringify({
          status: 'EVIDENCE_PERSISTENCE_FAILED',
          error: registryError instanceof Error ? registryError.message : String(registryError),
        }),
      )
    }
    throw error
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
