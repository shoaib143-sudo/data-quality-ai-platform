import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { executeProfilingExecutor } from '@/lib/agents/executors/profiling-executor'
import type { ToolExecutionContext } from '@/lib/agents/types'

const PRODUCTION_AGENT_KEY = 'profiling_agent'
const PRODUCTION_AGENT_VERSION = '2.0'

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
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

    const { data: membership, error: membershipError } = await supabase
      .schema('catalog')
      .from('project_members')
      .select('project_id')
      .eq('project_id', projectId)
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

    const { data: datasetVersion, error: datasetError } = await supabase
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

    if (agentRunError || !agentRun) {
      throw new Error(`Unable to create agent run: ${agentRunError?.message ?? 'unknown error'}`)
    }

    agentRunId = agentRun.id

    const { data: profilingRun, error: profilingRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .insert({
        dataset_version_id: datasetVersion.id,
        agent_run_id: agentRun.id,
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

    if (profilingRunError || !profilingRun) {
      throw new Error(`Unable to create profiling run: ${profilingRunError?.message ?? 'unknown error'}`)
    }

    profilingRunId = profilingRun.id

    const { data: toolDefinition, error: toolError } = await supabase
      .schema('agent')
      .from('tool_definitions')
      .select('id, tool_key, version, execution_config')
      .eq('agent_definition_id', productionAgentId)
      .eq('tool_key', 'profile_dataset')
      .eq('enabled', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (toolError || !toolDefinition) {
      throw new Error('The selected Profiling Agent has no enabled profile_dataset tool.')
    }

    if (
      typeof toolDefinition.id !== 'string' ||
      typeof toolDefinition.tool_key !== 'string' ||
      typeof toolDefinition.version !== 'string'
    ) {
      throw new Error('The selected Profiling Agent tool definition is invalid.')
    }

    const toolDefinitionId: string = toolDefinition.id
    const toolKey: string = toolDefinition.tool_key
    const toolVersion: string = toolDefinition.version

    const { data: step, error: stepError } = await admin
      .schema('agent')
      .from('agent_run_steps')
      .insert({
        agent_run_id: agentRun.id,
        step_name: toolKey,
        step_order: 1,
        status: 'RUNNING',
        input: {
          ...input,
          profilingRunId,
          tool_definition_id: toolDefinitionId,
          tool_version: toolVersion,
        },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (stepError || !step) {
      throw new Error(`Unable to create agent run step: ${stepError?.message ?? 'unknown error'}`)
    }

    stepId = step.id

    const context: ToolExecutionContext = {
      agentRunId,
      stepId,
      projectId,
      agentDefinitionId: productionAgentId,
      agentVersion: productionAgentVersion,
    }

    const result = await executeProfilingExecutor(
      'profile_dataset',
      {
        ...input,
        profilingRunId,
      },
      context,
    )

    const completedAt = new Date().toISOString()

    await admin
      .schema('agent')
      .from('agent_run_steps')
      .update({
        status: 'SUCCEEDED',
        output: result,
        completed_at: completedAt,
      })
      .eq('id', step.id)

    await admin
      .schema('agent')
      .from('agent_runs')
      .update({
        status: 'SUCCEEDED',
        output: result,
        completed_at: completedAt,
      })
      .eq('id', agentRun.id)

    return NextResponse.json({
      agentRunId: agentRun.id,
      profilingRunId: profilingRun.id,
      stepId: step.id,
      agentDefinitionId: productionAgentId,
      agentVersion: productionAgentVersion,
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown execution error'
    const admin = createAdminClient()
    const completedAt = new Date().toISOString()

    if (stepId) {
      await admin
        .schema('agent')
        .from('agent_run_steps')
        .update({
          status: 'FAILED',
          error_message: message,
          completed_at: completedAt,
        })
        .eq('id', stepId)
    }

    if (agentRunId) {
      await admin
        .schema('agent')
        .from('agent_runs')
        .update({
          status: 'FAILED',
          error_message: message,
          completed_at: completedAt,
        })
        .eq('id', agentRunId)
    }

    if (profilingRunId) {
      await admin
        .schema('profiling')
        .from('profile_runs')
        .update({
          status: 'FAILED',
          error_message: message,
          completed_at: completedAt,
        })
        .eq('id', profilingRunId)
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
