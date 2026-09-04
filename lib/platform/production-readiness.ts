import { getDataPlaneProviderHealth } from '@/lib/data-plane/provider-health'
import { listProjectionConsumerHealth } from '@/lib/data-plane/projection-operations'
import { createAdminClient } from '@/lib/supabase/admin'

export type ReadinessCheck = {
  key: string
  status: 'PASSED' | 'FAILED' | 'PARTIAL' | 'NOT_ASSESSED'
  detail: string
  evidence?: Record<string, unknown>
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0
}

function overallStatus(checks: ReadinessCheck[]): ReadinessCheck['status'] {
  if (checks.some((check) => check.status === 'FAILED')) return 'FAILED'
  if (checks.some((check) => check.status === 'PARTIAL')) return 'PARTIAL'
  if (checks.every((check) => check.status === 'NOT_ASSESSED')) return 'NOT_ASSESSED'
  if (checks.some((check) => check.status === 'NOT_ASSESSED')) return 'PARTIAL'
  return 'PASSED'
}

export async function evaluateProductionReadiness(projectId: string) {
  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const [providerHealth, projections, sloResult, jobsResult, drillResult, benchmarkResult, contractResult] = await Promise.all([
    getDataPlaneProviderHealth(),
    listProjectionConsumerHealth(projectId),
    admin.schema('orchestration').from('production_slo_policies').select('*').eq('project_id', projectId).maybeSingle(),
    admin.schema('orchestration').from('job_queue').select('id,status,job_type,attempts,max_attempts,created_at,last_error').eq('project_id', projectId).gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    admin.schema('governance').from('backup_restore_drills').select('id,drill_type,status,policy_result,completed_at,created_at,measured_rpo_minutes,measured_rto_minutes').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.schema('orchestration').from('production_readiness_runs').select('id,status,evidence,completed_at,created_at').eq('project_id', projectId).eq('gate_name', 'HTTP_BENCHMARK').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.schema('governance').from('platform_contract_check_runs').select('id,status,completed_at,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const dbErrors = [sloResult.error, jobsResult.error, drillResult.error, benchmarkResult.error, contractResult.error].filter(Boolean)
  if (dbErrors.length) throw new Error(`Unable to evaluate production readiness: ${dbErrors[0]?.message}`)

  const slo = sloResult.data ?? {
    max_api_p95_ms: 1500,
    max_api_p99_ms: 3000,
    max_error_rate: 0.01,
    max_projection_lag_seconds: 300,
    max_dead_job_rate: 0.01,
    min_successful_requests: 20,
  }
  const checks: ReadinessCheck[] = []

  const unavailableSelected = providerHealth.providers.filter((provider) => provider.selected && provider.status === 'UNAVAILABLE')
  const degradedSelected = providerHealth.providers.filter((provider) => provider.selected && provider.status === 'DEGRADED')
  checks.push({
    key: 'DATA_PLANE_PROVIDERS',
    status: unavailableSelected.length ? 'FAILED' : degradedSelected.length ? 'PARTIAL' : 'PASSED',
    detail: unavailableSelected.length
      ? `${unavailableSelected.length} selected provider(s) are unavailable.`
      : degradedSelected.length
        ? `${degradedSelected.length} selected provider(s) are degraded with fallbacks.`
        : 'All selected data-plane providers are healthy.',
    evidence: { selection: providerHealth.selection, providers: providerHealth.providers },
  })

  const maxProjectionLag = projections.reduce((max, item) => Math.max(max, item.lagSeconds ?? 0), 0)
  const unresolvedDeadLetters = projections.reduce((sum, item) => sum + item.unresolvedDeadLetters, 0)
  const failedProjectionConsumers = projections.filter((item) => ['FAILED','PAUSED'].includes(item.status.toUpperCase()))
  const projectionLimit = numeric(slo.max_projection_lag_seconds, 300)
  checks.push({
    key: 'PROJECTION_HEALTH',
    status: failedProjectionConsumers.length || unresolvedDeadLetters > 0 || maxProjectionLag > projectionLimit ? 'FAILED' : projections.length ? 'PASSED' : 'NOT_ASSESSED',
    detail: projections.length
      ? `${projections.length} consumer(s); max lag ${maxProjectionLag}s; ${unresolvedDeadLetters} unresolved dead letter(s).`
      : 'No projection consumers are registered for this project.',
    evidence: { maxProjectionLag, maxProjectionLagAllowed: projectionLimit, unresolvedDeadLetters, consumers: projections },
  })

  const jobs = jobsResult.data ?? []
  const deadJobs = jobs.filter((job) => String(job.status).toUpperCase() === 'DEAD')
  const failedJobs = jobs.filter((job) => String(job.status).toUpperCase() === 'FAILED')
  const deadJobRate = rate(deadJobs.length, jobs.length)
  const maxDeadJobRate = numeric(slo.max_dead_job_rate, 0.01)
  checks.push({
    key: 'DURABLE_JOB_HEALTH',
    status: jobs.length === 0 ? 'NOT_ASSESSED' : deadJobRate > maxDeadJobRate ? 'FAILED' : failedJobs.length > 0 ? 'PARTIAL' : 'PASSED',
    detail: jobs.length === 0
      ? 'No durable jobs ran in the last 24 hours.'
      : `${jobs.length} jobs in 24h; ${deadJobs.length} dead; ${failedJobs.length} failed; dead-job rate ${(deadJobRate * 100).toFixed(2)}%.`,
    evidence: { totalJobs: jobs.length, deadJobs: deadJobs.length, failedJobs: failedJobs.length, deadJobRate, maxDeadJobRate },
  })

  const drill = drillResult.data
  const drillPassed = drill && String(drill.status).toUpperCase() === 'PASSED' && String(drill.policy_result ?? '').toUpperCase() !== 'FAILED'
  checks.push({
    key: 'RECOVERY_DRILL',
    status: !drill ? 'NOT_ASSESSED' : drillPassed ? 'PASSED' : 'FAILED',
    detail: !drill ? 'No recovery drill evidence is recorded.' : `Latest ${drill.drill_type} drill is ${drill.status}${drill.policy_result ? ` (${drill.policy_result})` : ''}.`,
    evidence: drill ? { drill } : undefined,
  })

  const benchmark = benchmarkResult.data
  const benchmarkEvidence = benchmark?.evidence && typeof benchmark.evidence === 'object' && !Array.isArray(benchmark.evidence)
    ? benchmark.evidence as Record<string, unknown>
    : {}
  checks.push({
    key: 'HTTP_BENCHMARK',
    status: !benchmark ? 'NOT_ASSESSED' : String(benchmark.status).toUpperCase() === 'PASSED' ? 'PASSED' : 'FAILED',
    detail: !benchmark ? 'No persisted HTTP benchmark evidence is recorded.' : `Latest HTTP benchmark gate is ${benchmark.status}.`,
    evidence: benchmark ? { runId: benchmark.id, completedAt: benchmark.completed_at, benchmark: benchmarkEvidence } : undefined,
  })

  const contractRun = contractResult.data
  checks.push({
    key: 'PLATFORM_CONTRACTS',
    status: !contractRun ? 'NOT_ASSESSED' : String(contractRun.status).toUpperCase() === 'PASSED' ? 'PASSED' : 'FAILED',
    detail: !contractRun ? 'No platform contract-check evidence is recorded.' : `Latest platform contract check is ${contractRun.status}.`,
    evidence: contractRun ? { run: contractRun } : undefined,
  })

  return {
    projectId,
    evaluatedAt: new Date().toISOString(),
    status: overallStatus(checks),
    slo,
    checks,
  }
}

export async function persistProductionReadiness(input: {
  projectId: string
  gateName?: string
  actorUserId?: string | null
  notes?: string | null
}) {
  const admin = createAdminClient()
  const startedAt = new Date().toISOString()
  const result = await evaluateProductionReadiness(input.projectId)
  const completedAt = new Date().toISOString()
  const { data, error } = await admin.schema('orchestration').from('production_readiness_runs').insert({
    project_id: input.projectId,
    gate_name: input.gateName ?? 'PRODUCTION_GATE',
    status: result.status,
    started_at: startedAt,
    completed_at: completedAt,
    evidence: result,
    notes: input.notes?.trim() || null,
    created_by: input.actorUserId ?? null,
  }).select('id,status,gate_name,completed_at').single()
  if (error) throw new Error(`Unable to persist production readiness result: ${error.message}`)
  return { run: data, result }
}
