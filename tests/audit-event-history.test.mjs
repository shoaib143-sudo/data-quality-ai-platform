import '../scripts/lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const { normalizeAuditHistoryRows } = await import('../lib/analytics/audit-event-history.ts')

test('normalizes grouped immutable audit analytics rows', () => {
  const rows = normalizeAuditHistoryRows([
    {
      bucket_start: '2026-09-18T00:00:00+00:00',
      actor_type: 'AGENT',
      event_type: 'REMEDIATION_EXECUTED',
      entity_type: 'DATASET',
      domain: 'Customer',
      event_count: 12,
    },
    { bucket_start: null, actor_type: 'AGENT', event_type: 'BAD', event_count: 1 },
  ])

  assert.deepEqual(rows, [{
    bucketStart: '2026-09-18T00:00:00+00:00',
    actorType: 'AGENT',
    eventType: 'REMEDIATION_EXECUTED',
    entityType: 'DATASET',
    domain: 'Customer',
    eventCount: 12,
  }])
})

test('audit analytics migration is project-scoped, grouped, read-only and service-role-only', () => {
  const migration = fs.readFileSync(
    'supabase/migrations/20260920043000_governance_audit_history_analytics.sql',
    'utf8',
  )

  for (const invariant of [
    'a.project_id = p_project_id',
    "date_trunc('day', a.created_at)",
    "a.metadata->>'domain'",
    "a.metadata->>'business_domain'",
    "a.metadata->>'governance_domain'",
    'count(*)::bigint as event_count',
    'revoke all on function governance.query_audit_event_analytics',
    'from public, anon, authenticated',
    'to service_role',
  ]) {
    assert.ok(migration.includes(invariant), `missing audit analytics invariant: ${invariant}`)
  }

  assert.equal(/\b(update|delete|insert into)\s+governance\.audit_events\b/i.test(migration), false)
})
