import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260922161000_deprecate_legacy_run_profile.sql', 'utf8')
const runRoute = readFileSync('app/api/agents/run/route.ts', 'utf8')

test('legacy SQL run_profile fails before creating partial profiling state', () => {
  assert.match(migration, /create or replace function profiling\.run_profile\(p_dataset_version_id uuid\)/i)
  assert.match(migration, /errcode\s*=\s*'0A000'/i)
  assert.match(migration, /deprecated; start profiling through the governed application profiling execution boundary/i)
  assert.doesNotMatch(migration, /perform profiling\.execute_metrics/i)
  assert.doesNotMatch(migration, /insert into profiling\.profile_runs/i)
})

test('browser-facing roles cannot execute the legacy SQL compatibility boundary', () => {
  assert.match(migration, /revoke execute on function profiling\.run_profile\(uuid\) from public, anon, authenticated/i)
})

test('canonical profiling execution remains the governed durable application path', () => {
  assert.match(runRoute, /authorizeDatasetVersion\(user\.id, datasetVersionId, 'profiling\.execute'\)/)
  assert.match(runRoute, /validateDataSourceForProfiling/)
  assert.match(runRoute, /jobType:\s*'PROFILING'/)
  assert.match(runRoute, /learningRunMode:\s*'SUPERVISED'/)
  assert.match(runRoute, /profiling_agent/)
  assert.match(runRoute, /durable_queue_outbox/)
})
