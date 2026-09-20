import { createAdminClient } from '@/lib/supabase/admin'

export type GovernanceOutcomeHistoryPoint = {
  bucketStart: string
  reportCount: number
  measuredOverallAverage: number | null
  unresolvedIssues: number
  autonomousActions: number
  humanInterventions: number
  changesRevalidated: number
  criticalFindings: number
  highFindings: number
}

function dayBucket(value: unknown) {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10) + 'T00:00:00.000Z'
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function aggregateGovernanceOutcomeHistory(rows: Array<{
  createdAt: string
  report: unknown
}>): GovernanceOutcomeHistoryPoint[] {
  type Accumulator = {
    reportCount: number
    overall: number[]
    unresolvedIssues: number
    autonomousActions: number
    humanInterventions: number
    changesRevalidated: number
    criticalFindings: number
    highFindings: number
  }

  const grouped = new Map<string, Accumulator>()

  for (const row of rows) {
    const bucketStart = dayBucket(row.createdAt)
    if (!bucketStart) continue
    const report = record(row.report)
    const scores = record(report.scores)
    const overall = record(scores.overall)
    const autonomous = record(report.autonomousActivity)
    const findings = Array.isArray(report.findings) ? report.findings : []

    const group = grouped.get(bucketStart) ?? {
      reportCount: 0,
      overall: [],
      unresolvedIssues: 0,
      autonomousActions: 0,
      humanInterventions: 0,
      changesRevalidated: 0,
      criticalFindings: 0,
      highFindings: 0,
    }

    group.reportCount += 1
    const overallValue = finite(overall.value)
    if (overallValue !== null && overall.status !== 'NOT_MEASURED') group.overall.push(overallValue)

    for (const [key, destination] of [
      ['unresolvedIssues', 'unresolvedIssues'],
      ['autonomousActions', 'autonomousActions'],
      ['humanInterventions', 'humanInterventions'],
      ['changesRevalidated', 'changesRevalidated'],
    ] as const) {
      const value = finite(autonomous[key])
      if (value !== null) group[destination] += value
    }

    for (const findingValue of findings) {
      const finding = record(findingValue)
      if (!['UNRESOLVED', 'BLOCKED'].includes(String(finding.status ?? ''))) continue
      if (finding.severity === 'CRITICAL') group.criticalFindings += 1
      if (finding.severity === 'HIGH') group.highFindings += 1
    }

    grouped.set(bucketStart, group)
  }

  return [...grouped.entries()]
    .map(([bucketStart, group]) => ({
      bucketStart,
      reportCount: group.reportCount,
      measuredOverallAverage: group.overall.length
        ? Number((group.overall.reduce((sum, value) => sum + value, 0) / group.overall.length).toFixed(4))
        : null,
      unresolvedIssues: group.unresolvedIssues,
      autonomousActions: group.autonomousActions,
      humanInterventions: group.humanInterventions,
      changesRevalidated: group.changesRevalidated,
      criticalFindings: group.criticalFindings,
      highFindings: group.highFindings,
    }))
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))
}

export async function loadGovernanceOutcomeHistory(input: {
  projectId: string
  from?: string | null
  to?: string | null
  limit?: number
}) {
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.min(2000, Math.trunc(input.limit as number)))
    : 1000
  const admin = createAdminClient()
  let query = admin.schema('governance').from('governance_outcome_reports')
    .select('created_at,report_payload')
    .eq('project_id', input.projectId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (input.from) query = query.gte('created_at', input.from)
  if (input.to) query = query.lte('created_at', input.to)

  const { data, error } = await query
  if (error) throw new Error(`Unable to load governance outcome history: ${error.message}`)

  const rows = (data ?? []).map((row) => ({
    createdAt: String(row.created_at),
    report: row.report_payload,
  }))

  return {
    projectId: input.projectId,
    from: input.from ?? null,
    to: input.to ?? null,
    rowsRead: rows.length,
    buckets: aggregateGovernanceOutcomeHistory(rows),
  }
}
