import { createAdminClient } from '@/lib/supabase/admin'
import {
  GovernedLearningEngine,
  type LearningEngine,
  type LearningPersistence,
} from './learning-engine'

export function createGovernanceLearningEngine(): LearningEngine {
  const supabase = createAdminClient()

  const persistence: LearningPersistence = {
    async listLearningCases({ projectId, limit }) {
      const { data, error } = await supabase
        .schema('agent')
        .from('agent_learning_cases')
        .select('id,project_id,source_agent_run_id,case_key,source_kind,problem_type,decision_status,outcome_status,effectiveness,confidence,evidence,status,occurred_at')
        .eq('project_id', projectId)
        .eq('status', 'ACTIVE')
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(limit)

      if (error) throw new Error(`Unable to assess agent learning cases: ${error.message}`)
      return data ?? []
    },

    async listSemanticMemories({ projectId, limit, now }) {
      const { data, error } = await supabase
        .schema('agent')
        .from('agent_memories')
        .select('id,project_id,source_agent_run_id,memory_key,memory_type,content,confidence,status,promoted_at,expires_at')
        .eq('project_id', projectId)
        .eq('memory_type', 'SEMANTIC')
        .eq('status', 'ACTIVE')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('promoted_at', { ascending: false })
        .limit(limit)

      if (error) throw new Error(`Unable to assess semantic agent memories: ${error.message}`)
      return data ?? []
    },
  }

  return new GovernedLearningEngine(persistence)
}
