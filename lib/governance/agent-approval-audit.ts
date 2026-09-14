import { createAdminClient } from '@/lib/supabase/admin'

export async function finalizeAgentApprovalExecution(input: {
  requestId: string
  executorUserId: string
  executionEntityType: 'AGENT_RUN' | 'SUPERVISOR_RUN'
  executionEntityId: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('finalize_agent_approval_execution', {
    p_request_id: input.requestId,
    p_executor_user_id: input.executorUserId,
    p_execution_entity_type: input.executionEntityType,
    p_execution_entity_id: input.executionEntityId,
  })
  if (error) throw new Error(`Unable to finalize approved execution audit: ${error.message}`)
  return data
}
