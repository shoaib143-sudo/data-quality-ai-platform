import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceEvaluationEngine } from './governance-evaluation-engine'
import { GovernanceModelRegistry, type ModelRegistry, type ModelRegistryDependencies } from './model-registry'

export function createGovernanceModelRegistry(): ModelRegistry {
  const supabase = createAdminClient()
  const evaluation = createGovernanceEvaluationEngine()

  const dependencies: ModelRegistryDependencies = {
    async listCurrent(projectId) {
      const { data, error } = await supabase
        .schema('governance')
        .from('ai_systems')
        .select(`
          id,
          project_id,
          system_key,
          name,
          system_type,
          lifecycle_status,
          current_version_id,
          ai_system_versions!ai_systems_current_version_fk(
            id,
            version_number,
            provider,
            model_name,
            external_version,
            configuration,
            intended_use,
            risk_tier,
            data_categories,
            human_oversight
          )
        `)
        .eq('project_id', projectId)
        .not('current_version_id', 'is', null)

      if (error) throw new Error(`Unable to read governed model registry: ${error.message}`)

      return (data ?? []).flatMap((row: any) => {
        const version = Array.isArray(row.ai_system_versions) ? row.ai_system_versions[0] : row.ai_system_versions
        if (!version?.id) return []
        return [{
          ai_system_id: row.id,
          ai_system_version_id: version.id,
          project_id: row.project_id,
          system_key: row.system_key,
          system_name: row.name,
          system_type: row.system_type,
          lifecycle_status: row.lifecycle_status,
          version_number: version.version_number,
          provider: version.provider,
          model_name: version.model_name,
          external_version: version.external_version,
          intended_use: version.intended_use,
          risk_tier: version.risk_tier,
          data_categories: version.data_categories,
          human_oversight: version.human_oversight,
          configuration: version.configuration,
        }]
      })
    },

    evaluationScorecard: ({ projectId, aiSystemVersionId, capability }) => evaluation.scorecard({
      projectId,
      aiSystemVersionId,
      capability: capability ?? null,
    }),
  }

  return new GovernanceModelRegistry(dependencies)
}
