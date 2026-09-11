import fs from 'node:fs'

const routePath = 'app/api/health/ready/route.ts'
const helperPath = 'lib/observability/queue-readiness.ts'
const testPath = 'scripts/test-queue-readiness.mjs'
const failures = []

for (const path of [routePath, helperPath, testPath]) {
  if (!fs.existsSync(path)) failures.push(`${path}: missing readiness contract artifact`)
}

if (!failures.length) {
  const route = fs.readFileSync(routePath, 'utf8')
  const helper = fs.readFileSync(helperPath, 'utf8')

  for (const required of [
    "import { countUnresolvedDeadJobs } from '@/lib/observability/queue-readiness'",
    ".eq('status', 'DEAD')",
    ".eq('status', 'SUCCEEDED')",
    'countUnresolvedDeadJobs(deadResult.data ?? [], successfulResult.data ?? [])',
    'unresolvedDeadJobs > 0',
  ]) {
    if (!route.includes(required)) failures.push(`${routePath}: missing recovered-job readiness contract: ${required}`)
  }

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

console.log('Durable queue readiness integration matches canonical superseded-dead-job semantics.')
