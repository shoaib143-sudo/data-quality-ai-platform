import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'

export const CRITICAL_TABLES = [
  'catalog.datasets',
  'catalog.dataset_versions',
  'profiling.profile_runs',
  'profiling.profile_metrics',
  'governance.audit_events',
  'governance.semantic_embeddings',
  'auth.users',
  'storage.buckets',
  'storage.objects',
]

function assertTableName(value) {
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe table identifier: ${value}`)
  }
  return value
}

function psqlArgs(databaseUrl, sql) {
  return [databaseUrl, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql]
}

export async function scalar(databaseUrl, sql) {
  const result = await runBuffered('psql', psqlArgs(databaseUrl, sql))
  return result.stdout.trim()
}

export async function runBuffered(binary, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr })
      reject(new Error(`${binary} exited with code ${code}: ${stderr.trim() || 'no stderr'}`))
    })
  })
}

export async function hashQuery(databaseUrl, selectSql) {
  const sql = `copy (${selectSql}) to stdout`
  return await new Promise((resolve, reject) => {
    const child = spawn('psql', psqlArgs(databaseUrl, sql), { stdio: ['ignore', 'pipe', 'pipe'] })
    const hash = createHash('sha256')
    let stderr = ''
    child.stdout.on('data', (chunk) => hash.update(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(hash.digest('hex'))
      reject(new Error(`psql fingerprint query failed with code ${code}: ${stderr.trim() || 'no stderr'}`))
    })
  })
}

async function tableFingerprint(databaseUrl, table) {
  const safe = assertTableName(table)
  const count = Number(await scalar(databaseUrl, `select count(*) from ${safe};`))
  if (!Number.isFinite(count)) throw new Error(`Invalid row count for ${safe}`)
  const sha256 = await hashQuery(databaseUrl, `select to_jsonb(t)::text from ${safe} t order by to_jsonb(t)::text`)
  return { rowCount: count, sha256 }
}

const ownedSchemaFilter = `
  n.nspname not in (
    'pg_catalog','information_schema','auth','storage','realtime','extensions','graphql','graphql_public',
    'net','vault','supabase_migrations','_analytics'
  )
  and n.nspname not like 'pg_%'
`

export async function collectRecoveryIntegrity(databaseUrl) {
  const tableFingerprints = {}
  for (const table of CRITICAL_TABLES) {
    tableFingerprints[table] = await tableFingerprint(databaseUrl, table)
  }

  const objectFingerprints = {
    columns: await hashQuery(databaseUrl, `
      select concat_ws('|', c.table_schema, c.table_name, c.ordinal_position::text, c.column_name,
        c.data_type, coalesce(c.udt_schema,''), coalesce(c.udt_name,''), c.is_nullable,
        coalesce(c.column_default,''), coalesce(c.character_maximum_length::text,''),
        coalesce(c.numeric_precision::text,''), coalesce(c.numeric_scale::text,''))
      from information_schema.columns c
      join pg_namespace n on n.nspname = c.table_schema
      where ${ownedSchemaFilter}
      order by c.table_schema, c.table_name, c.ordinal_position
    `),
    policies: await hashQuery(databaseUrl, `
      select concat_ws('|', schemaname, tablename, policyname, permissive, array_to_string(roles,','), cmd,
        coalesce(qual,''), coalesce(with_check,''))
      from pg_policies
      where schemaname not in ('auth','storage','realtime') and schemaname not like 'pg_%'
      order by schemaname, tablename, policyname
    `),
    functions: await hashQuery(databaseUrl, `
      select pg_get_functiondef(p.oid)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where ${ownedSchemaFilter}
      order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    `),
    triggers: await hashQuery(databaseUrl, `
      select concat_ws('|', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid, true))
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and ${ownedSchemaFilter}
      order by n.nspname, c.relname, t.tgname
    `),
    grants: await hashQuery(databaseUrl, `
      select concat_ws('|', table_schema, table_name, grantee, privilege_type, is_grantable)
      from information_schema.role_table_grants g
      join pg_namespace n on n.nspname = g.table_schema
      where ${ownedSchemaFilter}
      order by table_schema, table_name, grantee, privilege_type
    `),
    migrationHistory: await hashQuery(databaseUrl, `
      select to_jsonb(m)::text
      from supabase_migrations.schema_migrations m
      order by version
    `),
  }

  const extensions = (await scalar(databaseUrl, `select coalesce(string_agg(extname, ',' order by extname),'') from pg_extension;`))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    schemaVersion: 1,
    criticalTables: tableFingerprints,
    objectFingerprints,
    extensions,
  }
}

export function compareRecoveryIntegrity(expected, actual) {
  const differences = []
  for (const [table, expectedValue] of Object.entries(expected.criticalTables ?? {})) {
    const actualValue = actual.criticalTables?.[table]
    if (!actualValue) {
      differences.push(`${table}: missing from recovered integrity manifest`)
      continue
    }
    if (expectedValue.rowCount !== actualValue.rowCount) {
      differences.push(`${table}: rowCount ${actualValue.rowCount} != ${expectedValue.rowCount}`)
    }
    if (expectedValue.sha256 !== actualValue.sha256) {
      differences.push(`${table}: content fingerprint mismatch`)
    }
  }

  for (const [key, expectedValue] of Object.entries(expected.objectFingerprints ?? {})) {
    if (actual.objectFingerprints?.[key] !== expectedValue) {
      differences.push(`${key}: database-object fingerprint mismatch`)
    }
  }

  for (const extension of expected.extensions ?? []) {
    if (!(actual.extensions ?? []).includes(extension)) differences.push(`extension missing: ${extension}`)
  }

  return { matches: differences.length === 0, differences }
}
