import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceModelRegistry } from './governance-model-registry'

export type GovernanceRuntimePostureStatus =
  | 'NO_REGISTERED_MODELS'
  | 'NO_ROUTING_ELIGIBLE_MODELS'
  | 'NO_ROUTE_EXECUTION_EVIDENCE'
  | 'NO_EVALUATION_EVIDENCE'
  | 'OBSERVED'

export type GovernanceRuntimePosture = {
  status: GovernanceRuntimePostureStatus
  registeredCurrentVersions: number
  activeCurrentVersions: number
  routingEligibleCurrentVersions: number
  evaluatedCurrentVersions: number
  routeDecisionEvents: number
  evaluationResults: number
  evidenceModel: 'PERSISTED_GOVERNANCE_FACTS_ONLY'
}

function count(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function runtimeStatus(input: Omit<GovernanceRuntimePosture, 'status' | 'evidenceModel'>): GovernanceRuntimePostureStatus {
  if (input.registeredCurrentVersions === 0) return 'NO_REGISTERED_MODELS'
  if (input.routingEligibleCurrentVersions === 0) return 'NO_ROUTING_ELIGIBLE_MODELS'
  if (input.routeDecisionEvents === 0) return 'NO_ROUTE_EXECUTION_EVIDENCE'
  if (input.evaluationResults === 0) return 'NO_EVALUATION_EVIDENCE'
  return 'OBSERVED'
}

export async function loadGovernanceRuntimePosture(projectId: string): Promise<GovernanceRuntimePosture> {
  const admin = createAdminClient()
  const registry = createGovernanceModelRegistry()

  const [models, routeTelemetry, evaluationEvidence] = await Promise.all([
    registry.listCurrent({ projectId }),
    admin
      .schema('governance')
      .from('ai_telemetry_events')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('event_type', 'AI_ROUTE_DECISION'),
    admin
      .schema('governance')
      .from('ai_evaluation_results')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ])

  if (routeTelemetry.error) throw new Error(`Unable to read AI route telemetry posture: ${routeTelemetry.error.message}`)
  if (evaluationEvidence.error) throw new Error(`Unable to read AI evaluation posture: ${evaluationEvidence.error.message}`)

  const values = {
    registeredCurrentVersions: models.length,
    activeCurrentVersions: models.filter((model) => model.lifecycleStatus === 'ACTIVE').length,
    routingEligibleCurrentVersions: models.filter((model) => model.routingEligible).length,
    evaluatedCurrentVersions: models.filter((model) => model.evaluationScorecard.length > 0).length,
    routeDecisionEvents: count(routeTelemetry.count),
    evaluationResults: count(evaluationEvidence.count),
  }

  return {
    status: runtimeStatus(values),
    ...values,
    evidenceModel: 'PERSISTED_GOVERNANCE_FACTS_ONLY',
  }
}
