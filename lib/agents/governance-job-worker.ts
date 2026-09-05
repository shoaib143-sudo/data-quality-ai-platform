import { randomUUID } from 'node:crypto'
import { executeGovernanceSpecialistAgent } from '@/lib/agents/governance-specialist-agent'
import { enrichGovernedAgentWithMemory } from '@/lib/agents/agent-memory-learning'
import { persistGovernedAgentMemoryAndEvaluation } from '@/lib/agents/agent-memory'
import { persistInvestigatorRiskAssessment } from '@/lib/governance/predictive-risk'
import { enrichOutputWithAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function loadReusableSucceededRun(job: DurableJob, expectedAgentDefinitionId: string) {
  const agentRunId = text(job.agent_run_id) || text(job.payload?.agentRunId)
  if (!agentRunId) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_runs')
    .select('id,project_id,agent_definition_id,status,output')
    .eq('id', agentRunId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve durable governance agent run: ${error.message}`)
  if (!data) return null
  if (data.project_id !== job.project_id) throw new Error('Durable governance agent run project does not match the queued job.')
  if (data.agent_definition_id !== expectedAgentDefinitionId) throw new Error('Durable governance agent run definition does not match the queued job.')
  if (data.status === 'CANCELLED') throw new Error('Durable governance agent run was cancelled.')
  if (data.status !== 'SUCCEEDED') return null

  const output = record(data.output)
  if (!output) throw new Error('Succeeded durable governance agent run has no persisted output.')
  return { runId: data.id as string, output }
}

async function loadHandoffSource(projectId: string, sourceAgentRunId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('agent')
    .from('agent_runs')
    .select('id,project_id,status,output,correlation_id')
    .eq('id', sourceAgentRunId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve durable handoff source run: ${error.message}`)
  if (!data || data.project_id !== projectId) throw new Error('Durable handoff source run was not found in this project.')
  if (!['SUCCEEDED', 'COMPLETED', 'PARTIAL'].includes(String(data.status).toUpperCase())) {
    throw new Error('Only completed or partial source runs can be handed off.')
  }

  const sourceOutput = record(data.output) ?? {}
  const observations = Array.isArray(sourceOutput.observations)
    ? sourceOutput.observations.filter((item): item is string => typeof item === 'string').slice(0, 3)
    : []
  return {
    correlationId: text(data.correlation_id) || randomUUID(),
    observations,
  }
}

async function attachAgentRunToJob(jobId: string, agentRunId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .schema('orchestration')
    .from('job_queue')
    .update({ agent_run_id: agentRunId, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  if (error) throw new Error(`Unable to attach governance agent run to durable job: ${error.message}`)
}

async function persistRunOutput(agentRunId: string, output: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.schema('agent').from('agent_runs').update({ output }).eq('id', agentRunId)
  if (error) throw new Error(`Unable to persist enriched governance agent output: ${error.message}`)
}

async function persistHandoff(input: {
  projectId: string
  actorUserId: string
  sourceAgentRunId: string
  targetAgentRunId: string
  targetAgentKey: string
  correlationId: string
  objective: string | null
  sourceObservations: string[]
  output: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const { error: linkError } = await admin.schema('agent').from('agent_runs').update({
    parent_run_id: input.sourceAgentRunId,
    correlation_id: input.correlationId,
    output: input.output,
  }).eq('id', input.targetAgentRunId).eq('project_id', input.projectId)
  if (linkError) throw new Error(`Unable to link durable handoff target run: ${linkError.message}`)

  const { data: existingMessage, error: existingError } = await admin.schema('agent').from('agent_messages')
    .select('id,correlation_id,status,created_at')
    .eq('source_agent_run_id', input.sourceAgentRunId)
    .eq('target_agent_run_id', input.targetAgentRunId)
    .eq('message_type', 'GOVERNED_HANDOFF')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve durable handoff idempotency: ${existingError.message}`)
  if (existingMessage) return existingMessage

  const now = new Date().toISOString()
  const { data: message, error: messageError } = await admin.schema('agent').from('agent_messages').insert({
    source_agent_run_id: input.sourceAgentRunId,
    target_agent_run_id: input.targetAgentRunId,
    message_type: 'GOVERNED_HANDOFF',
    correlation_id: input.correlationId,
    payload: {
      objective: input.objective,
      source_observations: input.sourceObservations,
      target_agent_key: input.targetAgentKey,
      read_only: true,
      specialist: true,
      memory_informed: true,
      durable: true,
      predictive_investigation: input.targetAgentKey === 'investigator_agent',
    },
    status: 'PROCESSED',
    delivered_at: now,
    processed_at: now,
  }).select('id,correlation_id,status,created_at').single()
  if (messageError || !message) throw new Error(`Unable to persist durable agent handoff message: ${messageError?.message ?? 'unknown error'}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorType: 'USER',
    eventType: 'GOVERNED_AGENT_HANDOFF_COMPLETED',
    entityType: 'AGENT_RUN',
    entityId: input.targetAgentRunId,
    correlationId: input.correlationId,
    metadata: {
      source_agent_run_id: input.sourceAgentRunId,
      target_agent_run_id: input.targetAgentRunId,
      message_id: message.id,
      target_agent_key: input.targetAgentKey,
      read_only: true,
      specialist: true,
      memory_informed: true,
      durable: true,
      predictive_investigation: input.targetAgentKey === 'investigator_agent',
    },
  })

  return message
}

async function executeGovernanceAgentJob(job: DurableJob) {
  const payload = job.payload ?? {}
  const projectId = text(payload.projectId) || job.project_id
  const actorUserId = text(payload.userId) || text(payload.actorUserId)
  const agentDefinitionId = text(payload.agentDefinitionId) || text(job.entity_id)
  const question = text(payload.question)
  const objective = text(payload.objective)
  const sourceAgentRunId = text(payload.sourceAgentRunId) || text(payload.source_agent_run_id)

  if (!projectId || !actorUserId || !agentDefinitionId) {
    throw new Error('Durable governance agent job payload requires projectId, userId and agentDefinitionId.')
  }
  if (projectId !== job.project_id) throw new Error('Durable governance agent job projectId does not match job project_id.')
  if (question.length > 1000 || objective.length > 800) throw new Error('Durable governance agent question/objective exceeds the governed length limit.')

  const handoff = sourceAgentRunId ? await loadHandoffSource(projectId, sourceAgentRunId) : null
  const effectiveQuestion = handoff
    ? [
        objective || question || 'Review the source agent run and provide your role-specific project assessment.',
        `Source run: ${sourceAgentRunId}.`,
        handoff.observations.length ? `Source observations: ${handoff.observations.join(' | ')}` : '',
      ].filter(Boolean).join(' ').slice(0, 1000)
    : question

  let result = await loadReusableSucceededRun(job, agentDefinitionId)
  if (!result) {
    const executed = await executeGovernanceSpecialistAgent({
      projectId,
      agentDefinitionId,
      actorUserId,
      question: effectiveQuestion || null,
    })
    result = { runId: executed.runId, output: executed.output as Record<string, unknown> }
    await attachAgentRunToJob(job.id, result.runId)
  }

  let specialistOutput = result.output
  const agent = record(specialistOutput.agent) ?? {}
  const agentKey = text(agent.key)
  if (!agentKey) throw new Error('Durable governance agent output is missing agent.key.')

  if (agentKey === 'investigator_agent' && !record(specialistOutput.investigation)) {
    const investigation = await persistInvestigatorRiskAssessment({
      projectId,
      agentRunId: result.runId,
      actorUserId,
      output: specialistOutput,
    })
    if (investigation) specialistOutput = { ...specialistOutput, investigation }
  }

  specialistOutput = await enrichOutputWithAIGovernanceIntelligence(projectId, specialistOutput)
  const output = await enrichGovernedAgentWithMemory({
    projectId,
    agentDefinitionId,
    agentRunId: result.runId,
    question: effectiveQuestion || null,
    output: specialistOutput,
  })
  await persistRunOutput(result.runId, output)

  const memory = await persistGovernedAgentMemoryAndEvaluation({
    projectId,
    agentDefinitionId,
    agentRunId: result.runId,
    agentKey,
    output,
  })

  const message = handoff && sourceAgentRunId
    ? await persistHandoff({
        projectId,
        actorUserId,
        sourceAgentRunId,
        targetAgentRunId: result.runId,
        targetAgentKey: agentKey,
        correlationId: handoff.correlationId,
        objective: objective || null,
        sourceObservations: handoff.observations,
        output,
      })
    : null

  return {
    jobId: job.id,
    runId: result.runId,
    agentKey,
    status: 'SUCCEEDED',
    memory,
    handoff: message,
  }
}

export async function processGovernanceAgentJobs(jobs: DurableJob[]) {
  const results: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    try {
      const result = await executeGovernanceAgentJob(job)
      await markDurableJobSucceeded(job)
      results.push(result)
    } catch (error) {
      await markDurableJobFailed(job, error)
      results.push({
        jobId: job.id,
        agentRunId: job.agent_run_id,
        status: job.attempts >= job.max_attempts ? 'DEAD' : 'RETRY_QUEUED',
        error: error instanceof Error ? error.message : 'Durable governance agent job failed.',
      })
    }
  }
  return results
}
