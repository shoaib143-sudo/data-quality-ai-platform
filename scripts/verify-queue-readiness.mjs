import fs from 'node:fs'

const routePath = 'app/api/health/ready/route.ts'
const helperPath = 'lib/observability/queue-readiness.ts'
const testPath = 'scripts/test-queue-readiness.mjs'
const migrationPath = 'supabase/migrations/20260912193000_job_queue_health_probe.sql'
const failures = []

for (const path of [routePath, helperPath, testPath, migrationPath]) {
  if (!fs.existsSync(path)) failures.push(`${path}: missing readiness contract artifact`)
}

if (!failures.length) {
  const route = fs.readFileSync(routePath, 'utf8')
  const helper = fs.readFileSync(helperPath, 'utf8')
  const migration = fs.readFileSync(migrationPath, 'utf8')

  for (const required of [
    "admin.schema('orchestration').rpc('verify_job_queue_health')",
    "payload.status === 'READY' || payload.status === 'DEGRADED'",
    "components.queue = payload.idle === true",
    "status: 'DEGRADED', detail: 'Durable queue health could not be fully evaluated.'",
  ]) {
    if (!route.includes(required)) failures.push(`${routePath}: missing deterministic queue readiness contract: ${required}`)
  }

  for (const required of [
    "dead.status = 'DEAD'",
    "recovered.status = 'SUCCEEDED'",
    'recovered.project_id = dead.project_id',
    'recovered.job_type = dead.job_type',
    'recovered.entity_id is not distinct from dead.entity_id',
    'recovered.completed_at > dead.completed_at',
    "case when v_unresolved_dead > 0 or v_stale_running > 0 then 'DEGRADED' else 'READY' end",
  ]) {
    if (!migration.toLowerCase().includes(required.toLowerCase())) failures.push(`${migrationPath}: missing canonical supersession/readiness rule: ${required}`)
  }

  // Preserve the original pure helper and its unit tests as a compatibility
  // oracle for recovered-job ordering, even though production authority now
  // lives in PostgreSQL.
  for (const required of [
    'left.project_id === right.project_id',
    'left.job_type === right.job_type',
    'left.entity_id === right.entity_id',
    'recoveredCompletedAt > deadCompletedAt',
  ]) {
    if (!helper.includes(required)) failures.push(`${helperPath}: missing canonical supersession rule: ${required}`)
  }
}

if (failures.length) {
  console.error('Durable queue readiness verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Durable queue readiness integration matches canonical superseded-dead-job semantics at the database authority boundary.')
