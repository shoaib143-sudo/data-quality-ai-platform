import type { EvaluationScorecardMetric } from './evaluation-engine'

export type RegisteredModelVersion = {
  aiSystemId: string
  aiSystemVersionId: string
  projectId: string
  systemKey: string
  systemName: string
  systemType: string
  lifecycleStatus: string
  versionNumber: number
  provider: string | null
  modelName: string | null
  externalVersion: string | null
  intendedUse: string
  riskTier: string
  dataCategories: unknown
  humanOversight: string
  configuration: Record<string, unknown>
  routingEligible: boolean
  eligibilityReason: string
  evaluationScorecard: EvaluationScorecardMetric[]
}

export type ModelRegistryRequest = {
  projectId: string
  capability?: string | null
  routingEligibleOnly?: boolean
}

export interface ModelRegistry {
  readonly id: string
  listCurrent(request: ModelRegistryRequest): Promise<RegisteredModelVersion[]>
}

export type ModelRegistryRow = {
  ai_system_id: string
  ai_system_version_id: string
  project_id: string
  system_key: string
  system_name: string
  system_type: string
  lifecycle_status: string
  version_number: number
  provider: string | null
  model_name: string | null
  external_version: string | null
  intended_use: string
  risk_tier: string
  data_categories: unknown
  human_oversight: string
  configuration: Record<string, unknown> | null
}

export type ModelRegistryDependencies = {
  listCurrent(projectId: string): Promise<ModelRegistryRow[]>
  evaluationScorecard(input: {
    projectId: string
    aiSystemVersionId: string
    capability?: string | null
  }): Promise<EvaluationScorecardMetric[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function eligibility(row: ModelRegistryRow) {
  if (row.lifecycle_status !== 'ACTIVE') {
    return { routingEligible: false, eligibilityReason: `LIFECYCLE_${row.lifecycle_status || 'UNKNOWN'}` }
  }
  if (!row.provider?.trim() || !row.model_name?.trim()) {
    return { routingEligible: false, eligibilityReason: 'PROVIDER_OR_MODEL_NOT_CONFIGURED' }
  }
  return { routingEligible: true, eligibilityReason: 'ACTIVE_HUMAN_APPROVED_CURRENT_VERSION' }
}

export class GovernanceModelRegistry implements ModelRegistry {
  readonly id = 'governance_ai_system_registry'
  private readonly dependencies: ModelRegistryDependencies

  constructor(dependencies: ModelRegistryDependencies) {
    this.dependencies = dependencies
  }

  async listCurrent(request: ModelRegistryRequest): Promise<RegisteredModelVersion[]> {
    const projectId = requiredText(request.projectId, 'projectId')
    const capability = request.capability?.trim() || null
    const rows = await this.dependencies.listCurrent(projectId)

    const entries = await Promise.all(rows.map(async (row) => {
      const state = eligibility(row)
      const evaluationScorecard = await this.dependencies.evaluationScorecard({
        projectId,
        aiSystemVersionId: row.ai_system_version_id,
        capability,
      })

      return {
        aiSystemId: row.ai_system_id,
        aiSystemVersionId: row.ai_system_version_id,
        projectId: row.project_id,
        systemKey: row.system_key,
        systemName: row.system_name,
        systemType: row.system_type,
        lifecycleStatus: row.lifecycle_status,
        versionNumber: row.version_number,
        provider: row.provider?.trim() || null,
        modelName: row.model_name?.trim() || null,
        externalVersion: row.external_version?.trim() || null,
        intendedUse: row.intended_use,
        riskTier: row.risk_tier,
        dataCategories: row.data_categories,
        humanOversight: row.human_oversight,
        configuration: row.configuration ?? {},
        ...state,
        evaluationScorecard,
      } satisfies RegisteredModelVersion
    }))

    return request.routingEligibleOnly ? entries.filter((entry) => entry.routingEligible) : entries
  }
}
