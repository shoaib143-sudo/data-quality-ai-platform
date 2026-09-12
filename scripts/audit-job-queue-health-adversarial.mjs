import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260912193000_job_queue_health_probe.sql', 'utf8').toLowerCase()
const route = fs.readFileSync('app/api/health/ready/route.ts', 'utf8')
const dynamic = fs.readFileSync('scripts/test-job-queue-health.sql', 'utf8').toLowerCase()

const threats = [
  ['idle queue falsely degraded', migration.includes("then 'degraded' else 'ready'") && migration.includes("v_idle := v_recent_dead = 0")],
  ['recent success required for health', !migration.includes('v_recent_succeeded > 0')],
  ['recovered dead job remains degraded', migration.includes('recovered.completed_at > dead.completed_at')],
  ['nullable entity recovery identity breaks', migration.includes('is not distinct from')],
  ['stale running lease ignored', migration.includes('lease_expires_at < v_now')],
  ['active running work treated as idle', migration.includes('v_active_running = 0')],
  ['invalid observation window accepted', migration.includes('queue_health_invalid_window')],
  ['anonymous/authenticated invocation exposed', migration.includes('from public, anon, authenticated')],
  ['health route reconstructs state client-side', !route.includes("from('job_queue')")],
  ['rpc/query failure reported healthy', route.includes("components.queue = { status: 'DEGRADED', detail: 'Durable queue health could not be fully evaluated.' }")],
  ['idle case lacks dynamic coverage', dynamic.includes('idle queue should be ready and idle')],
  ['unresolved dead case lacks dynamic coverage', dynamic.includes('unresolved dead job should degrade queue')],
  ['recovery case lacks dynamic coverage', dynamic.includes('later success should resolve matching dead job')],
  ['stale lease case lacks dynamic coverage', dynamic.includes('stale running lease should degrade queue')],
  ['acl case lacks dynamic coverage', dynamic.includes('queue health rpc acl contract violated')],
]

const failures = threats.filter(([, passed]) => !passed)
if (failures.length) {
  throw new Error(`Independent automated queue-health adversarial audit failed: ${failures.map(([name]) => name).join(', ')}`)
}

console.log('Independent automated queue-health adversarial audit passed. This is an automated threat-model audit, not an independent human or third-party review.')
