import { createAdminClient } from '@/lib/supabase/admin'
import {
  DurableEvaluationEngine,
  type EvaluationEngine,
  type EvaluationPersistence,
} from './evaluation-engine'

export function createGovernanceEvaluationEngine(): EvaluationEngine {
  const supabase = createAdminClient()

  const persistence: EvaluationPersistence = {
    async insert(record) {
      const { data, error } = await supabase
        .schema('governance')
        .from('ai_evaluation_results')
        .insert(record)
        .select('id')
        .single()

      if (error) throw new Error(`Unable to persist AI evaluation result: ${error.message}`)
      if (!data?.id) throw new Error('Unable to persist AI evaluation result: no result id returned')
      return { id: data.id }
    },

    async scorecard(request) {
      const { data, error } = await supabase
        .schema('governance')
        .rpc('ai_evaluation_scorecard', {
          p_project_id: request.projectId,
          p_ai_system_version_id: request.aiSystemVersionId ?? null,
          p_evaluation_type: request.evaluationType ?? null,
          p_capability: request.capability ?? null,
        })

      if (error) throw new Error(`Unable to read AI evaluation scorecard: ${error.message}`)
      return data ?? []
    },
  }

  return new DurableEvaluationEngine(persistence)
}
