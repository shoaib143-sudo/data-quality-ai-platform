import { createAdminClient } from '@/lib/supabase/admin'
import {
  CanonicalMemoryProvider,
  type MemoryPersistence,
  type MemoryProvider,
} from './memory-provider'

function hasGovernedOutcomeEvidence(evidence: unknown) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return false
  const outcomeId = (evidence as Record<string, unknown>).governed_action_outcome_id
  return typeof outcomeId === 'string' && outcomeId.trim().length > 0
}

export function createGovernanceMemoryProvider(): MemoryProvider {
  const supabase = createAdminClient()

  const persistence: MemoryPersistence = {
    async listWorking({ projectId, agentRunId, limit, now }) {
      const { data, error } = await supabase
        .schema('agent')
        .from('agent_working_memory')
        .select('id,project_id,agent_run_id,memory_key,content,expires_at,created_at,updated_at')
        .eq('project_id', projectId)
        .eq('agent_run_id', agentRunId)
        .gt('expires_at', now)
        .order('updated_at', { ascending: false })
        .limit(limit)

      if (error) throw new Error(`Unable to read working memory: ${error.message}`)
      return data ?? []
    },

    async listEpisodic({ projectId, limit }) {
      const { data, error } = await supabase
        .schema('agent')
        .from('agent_learning_cases')
        .select('id,project_id,source_agent_run_id,case_key,source_kind,problem_type,context,decision_status,outcome_status,effectiveness,confidence,evidence,status,occurred_at')
        .eq('project_id', projectId)
        .eq('status', 'ACTIVE')
        .eq('decision_status', 'VERIFIED')
        .eq('outcome_status', 'VERIFIED')
        .eq('source_kind', 'GOVERNED_ACTION_OUTCOME')
        .not('source_agent_run_id', 'is', null)
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(limit)

      if (error) throw new Error(`Unable to read episodic memory: ${error.message}`)
      return (data ?? []).filter((row) => hasGovernedOutcomeEvidence(row.evidence))
    },
  }

  return new CanonicalMemoryProvider(persistence)
}
