import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import type { ToolExecutionContext } from '@/lib/agents/types'

const PRODUCTION_AGENT_KEY = 'profiling_agent'
const PRODUCTION_AGENT_VERSION = '2.0'
const TERMINATED_ERROR_CODE = 'TERMINATED_BY_USER'

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function isRunCancelled(admin: ReturnType<typeof createAdminClient>, agentRunId: string) {
  const { data, error } = await admin
    .schema('agent')
    .from('agent_runs')
    .select('status')
    .eq('id', agentRunId)
    .maybeSingle()

  if (error) throw new Error(`Unable to verify agent run status: ${error.message}`)
  return data?.status === 'CANCELLED'
}

async function preserveCancellation(
  admin: ReturnType<typeof createAdminClient>,
  agentRunId: string,
  profilingRunId: string,
  stepId?: string,
) {
  const now = new Date().toISOString()
  const message = 'Execution completion raced with a manual termination request. Cancellation state was preserved.'

  if (stepId) {
    await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        status: 'SKIPPED',
        error_code: TERMINATED_ERROR_CODE,
        error_message: message,
        completed_at: now,
      })
      .eq('id', stepId)
      .in('status', ['PENDING', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'COMPLETED'])
  }

  await admin
    .schema('profiling')
    .from('profile_runs')
    .update({
      status: 'CANCELLED',
      error_code: TERMINATED_ERROR_CODE,
      error_message: message,
      completed_at: now,
    })
    .eq('id', profilingRunId)
    .neq('status', 'CANCELLED')

  await admin
    .schema('agent')
    .from('agent_runs')
    .update({
      status: 'CANCELLED',
      error_code: TERMINATED_ERROR_CODE,
      error_message: message,
      completed_at: now,
    })
    .eq('id', agentRunId)
    .neq('status', 'CANCELLED')
}

export async function POST(request: Request) {
  let agentRunId: string | null = null
  let profilingRunId: string | null = null
  let stepId: string | null = null

  try {
    const user = await requireUser()
    const supabase = await createClient()
    const admin = createAdminClient()
    const body = await request.json()

    const projectId = typeof body.projectId === 'string' ? body.projectId : null
    const datasetVersionId = typeof body.datasetVersionId === 'string' ? body.datasetVersionId : null
    const agentDefinitionId = typeof body.agentDefinitionId === 'string' ? body.agentDefinitionId : null

    if (!projectId || !datasetVersionId || !agentDefinitionId) {
      return NextResponse.json(
        { error: 'projectId, datasetVersionId, and agentDefinitionId are required.' },
        { status: 400 },
      )
    }

    const { data: project, error: projectError } = await admin
      .schema('app')
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    }

    const { data: membership, error: membershipError } = await admin
      .schema('app')
      .from('organization_members')
      .select('organization_id, user_id')
      .eq('organization_id', project.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    }

    const { data: agentDefinition, error: agentError } = await supabase
      .schema('agent')
      .from('agent_definitions')
      .select('id, agent_key, name, version, configuration, enabled')
      .eq('id', agentDefinitionId)
      .eq('enabled', true)
      .single()

    if (agentError || !agentDefinition) {
      return NextResponse.json(
        { error: 'The selected agent is unavailable.' },
        { status: 404 },
      )
    }

    if (
      typeof agentDefinition.id !== 'string' ||
      typeof agentDefinition.version !== 'string'
    ) {
      return NextResponse.json(
        { error: 'The selected agent definition is invalid.' },
        { status: 500 },
      )
    }

    const productionAgentId: string = agentDefinition.id
    const productionAgentVersion: string = agentDefinition.version

    if (
      agentDefinition.agent_key !== PRODUCTION_AGENT_KEY ||
      productionAgentVersion !== PRODUCTION_AGENT_VERSION
    ) {
      return NextResponse.json(
        { error: 'Only Profiling Agent 2.0 is available for production execution.' },
        { status: 400 },
      )
    }

    const { data: datasetVersion, error: datasetError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id, dataset_id, datasets!inner(id, project_id, name)')
      .eq('id', datasetVersionId)
      .eq('datasets.project_id', projectId)
      .single()

    if (datasetError || !datasetVersion) {
      return NextResponse.json(
        { error: 'The selected dataset version is unavailable for this project.' },
        { status: 404 },
      )
    }

    if (typeof datasetVersion.id !== 'string' || typeof datasetVersion.dataset_id !== 'string') {
      throw new Error('The selected dataset version is invalid.')
    }

    const input = {
      datasetVersionId,
      options: asObject(body.options),
    }

    const { data: agentRun, error: agentRunError } = await admin
      .schema('agent')
      .from('agent_runs')
      .insert({
        agent_definition_id: productionAgentId,
        project_id: projectId,
        dataset_id: datasetVersion.dataset_id,
        dataset_version_id: datasetVersion.id,
        status: 'RUNNING',
        input,
        started_at: new Date().toISOString(),
      })
      .select('id, correlation_id')
      .single()

    if (agentRunError || !agentRun || typeof agentRun.id !== 'string') {
      throw new Error(`Unable to create agent run: ${agentRunError?.message ?? 'unknown error'}`)
    }

    const executionAgentRunId = agentRun.id
    agentRunId = executionAgentRunId

    const { data: profilingRun, error: profilingRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .insert({
        dataset_version_id: datasetVersion.id,
        agent_run_id: executionAgentRunId,
        engine_name: 'profiling-executor',
        engine_version: productionAgentVersion,
        sampling_mode: 'ADAPTIVE',
        sampling_size: Number(asObject(agentDefinition.configuration).default_sample_rows) || null,
        configuration: {
          agent_definition_id: productionAgentId,
          agent_key: agentDefinition.agent_key,
          agent_version: productionAgentVersion,
          options: asObject(body.options),
        },
      })
      .select('id')
      .single()

    if (profilingRunError || !profilingRun || typeof profilingRun.id !== 'string') {
      throw new Error(`Unable to create profiling run: ${profilingRunError?.message ?? 'unknown error'}`)
    }

    const executionProfilingRunId = profilingRun.id
    profilingRunId = executionProfilingRunId

    const { data: profileTool, error: profileToolError } = await supabase
      .schema('agent')
      .from('tool_definitions')
      .select('id, tool_key, version')
      .eq('agent_definition_id', productionAgentId)
      .eq('tool_key', 'profile_dataset')
      .eq('enabled', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (profileToolError || !profileTool) {
      throw new Error('The selected Profiling Agent has no enabled profile_dataset tool.')
    }

    if (
      typeof profileTool.id !== 'string' ||
      typeof profileTool.tool_key !== 'string' ||
      typeof profileTool.version !== 'string'
    ) {
      throw new Error('The selected Profiling Agent profile tool definition is invalid.')
    }

    const { data: metricTool, error: metricToolError } = await supabase
      .schema('agent')
      .from('tool_definitions')
      .select('id, tool_key, version')
      .eq('agent_definition_id', productionAgentId)
      .eq('tool_key', 'execute_metrics')
      .eq('enabled', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (metricToolError || !metricTool) {
      throw new Error('The selected Profiling Agent has no enabled execute_metrics tool.')
    }

    if (
      typeof metricTool.id !== 'string' ||
      typeof metricTool.tool_key !== 'string' ||
      typeof metricTool.version !== 'string'
    ) {
      throw new Error('The selected Profiling Agent metric tool definition is invalid.')
    }

    const profileStep = await admin
      .schema('agent')
      .from('agent_run_steps')
      .insert({
        agent_run_id: executionAgentRunId,
        step_name: profileTool.tool_key,
        step_order: 1,
        status: 'RUNNING',
        input: {
          ...input,
          profilingRunId: executionProfilingRunId,
          tool_definition_id: profileTool.id,
          tool_version: profileTool.version,
        },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (profileStep.error || !profileStep.data || typeof profileStep.data.id !== 'string') {
      throw new Error(`Unable to create profiling step: ${profileStep.error?.message ?? 'unknown error'}`)
    }

    const executionProfileStepId = profileStep.data.id
    stepId = executionProfileStepId

    const profileContext: ToolExecutionContext = {
      agentRunId: executionAgentRunId,
      stepId: executionProfileStepId,
      projectId,
      agentDefinitionId: productionAgentId,
      agentVersion: productionAgentVersion,
    }

    const profileResult = await executeProfilingExecutor(
      'profile_dataset',
      {
        ...input,
        profilingRunId: executionProfilingRunId,
      },
      profileContext,
    )

    if (await isRunCancelled(admin, executionAgentRunId)) {
      await preserveCancellation(admin, executionAgentRunId, executionProfilingRunId, executionProfileStepId)
      return NextResponse.json({
        execution_completed: false,
        terminated: true,
        agentRunId: executionAgentRunId,
        profilingRunId: executionProfilingRunId,
      }, { status: 409 })
    }

    const profileCompletedAt = new Date().toISOString()
    await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        status: 'SUCCEEDED',
        output: profileResult,
        completed_at: profileCompletedAt,
      })
      .eq('id', executionProfileStepId)
      .neq('status', 'SKIPPED')

    const metricStep = await admin
      .schema('agent')
      .from('agent_run_steps')
      .insert({
        agent_run_id: executionAgentRunId,
        step_name: metricTool.tool_key,
        step_order: 2,
        status: 'RUNNING',
        input: {
          ...input,
          profilingRunId: executionProfilingRunId,
          tool_definition_id: metricTool.id,
          tool_version: metricTool.version,
        },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (metricStep.error || !metricStep.data || typeof metricStep.data.id !== 'string') {
      throw new Error(`Unable to create metric execution step: ${metricStep.error?.message ?? 'unknown error'}`)
    }

    const executionMetricStepId = metricStep.data.id
    stepId = executionMetricStepId

    if (await isRunCancelled(admin, executionAgentRunId)) {
      await preserveCancellation(admin, executionAgentRunId, executionProfilingRunId, executionMetricStepId)
      return NextResponse.json({
        execution_completed: false,
        terminated: true,
        agentRunId: executionAgentRunId,
        profilingRunId: executionProfilingRunId,
      }, { status: 409 })
    }

    const metricContext: ToolExecutionContext = {
      agentRunId: executionAgentRunId,
      stepId: executionMetricStepId,
      projectId,
      agentDefinitionId: productionAgentId,
      agentVersion: productionAgentVersion,
    }

    const metricResult = await executeProfilingExecutor(
      'execute_metrics',
      {
        ...input,
        profilingRunId: executionProfilingRunId,
      },
      metricContext,
    )

    if (await isRunCancelled(admin, executionAgentRunId)) {
      await preserveCancellation(admin, executionAgentRunId, executionProfilingRunId, executionMetricStepId)
      return NextResponse.json({
        execution_completed: false,
        terminated: true,
        agentRunId: executionAgentRunId,
        profilingRunId: executionProfilingRunId,
      }, { status: 409 })
    }

    const completedAt = new Date().toISOString()
    await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        status: 'SUCCEEDED',
        output: metricResult,
        completed_at: completedAt,
      })
      .eq('id', executionMetricStepId)
      .neq('status', 'SKIPPED')

    const result = {
      execution_completed: true,
      agent_run_id: executionAgentRunId,
      profiling_run_id: executionProfilingRunId,
      project_id: projectId,
      dataset_version_id: datasetVersion.id,
      profile: profileResult,
      metrics: metricResult,
    }

    const { error: finalRunError } = await admin
      .schema('agent')
      .from('agent_runs')
      .update({
        status: 'SUCCEEDED',
        output: result,
        completed_at: completedAt,
      })
      .eq('id', executionAgentRunId)
      .neq('status', 'CANCELLED')

    if (finalRunError) throw new Error(`Unable to finalize agent run: ${finalRunError.message}`)

    return NextResponse.json({
      agentRunId: executionAgentRunId,
      profilingRunId: executionProfilingRunId,
      stepId: executionMetricStepId,
      agentDefinitionId: productionAgentId,
      agentVersion: productionAgentVersion,
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown execution error'
    const admin = createAdminClient()
    const completedAt = new Date().toISOString()
    let cancelled = false

    if (agentRunId) {
      try {
        cancelled = await isRunCancelled(admin, agentRunId)
      } catch {
        cancelled = false
      }
    }

    if (cancelled) {
      if (profilingRunId) {
        await preserveCancellation(admin, agentRunId, profilingRunId, stepId ?? undefined)
      }
      return NextResponse.json({
        execution_completed: false,
        terminated: true,
        agentRunId,
        profilingRunId,
      }, { status: 409 })
    }

    if (stepId) {
      await admin
        .schema('agent')
        .from('agent_run_steps')
        .update({
          status: 'FAILED',
          error_code: 'PROFILING_EXECUTION_FAILED',
          error_message: message,
          completed_at: completedAt,
        })
        .eq('id', stepId)
        .neq('status', 'SKIPPED')
    }

    if (agentRunId) {
      await admin
        .schema('agent')
        .from('agent_runs')
        .update({
          status: 'FAILED',
          error_code: 'PROFILING_EXECUTION_FAILED',
          error_message: message,
          completed_at: completedAt,
        })
        .eq('id', agentRunId)
        .neq('status', 'CANCELLED')
    }

    if (profilingRunId) {
      await admin
        .schema('profiling')
        .from('profile_runs')
        .update({
          status: 'FAILED',
          error_code: 'PROFILING_EXECUTION_FAILED',
          error_message: message,
          completed_at: completedAt,
        })
        .eq('id', profilingRunId)
        .neq('status', 'CANCELLED')
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
