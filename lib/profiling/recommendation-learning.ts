import { createAdminClient } from '@/lib/supabase/admin'

type RecommendationLearningRow = {
  recommendation_action: string
  status: string
  effective: boolean | null
  quality_score_delta: number | string | null
  high_severity_findings_delta: number | null
  observed_at: string | null
}

export type RecommendationEffectiveness = {
  action: string
  attempts: number
  effective: number
  ineffective: number
  success_rate: number | null
  average_quality_score_delta: number | null
  average_high_severity_findings_delta: number | null
  last_observed_at: string | null
}

function numeric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export async function loadRecommendationEffectiveness(
  projectId: string,
  actions?: string[],
): Promise<RecommendationEffectiveness[]> {
  const admin = createAdminClient()
  let query = admin
    .schema('governance')
    .from('profiling_recommendation_learning')
    .select('recommendation_action,status,effective,quality_score_delta,high_severity_findings_delta,observed_at')
    .eq('project_id', projectId)
    .in('status', ['EFFECTIVE', 'INEFFECTIVE'])
    .order('observed_at', { ascending: false })
    .limit(1000)

  const requestedActions = [...new Set((actions ?? []).map((action) => action.trim()).filter(Boolean))]
  if (requestedActions.length) query = query.in('recommendation_action', requestedActions)

  const { data, error } = await query
  if (error) throw new Error(`Unable to load recommendation effectiveness: ${error.message}`)

  const grouped = new Map<string, RecommendationLearningRow[]>()
  for (const row of (data ?? []) as RecommendationLearningRow[]) {
    const action = row.recommendation_action?.trim()
    if (!action) continue
    const rows = grouped.get(action) ?? []
    rows.push(row)
    grouped.set(action, rows)
  }

  return [...grouped.entries()]
    .map(([action, rows]) => {
      const effective = rows.filter((row) => row.effective === true || row.status === 'EFFECTIVE').length
      const ineffective = rows.filter((row) => row.effective === false || row.status === 'INEFFECTIVE').length
      const attempts = effective + ineffective
      const qualityDeltas = rows.map((row) => numeric(row.quality_score_delta)).filter((value): value is number => value !== null)
      const severityDeltas = rows.map((row) => numeric(row.high_severity_findings_delta)).filter((value): value is number => value !== null)

      return {
        action,
        attempts,
        effective,
        ineffective,
        success_rate: attempts ? round(effective / attempts) : null,
        average_quality_score_delta: qualityDeltas.length
          ? round(qualityDeltas.reduce((sum, value) => sum + value, 0) / qualityDeltas.length)
          : null,
        average_high_severity_findings_delta: severityDeltas.length
          ? round(severityDeltas.reduce((sum, value) => sum + value, 0) / severityDeltas.length)
          : null,
        last_observed_at: rows.find((row) => row.observed_at)?.observed_at ?? null,
      }
    })
    .sort((left, right) => right.attempts - left.attempts || left.action.localeCompare(right.action))
}
