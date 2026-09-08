import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOVERNANCE_READ_AGENT_KEYS } from '@/lib/agents/governance-read-agent'
import { executeGovernanceSpecialistAgent } from '@/lib/agents/governance-specialist-agent'
import { enrichGovernedAgentWithMemory } from '@/lib/agents/agent-memory-learning'
import { persistGovernedAgentMemoryAndEvaluation } from '@/lib/agents/agent-memory'
import { persistInvestigatorRiskAssessment } from '@/lib/governance/predictive-risk'
import { enrichOutputWithAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'
import { createGovernanceTelemetryProvider } from '@/lib/ai/governance-telemetry-provider'
import { createGovernanceExecutionController } from '@/lib/ai/governance-execution-controller'
import { isExecutionControlDeniedError } from '@/lib/ai/execution-controller'
import { telemetryTraceContextFromRequest } from '@/lib/ai/w3c-trace-context'
import type { TelemetryProvider, TelemetryTraceContext } from '@/lib/ai/telemetry-provider'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function recordStage(input: {
  telemetry: TelemetryProvider
  traceContext: TelemetryTraceContext | null
  projectId: string
  operation: string
  agentRunId?: string | null
  status?: 'SUCCESS' | 'ERROR'
  startedAt: number
  attributes?: Record<string, unknown>
}) {
  try {
    await input.telemetry.record({
      projectId: input.projectId,
      eventType: 'GOVERNED_AGENT_STAGE',
      operation: input.operation,
      status: input.status ?? 'SUCCESS',
      agentRunId: input.agentRunId ?? null,
      traceContext: input.traceContext,
      latencyMs: Math.max(0, Date.now() - input.startedAt),
      attributes: input.attributes ?? {},
    })
  } catch {
    // Telemetry is observability evidence only. It must not alter governed agent execution or authority.
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim()
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.execute')

    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('agent')
      .from('agent_definitions')
      .select('id,agent_key,name,description,version,configuration')
      .in('agent_key', [...GOVERNANCE_READ_AGENT_KEYS])
      .eq('enabled', true)
      .order('name')
    if (error) throw new Error(`Unable to list governed agents: ${error.message}`)

    return NextResponse.json({ projectId, agents: data ?? [] })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list governed agents.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const agentDefinitionId = text(body?.agentDefinitionId ?? body?.agent_definition_id)
    const question = text(body?.question)
    if (!projectId || !agentDefinitionId) {
      return NextResponse.json({ error: 'projectId and agentDefinitionId are required.' }, { status: 400 })
    }
    if (question.length > 1000) return NextResponse.json({ error: 'question must be 1000 characters or fewer.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'agent.execute')
    const telemetry = createGovernanceTelemetryProvider()
    const traceContext = telemetryTraceContextFromRequest(request)
    const controlStartedAt = Date.now()
    const executionControl = await createGovernanceExecutionController().assertAllowed({ projectId, agentDefinitionId })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_execution_control_preflight',
      startedAt: controlStartedAt,
      attributes: { decision: executionControl.decision, agent_definition_id: agentDefinitionId },
    })

    const specialistStartedAt = Date.now()
    const result = await executeGovernanceSpecialistAgent({
      projectId,
      agentDefinitionId,
      actorUserId: user.id,
      question: question || null,
    })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governance_specialist_execute',
      agentRunId: result.runId,
      startedAt: specialistStartedAt,
      attributes: {
        agent_definition_id: agentDefinitionId,
        agent_key: result.output.agent.key,
        execution_mode: result.output.mode,
      },
    })

    let specialistOutput = result.output as Record<string, unknown>
    if (result.output.agent.key === 'investigator_agent') {
      const riskStartedAt = Date.now()
      const investigation = await persistInvestigatorRiskAssessment({
        projectId,
        agentRunId: result.runId,
        actorUserId: user.id,
        output: specialistOutput,
      })
      await recordStage({
        telemetry,
        traceContext,
        projectId,
        operation: 'investigator_risk_assessment',
        agentRunId: result.runId,
        startedAt: riskStartedAt,
        attributes: { persisted: Boolean(investigation) },
      })
      if (investigation) specialistOutput = { ...specialistOutput, investigation }
    }

    const intelligenceStartedAt = Date.now()
    specialistOutput = await enrichOutputWithAIGovernanceIntelligence(projectId, specialistOutput)
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'ai_governance_intelligence_enrichment',
      agentRunId: result.runId,
      startedAt: intelligenceStartedAt,
    })

    const memoryStartedAt = Date.now()
    const output = await enrichGovernedAgentWithMemory({
      projectId,
      agentDefinitionId,
      agentRunId: result.runId,
      question: question || null,
      output: specialistOutput,
    })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_agent_memory_enrichment',
      agentRunId: result.runId,
      startedAt: memoryStartedAt,
    })

    const admin = createAdminClient()
    const { error: outputError } = await admin.schema('agent').from('agent_runs').update({ output }).eq('id', result.runId).eq('project_id', projectId)
    if (outputError) throw new Error(`Unable to persist enriched governance agent output: ${outputError.message}`)

    const evaluationStartedAt = Date.now()
    const memory = await persistGovernedAgentMemoryAndEvaluation({
      projectId,
      agentDefinitionId,
      agentRunId: result.runId,
      agentKey: result.output.agent.key,
      output,
    })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_agent_memory_evaluation',
      agentRunId: result.runId,
      startedAt: evaluationStartedAt,
      attributes: { agent_key: result.output.agent.key },
    })

    return NextResponse.json({ accepted: true, runId: result.runId, output, memory }, { status: 200 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    if (isExecutionControlDeniedError(error)) {
      return NextResponse.json({ error: error.message, code: error.code, decision: error.decision, scopes: error.scopes }, { status: 423 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed agent execution failed.' }, { status: 500 })
  }
}
