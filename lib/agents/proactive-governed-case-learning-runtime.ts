import { createAdminClient } from '@/lib/supabase/admin'
import {
  derivePgclCandidateFromVerifiedRun,
  derivePgclRunIdentity,
  type PgclRunMode,
  type PgclRunSnapshot,
} from '@/lib/agents/proactive-governed-case-learning'
import { persistProactiveGovernedCaseLearningCandidate } from '@/lib/agents/proactive-governed-case-learning-service'
import { isGovernedAgentKey, type GovernedAgentKey } from '@/lib/agents/governed-agent-registry'
export async function proposePgclCaseFromVerifiedAgentRun(input: {
  projectId: string
  agentRunId: string
  runMode: PgclRunMode
  verificationEvidenceRefs: readonly string[]
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: rawRun, error: runError } = await admin.schema('agent').from('agent_runs')
    .select('id,project_id,status,agent_definition_id,input,output')
    .eq('id', input.agentRunId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (runError || !rawRun) {
    throw new Error(`Unable to load agent run for PGCL evaluation: ${runError?.message ?? 'run not found'}`)
  }

  const run = rawRun as PgclRunSnapshot
  if (run.status !== 'SUCCEEDED') return { evaluated: 0, proposed: 0, candidateId: null as string | null }

  const { data: definition, error: definitionError } = await admin.schema('agent').from('agent_definitions')
    .select('agent_key')
    .eq('id', run.agent_definition_id)
    .maybeSingle()
  if (definitionError || !definition) {
    throw new Error(`Unable to resolve agent definition for PGCL evaluation: ${definitionError?.message ?? 'definition not found'}`)
  }

  const rawAgentKey = String(definition.agent_key)
  if (!isGovernedAgentKey(rawAgentKey)) {
    return { evaluated: 0, proposed: 0, candidateId: null as string | null }
  }

  const { useCaseKey } = derivePgclRunIdentity({ run, agentKey: rawAgentKey })

  const { data: priorCases, error: priorError } = await admin.schema('agent')
    .from('positive_learning_cases')
    .select('candidate_id')
    .eq('project_id', input.projectId)
    .eq('use_case_key', useCaseKey)
    .limit(1)
  if (priorError) throw new Error(`Unable to evaluate PGCL case significance: ${priorError.message}`)

  const candidate = derivePgclCandidateFromVerifiedRun({
    run,
    agentKey: rawAgentKey,
    runMode: input.runMode,
    verificationEvidenceRefs: input.verificationEvidenceRefs,
    priorPositiveCaseExists: Boolean(priorCases?.length),
  })
  if (!candidate) return { evaluated: 1, proposed: 0, candidateId: null as string | null }

  const candidateId = await persistProactiveGovernedCaseLearningCandidate({
    candidate,
    actorUserId: input.actorUserId ?? null,
  })
  return { evaluated: 1, proposed: 1, candidateId }
}

export async function proposePgclCasesFromVerifiedSupervisorRun(input: {
  projectId: string
  childRunIds: readonly string[]
  runMode: PgclRunMode
  supervisorEvaluationId: string
  actorUserId?: string | null
}) {
  if (!input.childRunIds.length) return { evaluated: 0, proposed: 0, candidateIds: [] as string[] }

  const admin = createAdminClient()
  const { data: runs, error: runsError } = await admin.schema('agent').from('agent_runs')
    .select('id,project_id,status,agent_definition_id,input,output')
    .eq('project_id', input.projectId)
    .in('id', [...input.childRunIds])
  if (runsError) throw new Error(`Unable to load successful runs for PGCL evaluation: ${runsError.message}`)

  const definitionIds = [...new Set((runs ?? []).map((run) => String(run.agent_definition_id)))]
  const { data: definitions, error: definitionsError } = definitionIds.length
    ? await admin.schema('agent').from('agent_definitions')
      .select('id,agent_key')
      .in('id', definitionIds)
    : { data: [], error: null }
  if (definitionsError) throw new Error(`Unable to load agent definitions for PGCL evaluation: ${definitionsError.message}`)

  const agentKeyByDefinitionId = new Map(
    (definitions ?? []).map((definition) => [String(definition.id), String(definition.agent_key)]),
  )

  const candidateIds: string[] = []
  let evaluated = 0

  for (const rawRun of runs ?? []) {
    const run = rawRun as PgclRunSnapshot
    const rawAgentKey = agentKeyByDefinitionId.get(String(run.agent_definition_id))
    if (!isGovernedAgentKey(rawAgentKey)) continue
    evaluated += 1

    const { useCaseKey } = derivePgclRunIdentity({ run, agentKey: rawAgentKey })

    const { data: priorCases, error: priorError } = await admin.schema('agent')
      .from('positive_learning_cases')
      .select('candidate_id')
      .eq('project_id', input.projectId)
      .eq('use_case_key', useCaseKey)
      .limit(1)
    if (priorError) throw new Error(`Unable to evaluate PGCL case significance: ${priorError.message}`)

    const candidate = derivePgclCandidateFromVerifiedRun({
      run,
      agentKey: rawAgentKey,
      runMode: input.runMode,
      verificationEvidenceRefs: [`native_trajectory_evaluation:${input.supervisorEvaluationId}`],
      priorPositiveCaseExists: Boolean(priorCases?.length),
    })
    if (!candidate) continue

    candidateIds.push(await persistProactiveGovernedCaseLearningCandidate({
      candidate,
      actorUserId: input.actorUserId ?? null,
    }))
  }

  return { evaluated, proposed: candidateIds.length, candidateIds }
}
