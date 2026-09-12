import { NextResponse } from 'next/server'

import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import { authorizeDatasetVersion, AuthorizationError } from '@/lib/auth/authorize'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  let agentRunId: string | null = null
  let stepId: string | null = null
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const projectId = text(body.projectId ?? body.project_id)
    const datasetVersionId = text(body.datasetVersionId ?? body.dataset_version_id)

    if (!projectId || !datasetVersionId) {
      return NextResponse.json({ error: 'projectId and datasetVersionId are required.', code: 'INVALID_READINESS_REMEDIATION_REQUEST' }, { status: 400 })
    }

    const { dataset } = await authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')
    if (dataset.project_id !== projectId) {
      return NextResponse.json({ error: 'Dataset version does not belong to the requested project.', code: 'READINESS_REMEDIATION_PROJECT_MISMATCH' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: agentDefinition, error: agentDefinitionError } = await admin
      .schema('agent')
      .from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .eq('agent_key', 'profiling_agent')
      .eq('version', '2.0')
      .eq('enabled', true)
      .maybeSingle()
    if (agentDefinitionError) throw new Error(`Unable to resolve profiling remediation agent: ${agentDefinitionError.message}`)
    if (!agentDefinition) return NextResponse.json({ error: 'Profiling Agent 2.0 is not enabled.', code: 'READINESS_REMEDIATION_AGENT_UNAVAILABLE' }, { status: 503 })

    const now = new Date().toISOString()
    const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').insert({
      agent_definition_id: agentDefinition.id,
      project_id: projectId,
      dataset_id: dataset.id,
      dataset_version_id: datasetVersionId,
      status: 'RUNNING',
      input: {
        trigger: 'PROFILE_READINESS_AI_REMEDIATION',
        requested_by: user.id,
        project_id: projectId,
        dataset_version_id: datasetVersionId,
      },
      started_at: now,
    }).select('id').single()
    if (runError || !run) throw new Error(`Unable to create readiness remediation agent run: ${runError?.message ?? 'unknown error'}`)
    agentRunId = run.id

    const { data: step, error: stepError } = await admin.schema('agent').from('agent_run_steps').insert({
      agent_run_id: agentRunId,
      step_name: 'remediate_profile_readiness',
      step_order: 1,
      status: 'RUNNING',
      input: { projectId, datasetVersionId },
      started_at: now,
    }).select('id').single()
    if (stepError || !step) throw new Error(`Unable to create readiness remediation agent step: ${stepError?.message ?? 'unknown error'}`)
    stepId = step.id

    const execution = await executeProfilingExecutor(
      'remediate_profile_readiness',
      { datasetVersionId },
      {
        agentRunId,
        stepId,
        projectId,
        agentDefinitionId: agentDefinition.id,
        agentVersion: agentDefinition.version,
      },
    )
    const remediation = execution.output.result && typeof execution.output.result === 'object' && !Array.isArray(execution.output.result)
      ? execution.output.result as Record<string, unknown>
      : execution.output
    const completedAt = new Date().toISOString()

    await admin.schema('agent').from('agent_run_steps').update({
      status: 'SUCCEEDED',
      output: remediation,
      completed_at: completedAt,
      error_code: null,
      error_message: null,
    }).eq('id', stepId)
    await admin.schema('agent').from('agent_runs').update({
      status: 'SUCCEEDED',
      output: remediation,
      completed_at: completedAt,
      error_code: null,
      error_message: null,
    }).eq('id', agentRunId)

    return NextResponse.json({ agentRunId, remediation })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: 'READINESS_REMEDIATION_ACCESS_DENIED' }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'AI readiness remediation failed.'
    if (agentRunId) {
      const admin = createAdminClient()
      const completedAt = new Date().toISOString()
      if (stepId) {
        await admin.schema('agent').from('agent_run_steps').update({
          status: 'FAILED',
          error_code: 'READINESS_REMEDIATION_FAILED',
          error_message: message,
          completed_at: completedAt,
        }).eq('id', stepId).in('status', ['PENDING','RUNNING','RETRYING'])
      }
      await admin.schema('agent').from('agent_runs').update({
        status: 'FAILED',
        error_code: 'READINESS_REMEDIATION_FAILED',
        error_message: message,
        completed_at: completedAt,
      }).eq('id', agentRunId).in('status', ['CREATED','QUEUED','RUNNING','WAITING'])
    }

    return NextResponse.json({ error: message, code: 'READINESS_REMEDIATION_FAILED' }, { status: 500 })
  }
}
