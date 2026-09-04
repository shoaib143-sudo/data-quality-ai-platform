import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing production-readiness artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing production-readiness contract: ${pattern}`)
  }
}

requireText('supabase/migrations/20260904194020_production_slo_and_readiness_evidence.sql', [
  'production_slo_policies',
  'production_readiness_runs',
  'max_api_p95_ms',
  'max_api_p99_ms',
  'max_error_rate',
  'max_projection_lag_seconds',
  'max_dead_job_rate',
  'production_readiness_select',
])
requireText('lib/platform/production-readiness.ts', [
  'getDataPlaneProviderHealth',
  'listProjectionConsumerHealth',
  'DATA_PLANE_PROVIDERS',
  'PROJECTION_HEALTH',
  'DURABLE_JOB_HEALTH',
  'RECOVERY_DRILL',
  'HTTP_BENCHMARK',
  'PLATFORM_CONTRACTS',
  'production_readiness_runs',
])
requireText('app/api/platform/[projectId]/readiness/route.ts', [
  "authorizeProject(user.id, projectId, 'admin.manage')",
  'evaluateProductionReadiness',
  'persistProductionReadiness',
])
requireText('scripts/benchmark-production.mjs', [
  'BENCHMARK_MAX_P95_MS',
  'BENCHMARK_MAX_P99_MS',
  'BENCHMARK_MAX_ERROR_RATE',
  'BENCHMARK_MIN_SUCCESSFUL_REQUESTS',
  "gate_name: 'HTTP_BENCHMARK'",
  'READINESS_PROJECT_ID',
  'readinessEvidence',
])
requireText('scripts/recovery-drill.mjs', [
  'assertIsolated',
  'assertSnapshotParity',
  'auditChainValid',
  'backup_restore_drills',
  'RECOVERY_DATABASE_URL',
])

console.log('Production readiness contracts verified.')
