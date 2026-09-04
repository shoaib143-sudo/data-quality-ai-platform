import { executeGovernanceSpecialistAgent } from '@/lib/agents/governance-specialist-agent'
import { enrichGovernedAgentWithMemory } from '@/lib/agents/agent-memory-learning'
import { persistGovernedAgentMemoryAndEvaluation } from '@/lib/agents/agent-memory'
import { persistInvestigatorRiskAssessment } from '@/lib/governance/predictive-risk'
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

async function executeGovernanceAgentJob(job: DurableJob) {
  const payload = job.payload ?? {}
  const projectId = text(payload.projectId) || job.project_id
  const actorUserId = text(payload.userId) || text(payload.actorUserId)
  const agentDefinitionId = text(payload.agentDefinitionId) || text(job.entity_id)
  const question = text(payload.question)

  if (!projectId || !actorUserId || !agentDefinitionId) {
    throw new Error('Durable governance agent job payload requires projectId, userId and agentDefinitionId.')
  }
  if (projectId !== job.project_id) throw new Error('Durable governance agent job projectId does not match job project_id.')
  if (question.length > 1000) throw new Error('Durable governance agent question must be 1000 characters or fewer.')

  let result = await loadReusableSucceededRun(job, agentDefinitionId)
  if (!result) {
    const executed = await executeGovernanceSpecialistAgent({
      projectId,
      agentDefinitionId,
      actorUserId,
      question: question || null,
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
    if (investigation) {
      specialistOutput = { ...specialistOutput, investigation }
      await persistRunOutput(result.runId, specialistOutput)
    }
  }

  const output = await enrichGovernedAgentWithMemory({
    projectId,
    agentDefinitionId,
    agentRunId: result.runId,
    question: question || null,
    output: specialistOutput,
  })
  const memory = await persistGovernedAgentMemoryAndEvaluation({
    projectId,
    agentDefinitionId,
    agentRunId: result.runId,
    agentKey,
    output,
  })

  return {
    jobId: job.id,
    runId: result.runId,
    agentKey,
    status: 'SUCCEEDED',
    memory,
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
