import { createAdminClient } from '@/lib/supabase/admin'

type LearningRow = {
  recommendation_action: string
  priority: string | null
  status: string
  effective: boolean | null
  evidence: unknown
  created_at: string
  updated_at: string
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function finite(value: unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:null }

export async function getDataQualityRecommendationEffectiveness(input: {
  projectId: string
  days?: number
}) {
  const admin = createAdminClient()
  const days = Math.max(1, Math.min(3650, Math.trunc(input.days ?? 90)))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await admin.schema('governance').from('data_quality_recommendation_learning')
    .select('recommendation_action,priority,status,effective,evidence,created_at,updated_at')
    .eq('project_id', input.projectId)
    .gte('created_at', since)
    .order('updated_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(`Unable to load Data Quality recommendation learning: ${error.message}`)

  const rows = (data ?? []) as LearningRow[]
  const byAction = new Map<string, {
    action: string
    attempts: number
    verified: number
    effective: number
    ineffective: number
    pending: number
    sourceFailed: number
    verificationFailed: number
    measuredRuns: number
    priorities: Record<string, number>
  }>()

  for (const row of rows) {
    const action = text(row.recommendation_action) || 'unknown_action'
    const entry = byAction.get(action) ?? { action, attempts: 0, verified: 0, effective: 0, ineffective: 0, pending: 0, sourceFailed: 0, verificationFailed: 0, measuredRuns: 0, priorities: {} }
    entry.attempts += 1
    if (row.effective === true) entry.effective += 1
    else if (row.effective === false || row.status === 'INEFFECTIVE') entry.ineffective += 1
    else entry.pending += 1
    if (row.status === 'VERIFIED') entry.verified += 1
    const priority = text(row.priority).toUpperCase() || 'UNSPECIFIED'
    entry.priorities[priority] = (entry.priorities[priority] ?? 0) + 1
    const evidence = object(row.evidence)
    const sourceFailed = finite(evidence.source_failed_rule_count)
    const verificationFailed = finite(evidence.verification_failed_rule_count)
    if (sourceFailed !== null && verificationFailed !== null) {
      entry.sourceFailed += sourceFailed
      entry.verificationFailed += verificationFailed
      entry.measuredRuns += 1
    }
    byAction.set(action, entry)
  }

  const actions = [...byAction.values()].map((entry) => {
    const decided = entry.effective + entry.ineffective
    const failureReduction = entry.measuredRuns ? entry.sourceFailed - entry.verificationFailed : null
    const averageFailureReduction = entry.measuredRuns ? failureReduction! / entry.measuredRuns : null
    return {
      action: entry.action,
      attempts: entry.attempts,
      verified: entry.verified,
      effective: entry.effective,
      ineffective: entry.ineffective,
      pending: entry.pending,
      effectivenessRate: decided ? entry.effective / decided : null,
      averageFailureReduction,
      priorities: entry.priorities,
    }
  }).sort((a,b) => {
    const aRate = a.effectivenessRate ?? -1
    const bRate = b.effectivenessRate ?? -1
    return bRate - aRate || b.attempts - a.attempts || a.action.localeCompare(b.action)
  })

  const decided = rows.filter((row) => row.effective !== null || row.status === 'INEFFECTIVE').length
  const effective = rows.filter((row) => row.effective === true).length
  const ineffective = rows.filter((row) => row.effective === false || row.status === 'INEFFECTIVE').length
  return {
    projectId: input.projectId,
    windowDays: days,
    totalRecommendations: rows.length,
    decidedRecommendations: decided,
    effectiveRecommendations: effective,
    ineffectiveRecommendations: ineffective,
    pendingRecommendations: Math.max(0, rows.length - decided),
    effectivenessRate: decided ? effective / decided : null,
    actions,
  }
}
