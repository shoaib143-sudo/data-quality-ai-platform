import { createAdminClient } from '@/lib/supabase/admin'
import {
  GovernedCommandCenterState,
  type CommandCenterPersistence,
} from './command-center-state'

export function createGovernanceCommandCenterState() {
  const supabase = createAdminClient()

  const persistence: CommandCenterPersistence = {
    async listAiSystems(projectId) {
      const { data, error } = await supabase
        .schema('governance')
        .from('ai_systems')
        .select('id,project_id,system_key,name,system_type,lifecycle_status,current_version_id')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
      if (error) throw new Error(`Unable to read AI system controls: ${error.message}`)
      return data ?? []
    },

    async listAutonomyPolicies(projectId) {
      const { data, error } = await supabase
        .schema('governance')
        .from('autonomy_policies')
        .select('id,project_id,action_key,enabled,execution_mode,min_confidence,max_auto_risk_level,reversible,authority_status,reviewed_by,reviewed_at,current_version_id')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
      if (error) throw new Error(`Unable to read autonomy policies: ${error.message}`)
      return data ?? []
    },

    async listAutonomyActions(projectId) {
      const { data, error } = await supabase
        .schema('governance')
        .from('autonomy_actions')
        .select('id,project_id,action_key,risk_level,confidence,status,approval_workflow_instance_id,policy_version_id,created_at,executed_at,rolled_back_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(`Unable to read autonomy actions: ${error.message}`)
      return data ?? []
    },
  }

  return new GovernedCommandCenterState(persistence)
}
