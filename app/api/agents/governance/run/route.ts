import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOVERNANCE_READ_AGENT_KEYS } from '@/lib/agents/governance-read-agent'
import { executeGovernanceSpecialistAgent } from '@/lib/agents/governance-specialist-agent'
import { enrichGovernedAgentWithMemory } from '@/lib/agents/agent-memory-learning'
import { retrieveGovernedLearningContext } from '@/lib/agents/governed-learning-context'
import { proposePgclCaseFromVerifiedAgentRun } from '@/lib/agents/proactive-governed-case-learning-runtime'
import { persistGovernedAgentMemoryAndEvaluation } from '@/lib/agents/agent-memory'
import { persistAgentRunResultArtifact } from '@/lib/agents/run-result-artifact'
import { persistInvestigatorRiskAssessment } from '@/lib/governance/predictive-risk'
import { enrichOutputWithAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'
import { createGovernancePolicyDecisionProvider } from '@/lib/governance/governance-policy-decision-provider'
import { resolveProjectConversationPolicy } from '@/lib/governance/conversation-policy'
import { createGovernanceTelemetryProvider } from '@/lib/ai/governance-telemetry-provider'
import { createGovernanceExecutionController } from '@/lib/ai/governance-execution-controller'
import { isExecutionControlDeniedError } from '@/lib/ai/execution-controller'
import { runWithTelemetryTraceContext } from '@/lib/ai/telemetry-trace-context-store'
import { telemetryTraceContextFromRequest } from '@/lib/ai/w3c-trace-context'
import type { TelemetryProvider, TelemetryTraceContext } from '@/lib/ai/telemetry-provider'

const GOVERNED_AGENT_ACTION_KEY = 'RUN_GOVERNANCE_AGENT'
const GOVERNED_AGENT_TARGET_TYPE = 'GOVERNANCE_AGENT'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
    const user = await requireApiUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim()
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.converse')

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
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const agentDefinitionId = text(body?.agentDefinitionId ?? body?.agent_definition_id)
    const question = text(body?.question)
    const requestedDomain = text(body?.domain)
    if (!projectId || !agentDefinitionId) {
      return NextResponse.json({ error: 'projectId and agentDefinitionId are required.' }, { status: 400 })
    }
    if (question.length > 1000) return NextResponse.json({ error: 'question must be 1000 characters or fewer.' }, { status: 400 })
    if (requestedDomain.length > 200) return NextResponse.json({ error: 'domain must be 200 characters or fewer.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'agent.converse')
    const conversationStartedAt = Date.now()
    const conversationPolicy = await resolveProjectConversationPolicy({
      userId: user.id,
      projectId,
      requestedDomain: requestedDomain || null,
    })
    const conversationContext = {
      effectivePersona: conversationPolicy.persona,
      domain: conversationPolicy.appliedDomain,
      responseDepth: conversationPolicy.settings.responseDepth,
      evidenceDepth: conversationPolicy.settings.evidenceDepth,
      recommendationStyle: conversationPolicy.settings.recommendationStyle,
      defaultScope: conversationPolicy.settings.defaultScope,
      policyEffect: 'PRESENTATION_ONLY' as const,
    }

    const telemetry = createGovernanceTelemetryProvider()
    const traceContext = telemetryTraceContextFromRequest(request)
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_conversation_policy_resolution',
      startedAt: conversationStartedAt,
      attributes: {
        effective_persona: conversationContext.effectivePersona,
        domain: conversationContext.domain,
        response_depth: conversationContext.responseDepth,
        evidence_depth: conversationContext.evidenceDepth,
        recommendation_style: conversationContext.recommendationStyle,
        default_scope: conversationContext.defaultScope,
        policy_effect: conversationContext.policyEffect,
      },
    })

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

    const policyStartedAt = Date.now()
    const policyDecision = await runWithTelemetryTraceContext(
      traceContext,
      () => createGovernancePolicyDecisionProvider().decide({
        projectId,
        actionKey: GOVERNED_AGENT_ACTION_KEY,
        targetType: GOVERNED_AGENT_TARGET_TYPE,
        riskLevel: 'LOW',
        confidence: 1,
      }),
    )
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_agent_policy_preflight',
      startedAt: policyStartedAt,
      attributes: {
        decision: policyDecision.decision,
        provider: policyDecision.providerId,
        policy_id: policyDecision.policyId,
        policy_version_id: policyDecision.policyVersionId,
        action_key: GOVERNED_AGENT_ACTION_KEY,
        target_type: GOVERNED_AGENT_TARGET_TYPE,
        agent_definition_id: agentDefinitionId,
      },
    })
    if (policyDecision.decision !== 'ALLOW') {
      return NextResponse.json({
        error: policyDecision.reason,
        code: 'GOVERNED_AGENT_POLICY_BLOCKED',
        decision: policyDecision.decision,
        provider: policyDecision.providerId,
        policyVersionId: policyDecision.policyVersionId,
      }, { status: policyDecision.decision === 'REQUIRE_APPROVAL' ? 409 : 403 })
    }

    const learningStartedAt = Date.now()
    const preExecutionLearning = await retrieveGovernedLearningContext({
      projectId,
      agentDefinitionId,
      query: question || 'governance quality risk stewardship',
      limit: 5,
    })
    const approvedPositiveCases = preExecutionLearning.approvedPositiveCases.flatMap((learningCase) => {
      const evidence = learningCase.evidence && typeof learningCase.evidence === 'object' && !Array.isArray(learningCase.evidence)
        ? learningCase.evidence as Record<string, unknown>
        : {}
      const recommendation = learningCase.recommendation && typeof learningCase.recommendation === 'object' && !Array.isArray(learningCase.recommendation)
        ? learningCase.recommendation as Record<string, unknown>
        : {}
      const candidateId = typeof evidence.pgcl_candidate_id === 'string' ? evidence.pgcl_candidate_id : ''
      const reusableLesson = typeof recommendation.reusable_lesson === 'string' ? recommendation.reusable_lesson.trim() : ''
      if (!candidateId || !reusableLesson) return []
      return [{
        id: String(learningCase.id),
        candidateId,
        caseKey: String(learningCase.case_key),
        problemType: String(learningCase.problem_type),
        reusableLesson,
        relevance: Number(learningCase.relevance ?? 0),
        evidence,
      }]
    })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_agent_pre_execution_learning',
      startedAt: learningStartedAt,
      attributes: {
        agent_definition_id: agentDefinitionId,
        approved_positive_case_count: approvedPositiveCases.length,
        authority_effect: 'CONTEXT_ONLY',
      },
    })

    const specialistStartedAt = Date.now()
    const result = await executeGovernanceSpecialistAgent({
      projectId,
      agentDefinitionId,
      actorUserId: user.id,
      question: question || null,
      positiveLearningCases: approvedPositiveCases,
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

    const admin = createAdminClient()
    const { data: runRow, error: runReadError } = await admin.schema('agent').from('agent_runs')
      .select('input')
      .eq('id', result.runId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (runReadError || !runRow) throw new Error(`Unable to persist governed conversation context: ${runReadError?.message ?? 'run not found'}`)
    const { error: contextPersistError } = await admin.schema('agent').from('agent_runs').update({
      input: {
        ...record(runRow.input),
        conversation_context: conversationContext,
      },
    }).eq('id', result.runId).eq('project_id', projectId)
    if (contextPersistError) throw new Error(`Unable to persist governed conversation context: ${contextPersistError.message}`)

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
      preloadedLearningContext: preExecutionLearning,
    })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_agent_memory_enrichment',
      agentRunId: result.runId,
      startedAt: memoryStartedAt,
    })

    const artifactStartedAt = Date.now()
    const artifact = await persistAgentRunResultArtifact({
      agentRunId: result.runId,
      output,
      name: `${result.output.agent.key} result`,
    })
    await recordStage({
      telemetry,
      traceContext,
      projectId,
      operation: 'governed_agent_result_artifact',
      agentRunId: result.runId,
      startedAt: artifactStartedAt,
      attributes: {
        artifact_id: artifact.artifactId,
        artifact_type: 'AGENT_RUN_RESULT',
        artifact_version: '1.0',
        content_hash: artifact.contentHash,
      },
    })

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

    let learningEvaluation: Awaited<ReturnType<typeof proposePgclCaseFromVerifiedAgentRun>> | null = null
    try {
      learningEvaluation = await proposePgclCaseFromVerifiedAgentRun({
        projectId,
        agentRunId: result.runId,
        runMode: 'SUPERVISED',
        verificationEvidenceRefs: [
          `agent_run:${result.runId}:succeeded`,
          `agent_result_artifact:${artifact.artifactId}`,
        ],
        actorUserId: user.id,
      })
    } catch (learningError) {
      console.error(
        '[governance-agent] PGCL evaluation failed without changing governed agent success:',
        learningError instanceof Error ? learningError.message : learningError,
      )
    }

    return NextResponse.json({
      accepted: true,
      runId: result.runId,
      output,
      artifact,
      memory,
      conversationContext,
      learningEvaluation,
    }, { status: 200 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    if (isExecutionControlDeniedError(error)) {
      return NextResponse.json({ error: error.message, code: error.code, decision: error.decision, scopes: error.scopes }, { status: 423 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed agent execution failed.' }, { status: 500 })
  }
}
