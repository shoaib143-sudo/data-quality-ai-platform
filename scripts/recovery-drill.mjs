import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
  }

  if (!Number.isFinite(checks.catalogDatasets) || !Number.isFinite(checks.profileRuns)) {
    throw new Error('Recovery validation returned invalid record counts')
  }
  if (checks.governanceTables <= 0) throw new Error('Governance schema was not restored')
  return checks
}

async function main() {
  const sourceRaw = required('SOURCE_DATABASE_URL')
  const recoveryRaw = required('RECOVERY_DATABASE_URL')
  const source = safeUrl(sourceRaw, 'SOURCE_DATABASE_URL')
  const recovery = safeUrl(recoveryRaw, 'RECOVERY_DATABASE_URL')
  assertIsolated(source, recovery)

  const startedAt = Date.now()
  const workdir = await mkdtemp(join(tmpdir(), 'dgp-recovery-'))
  const dumpPath = join(workdir, 'database.dump')

  try {
    console.log('Creating logical backup from source database')
    await command('pg_dump', [
      sourceRaw,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpPath,
    ])

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
    const result = {
      status: 'PASSED',
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      source: fingerprint(source),
      recovery: fingerprint(recovery),
      checks,
      note: 'Database recovery only. Supabase Storage object bytes and external configuration require separate recovery validation.',
    }
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await rm(workdir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
})
