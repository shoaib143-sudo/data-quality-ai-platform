import { createAdminClient } from '@/lib/supabase/admin'
import { executeApprovedGovernedAction } from '@/lib/governance/governed-autonomy'
import { queueGovernedReprofile } from '@/lib/profiling/queue-governed-reprofile'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export async function executeApprovedAutonomyAction(actionId: string, actorUserId: string) {
  const admin = createAdminClient()
  const { data: action, error: actionError } = await admin.schema('governance').from('autonomy_actions')
    .select('*')
    .eq('id', actionId)
    .maybeSingle()
  if (actionError || !action) throw new Error(`Unable to resolve approved autonomy action: ${actionError?.message ?? 'not found'}`)

  if (action.action_key !== 'REQUEST_REPROFILE') {
    return executeApprovedGovernedAction(actionId, actorUserId)
  }
  if (action.status === 'EXECUTED' || action.status === 'ROLLED_BACK') return action
  if (action.target_type !== 'DATASET_VERSION' || !action.target_id) throw new Error('Approved reprofile action requires a governed DATASET_VERSION target.')
  if (!action.approval_workflow_instance_id) throw new Error('Approved reprofile action is missing its approval workflow.')

  const { data: workflow, error: workflowError } = await admin.schema('governance').from('workflow_instances')
    .select('id,project_id,status,completed_at')
    .eq('id', action.approval_workflow_instance_id)
    .eq('project_id', action.project_id)
    .maybeSingle()
  if (workflowError || !workflow) throw new Error(`Unable to resolve approved reprofile workflow: ${workflowError?.message ?? 'not found'}`)
  if (workflow.status === 'REJECTED' || workflow.status === 'CANCELLED') {
    await admin.schema('governance').from('autonomy_actions').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', action.id)
    throw new Error(`Approved reprofile cannot execute because workflow is ${workflow.status}.`)
  }
  if (workflow.status !== 'APPROVED') throw new Error('Reprofile autonomy action requires explicit human workflow approval before execution.')

  const { data: claimed, error: claimError } = await admin.schema('governance').from('autonomy_actions').update({
    status: 'EXECUTING',
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', action.id).eq('project_id', action.project_id).in('status', ['AWAITING_APPROVAL','APPROVED']).select('*').maybeSingle()
  if (claimError) throw new Error(`Unable to claim approved reprofile action: ${claimError.message}`)
  if (!claimed) {
    const current = await admin.schema('governance').from('autonomy_actions').select('*').eq('id', action.id).eq('project_id', action.project_id).maybeSingle()
    if (current.error || !current.data) throw new Error(`Unable to resolve approved reprofile after claim: ${current.error?.message ?? 'not found'}`)
    return current.data
  }

  try {
    const queued = await queueGovernedReprofile({
      projectId: claimed.project_id,
      datasetVersionId: claimed.target_id,
      actorUserId,
      autonomyActionId: claimed.id,
    })
    const { data: completed, error: completeError } = await admin.schema('governance').from('autonomy_actions').update({
      status: 'EXECUTED',
      result: {
        action: 'REQUEST_REPROFILE',
        durable_job_id: queued.durableJobId,
        profiling_agent_run_id: queued.agentRunId,
        profiling_run_id: queued.profilingRunId,
        queue_status: queued.status,
        reused: queued.reused,
        production_source_mutation: false,
        human_approval_workflow_id: workflow.id,
        approved_by: actorUserId,
      },
      rollback: { supported: false, reason: 'Reprofile execution is a compute/read-side effect and is not rolled back after execution.' },
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', claimed.id).select('*').single()
    if (completeError || !completed) throw new Error(`Unable to persist approved reprofile execution: ${completeError?.message ?? 'unknown error'}`)

    await writeGovernanceAudit({
      projectId: claimed.project_id,
      actorUserId,
      actorType: 'USER',
      eventType: 'GOVERNED_AUTONOMY_REPROFILE_QUEUED',
      entityType: 'DATASET_VERSION',
      entityId: claimed.target_id,
      correlationId: claimed.id,
      metadata: {
        autonomy_action_id: claimed.id,
        approval_workflow_instance_id: workflow.id,
        durable_job_id: queued.durableJobId,
        profiling_agent_run_id: queued.agentRunId,
        profiling_run_id: queued.profilingRunId,
        production_source_mutation: false,
        human_approval_verified: true,
      },
    })
    return completed
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approved governed reprofile failed.'
    await admin.schema('governance').from('autonomy_actions').update({
      status: 'FAILED',
      error_message: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq('id', claimed.id)
    throw error
  }
}
