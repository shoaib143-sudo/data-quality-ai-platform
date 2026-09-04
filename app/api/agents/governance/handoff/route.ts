import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeGovernanceReadAgent } from '@/lib/agents/governance-read-agent'
import { persistGovernedAgentMemoryAndEvaluation } from '@/lib/agents/agent-memory'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const sourceAgentRunId = text(body?.sourceAgentRunId ?? body?.source_agent_run_id)
    const targetAgentDefinitionId = text(body?.targetAgentDefinitionId ?? body?.target_agent_definition_id)
    const objective = text(body?.objective).slice(0, 800)
    if (!projectId || !sourceAgentRunId || !targetAgentDefinitionId) {
      return NextResponse.json({ error: 'projectId, sourceAgentRunId and targetAgentDefinitionId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'agent.execute')
    const admin = createAdminClient()
    const { data: sourceRun, error: sourceError } = await admin
      .schema('agent')
      .from('agent_runs')
      .select('id,project_id,status,agent_definition_id,output,correlation_id')
      .eq('id', sourceAgentRunId)
      .maybeSingle()
    if (sourceError) throw new Error(`Unable to resolve source agent run: ${sourceError.message}`)
    if (!sourceRun || sourceRun.project_id !== projectId) return NextResponse.json({ error: 'Source agent run was not found in this project.' }, { status: 404 })
    if (!['SUCCEEDED','COMPLETED','PARTIAL'].includes(String(sourceRun.status).toUpperCase())) {
      return NextResponse.json({ error: 'Only completed or partial source runs can be handed off.' }, { status: 409 })
    }

    const sourceOutput = sourceRun.output && typeof sourceRun.output === 'object' && !Array.isArray(sourceRun.output)
      ? sourceRun.output as Record<string, unknown>
      : {}
    const observations = Array.isArray(sourceOutput.observations)
      ? sourceOutput.observations.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : []
    const question = [
      objective || 'Review the source agent run and provide your role-specific project assessment.',
      `Source run: ${sourceAgentRunId}.`,
      observations.length ? `Source observations: ${observations.join(' | ')}` : '',
    ].filter(Boolean).join(' ').slice(0, 1000)

    const target = await executeGovernanceReadAgent({
      projectId,
      agentDefinitionId: targetAgentDefinitionId,
      actorUserId: user.id,
      question,
    })
    const correlationId = sourceRun.correlation_id || randomUUID()
    const { error: targetLinkError } = await admin.schema('agent').from('agent_runs').update({
      parent_run_id: sourceAgentRunId,
      correlation_id: correlationId,
    }).eq('id', target.runId)
    if (targetLinkError) throw new Error(`Unable to link target agent run to source: ${targetLinkError.message}`)

    const memory = await persistGovernedAgentMemoryAndEvaluation({
      projectId,
      agentDefinitionId: targetAgentDefinitionId,
      agentRunId: target.runId,
      agentKey: target.output.agent.key,
      output: target.output as Record<string, unknown>,
    })

    const { data: message, error: messageError } = await admin.schema('agent').from('agent_messages').insert({
      source_agent_run_id: sourceAgentRunId,
      target_agent_run_id: target.runId,
      message_type: 'GOVERNED_HANDOFF',
      correlation_id: correlationId,
      payload: {
        objective: objective || null,
        source_observations: observations,
        target_agent_key: target.output.agent.key,
        read_only: true,
      },
      status: 'PROCESSED',
      delivered_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    }).select('id,correlation_id,status,created_at').single()
    if (messageError || !message) throw new Error(`Unable to persist agent handoff message: ${messageError?.message ?? 'unknown error'}`)

    await writeGovernanceAudit({
      projectId,
      actorUserId: user.id,
      actorType: 'USER',
      eventType: 'GOVERNED_AGENT_HANDOFF_COMPLETED',
      entityType: 'AGENT_RUN',
      entityId: target.runId,
      correlationId,
      metadata: { source_agent_run_id: sourceAgentRunId, target_agent_run_id: target.runId, message_id: message.id, target_agent_key: target.output.agent.key, read_only: true },
    })

    return NextResponse.json({ accepted: true, sourceAgentRunId, targetRunId: target.runId, message, memory, output: target.output })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed agent handoff failed.' }, { status: 500 })
  }
}
