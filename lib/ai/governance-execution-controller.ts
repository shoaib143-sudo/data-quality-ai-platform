import { createAdminClient } from '@/lib/supabase/admin'
import {
  GovernedExecutionController,
  type ExecutionControlPersistence,
  type ExecutionControlRow,
} from './execution-controller'

export function createGovernanceExecutionController() {
  const admin = createAdminClient()
  const persistence: ExecutionControlPersistence = {
    async listEffectiveControls(projectId) {
      const { data, error } = await admin.schema('governance').from('ai_execution_control_effective')
        .select('id,project_id,scope_type,scope_key,control_action,effective_state,reason,actor_user_id,actor_capability,correlation_id,created_at')
        .eq('project_id', projectId)
      if (error) throw new Error(`Unable to resolve effective AI execution controls: ${error.message}`)
      return (data ?? []) as ExecutionControlRow[]
    },
  }

  return new GovernedExecutionController(persistence)
}
