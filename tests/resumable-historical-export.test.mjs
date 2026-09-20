import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const {
  HISTORICAL_EXPORT_KINDS,
  boundHistoricalExportChunkSize,
  boundHistoricalExportRetentionDays,
  normalizeHistoricalExportFilters,
  planHistoricalExportChunk,
} = await import('../lib/orchestration/historical-export-contract.ts')

const runtime = fs.readFileSync('lib/orchestration/historical-export.ts', 'utf8')
const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const worker = fs.readFileSync('lib/orchestration/worker.ts', 'utf8')
const routing = fs.readFileSync('lib/orchestration/execution-recovery-routing.ts', 'utf8')
const createRoute = fs.readFileSync('app/api/exports/route.ts', 'utf8')
const statusRoute = fs.readFileSync('app/api/exports/[exportId]/route.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260920044000_resumable_historical_exports.sql', 'utf8')

test('supports the three governed historical export families', () => {
  assert.deepEqual(HISTORICAL_EXPORT_KINDS, [
    'AUDIT_EVENTS',
    'ANALYTICS_EVENTS',
    'GOVERNANCE_OUTCOME_REPORTS',
  ])
})

test('normalizes bounded filters and rejects unsupported filter syntax', () => {
  assert.deepEqual(
    normalizeHistoricalExportFilters('AUDIT_EVENTS', {
      from: '2026-01-01T00:00:00Z',
      to: '2026-09-20T00:00:00Z',
      actorType: 'agent',
      eventPrefix: 'REMEDIATION_',
      entityType: 'DATASET',
    }),
    {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-09-20T00:00:00.000Z',
      actorType: 'AGENT',
      eventPrefix: 'REMEDIATION_',
      entityType: 'DATASET',
    },
  )
  assert.throws(
    () => normalizeHistoricalExportFilters('AUDIT_EVENTS', { eventPrefix: 'x%drop' }),
    /unsupported characters/,
  )
  assert.throws(
    () => normalizeHistoricalExportFilters('GOVERNANCE_OUTCOME_REPORTS', { persona: 'ROOT' }),
    /persona is unsupported/,
  )
  assert.throws(
    () => normalizeHistoricalExportFilters('ANALYTICS_EVENTS', {
      from: '2026-09-20T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    }),
    /from must be earlier/,
  )
})

test('bounds chunk size and retention instead of accepting unbounded exports', () => {
  assert.equal(boundHistoricalExportChunkSize(undefined), 500)
  assert.equal(boundHistoricalExportChunkSize(1), 100)
  assert.equal(boundHistoricalExportChunkSize(99999), 2000)
  assert.equal(boundHistoricalExportRetentionDays(undefined), 7)
  assert.equal(boundHistoricalExportRetentionDays(0), 1)
  assert.equal(boundHistoricalExportRetentionDays(999), 90)
})

test('plans resumable chunks deterministically', () => {
  assert.deepEqual(
    planHistoricalExportChunk({
      offset: 1000,
      partCount: 2,
      rowsExported: 1000,
      chunkSize: 500,
      rowCount: 500,
    }),
    {
      partNumber: 3,
      nextOffset: 1500,
      nextRowsExported: 1500,
      complete: false,
    },
  )
  assert.equal(
    planHistoricalExportChunk({
      offset: 1500,
      partCount: 3,
      rowsExported: 1500,
      chunkSize: 500,
      rowCount: 42,
    }).complete,
    true,
  )
  assert.throws(
    () => planHistoricalExportChunk({
      offset: 0,
      partCount: 0,
      rowsExported: 0,
      chunkSize: 500,
      rowCount: 501,
    }),
    /exceeds configured chunk size/,
  )
})

test('durable worker and recovery contracts register EXPORT without a second queue', () => {
  assert.match(queue, /DurableJobType[^\n]+\| 'EXPORT'/)
  assert.match(worker, /job\.job_type === 'EXPORT'/)
  assert.match(worker, /executeHistoricalExportChunk\(job\)/)
  assert.match(worker, /markHistoricalExportFailed\(job, error\)/)
  assert.match(routing, /'EXPORT'/)
  assert.match(runtime, /enqueueDurableJob\(\{/)
  assert.match(runtime, /jobType: 'EXPORT'/)
  assert.match(runtime, /idempotencyKey: \`export:\$\{exportJob\.id\}:part:\$\{nextPart\}\`/)
})

test('export snapshot, deterministic parts, manifest, retention and audit evidence are preserved', () => {
  for (const invariant of [
    ".lte('created_at', job.snapshot_at)",
    "exports/\${exportId}/part-\${String(part).padStart(6, '0')}.ndjson",
    "exports/\${exportId}/manifest.json",
    "retentionUntil: job.expires_at",
    "eventType: 'HISTORICAL_EXPORT_REQUESTED'",
    "eventType: 'HISTORICAL_EXPORT_COMPLETED'",
    "contentType: 'application/x-ndjson'",
  ]) {
    assert.ok(runtime.includes(invariant), \`missing export runtime invariant: \${invariant}\`)
  }
})

test('portable export APIs require report.export and expose signed URLs only after completion', () => {
  assert.match(createRoute, /authorizeProject\(user\.id, projectId, 'report\.export'\)/)
  assert.match(statusRoute, /authorizeProject\(user\.id, projectId, 'report\.export'\)/)
  assert.match(runtime, /job\.status !== 'COMPLETED'/)
  assert.match(runtime, /store\.signedUrl/)
  assert.match(statusRoute, /Cache-Control': 'private, no-store'/)
})

test('migration is service-only, project-scoped, bounded and preserves existing job types', () => {
  for (const type of [
    'PROFILING',
    'DATA_QUALITY',
    'NOTIFICATION',
    'OBSERVABILITY',
    'DISCOVERY',
    'LINEAGE_ENRICHMENT',
    'SEMANTIC_INDEX',
    'GOVERNANCE_AGENT',
    'EXPORT',
  ]) {
    assert.ok(migration.includes(\`'\${type}'::text\`), \`missing durable job type: \${type}\`)
  }
  for (const invariant of [
    'project_id uuid not null references app.projects(id) on delete cascade',
    'chunk_size integer not null default 500 check (chunk_size between 100 and 2000)',
    "expires_at timestamptz not null default (now() + interval '7 days')",
    'revoke all on orchestration.export_jobs from public, anon, authenticated',
    'grant select, insert, update on orchestration.export_jobs to service_role',
  ]) {
    assert.ok(migration.includes(invariant), \`missing export persistence invariant: \${invariant}\`)
  }
})
