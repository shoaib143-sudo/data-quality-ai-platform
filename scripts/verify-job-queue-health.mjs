import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260912193000_job_queue_health_probe.sql', 'utf8')
const route = fs.readFileSync('app/api/health/ready/route.ts', 'utf8')

for (const marker of [
  'create or replace function orchestration.verify_job_queue_health',
  'stable',
  'security invoker',
  "set search_path = ''",
  "'status', case when v_unresolved_dead > 0 or v_stale_running > 0 then 'DEGRADED' else 'READY' end",
  "'idle', v_idle",
  'entity_id is not distinct from dead.entity_id',
  'revoke all on function orchestration.verify_job_queue_health(integer) from public, anon, authenticated',
  'grant execute on function orchestration.verify_job_queue_health(integer) to service_role',
  'QUEUE_HEALTH_INVALID_WINDOW',
  'JOB_QUEUE_HEALTH_PROBE_POSTCONDITION_FAILED',
]) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`Queue health migration missing contract marker: ${marker}`)
  }
}

if (!route.includes("admin.schema('orchestration').rpc('verify_job_queue_health')")) {
  throw new Error('Production readiness route must use the deterministic queue health RPC')
}

if (route.includes("from('job_queue')")) {
  throw new Error('Production readiness route must not reconstruct queue health through multiple direct job_queue reads')
}

if (!route.includes('Durable queue is healthy and idle.')) {
  throw new Error('Production readiness route must explicitly classify an idle durable queue as healthy')
}

console.log('Job queue health contract verified.')
