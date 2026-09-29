import { createAdminClient } from '@/lib/supabase/admin'
import { isGovernedAgentKey } from './governed-agent-registry'
import { deriveNegativeLearningCaseFromFailedRun } from './governed-negative-case-learning'
import { persistGovernedNegativeLearningCase } from './governed-negative-case-learning-service'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function runMode(input: Record<string, unknown>): 'SUPERVISED' | 'HANDSFREE' | null {
  const raw = String(input.learningRunMode ?? input.learning_run_mode ?? input.runMode ?? input.run_mode ?? input.executionMode ?? input.execution_mode ?? input.mode ?? '').toUpperCase()
  if (raw === 'SUPERVISED') return 'SUPERVISED'
  if (raw === 'HANDSFREE' || raw === 'HANDS_FREE') return 'HANDSFREE'
  return null
}

export async function proposeNegativeCaseFromFailedAgentRun(input: {
  projectId: string
  agentRunId: string
  failureSummary?: string | null
  runMode?: 'SUPERVISED' | 'HANDSFREE'
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: rawRun, error: runError } = await admin.schema('agent').from('agent_runs')
    .select('id,project_id,status,agent_definition_id,input,output')
    .eq('id', input.agentRunId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (runError || !rawRun) {
    throw new Error(`Unable to load failed agent run for learning: ${runError?.message ?? 'run not found'}`)
  }
  if (rawRun.status === 'SUCCEEDED') return { evaluated: 1, proposed: 0, candidateId: null as string | null }

  const mode = input.runMode ?? runMode(record(rawRun.input))
  if (!mode) return { evaluated: 1, proposed: 0, candidateId: null as string | null }

  const { data: definition, error: definitionError } = await admin.schema('agent').from('agent_definitions')
    .select('agent_key')
    .eq('id', rawRun.agent_definition_id)
    .maybeSingle()
  if (definitionError || !definition) {
    throw new Error(`Unable to resolve failed-run agent definition: ${definitionError?.message ?? 'definition not found'}`)
  }

  const agentKey = String(definition.agent_key)
  if (!isGovernedAgentKey(agentKey)) return { evaluated: 1, proposed: 0, candidateId: null as string | null }

  const output = record(rawRun.output)
  if (input.failureSummary?.trim() && !output.error) output.error = input.failureSummary.trim()

  const candidate = deriveNegativeLearningCaseFromFailedRun({
    run: {
      id: String(rawRun.id),
      project_id: String(rawRun.project_id),
      status: String(rawRun.status),
      input: record(rawRun.input),
      output,
    },
    agentKey,
    runMode: mode,
    failureEvidenceRefs: [`failure:${String(rawRun.status).toLowerCase()}`],
  })
  if (!candidate) return { evaluated: 1, proposed: 0, candidateId: null as string | null }

  const candidateId = await persistGovernedNegativeLearningCase({
    candidate,
    actorUserId: input.actorUserId ?? null,
  })
  return { evaluated: 1, proposed: 1, candidateId }
}
