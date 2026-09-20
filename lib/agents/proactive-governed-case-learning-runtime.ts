import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildProactiveGovernedCaseLearningCandidate,
  type PgclRunMode,
  type ProactiveGovernedCaseLearningCandidate,
} from '@/lib/agents/proactive-governed-case-learning'
import { persistProactiveGovernedCaseLearningCandidate } from '@/lib/agents/proactive-governed-case-learning-service'
import { isGovernedAgentKey, type GovernedAgentKey } from '@/lib/agents/governed-agent-registry'
import type { GovernedSkillKey } from '@/lib/agents/governed-skill-registry'

const AGENT_DEFAULT_LEARNING_SKILL: Record<GovernedAgentKey, GovernedSkillKey> = {
  profiling_agent: 'profile_evidence_analysis',
  data_quality_agent: 'quality_rule_analysis',
  steward_agent: 'stewardship_gap_analysis',
  governance_analyst_agent: 'governance_evidence_synthesis',
  architect_agent: 'lineage_impact_analysis',
  investigator_agent: 'incident_root_cause_analysis',
  executive_agent: 'executive_materiality_analysis',
  support_agent: 'support_case_investigation',
}

type SuccessfulRunSnapshot = {
  id: string
  project_id: string
  status: string
  agent_definition_id: string
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function firstObservation(output: Record<string, unknown>) {
  const observations = Array.isArray(output.observations) ? output.observations : []
  for (const observation of observations) {
    if (typeof observation === 'string' && observation.trim()) return observation.trim().slice(0, 1000)
  }
  return ''
}

export function derivePgclCandidateFromVerifiedRun(input: {
  run: SuccessfulRunSnapshot
  agentKey: GovernedAgentKey
  runMode: PgclRunMode
  verificationEvidenceRefs: readonly string[]
  priorPositiveCaseExists: boolean
}): ProactiveGovernedCaseLearningCandidate | null {
  if (input.run.status !== 'SUCCEEDED') return null

  const skillKey = AGENT_DEFAULT_LEARNING_SKILL[input.agentKey]
  if (!skillKey) return null

  const runInput = record(input.run.input)
  const output = record(input.run.output)
  const specialist = record(output.specialist)
  const focus = text(specialist.focus) || text(output.focus) || skillKey
  const useCaseKey = `${input.agentKey}:${skillKey}:${slug(focus) || 'verified-run'}`
  const question = text(runInput.question) || text(runInput.evidence_query)
  const resultSummary = firstObservation(output)
    || `${input.agentKey} completed ${focus} with verified governed execution evidence.`

  return buildProactiveGovernedCaseLearningCandidate({
    projectId: input.run.project_id,
    agentRunId: input.run.id,
    agentKey: input.agentKey,
    skillKey,
    runMode: input.runMode,
    executionSucceeded: true,
    verificationSucceeded: input.verificationEvidenceRefs.length > 0,
    useCaseKey,
    problemSignature: question || focus,
    resultSummary,
    reusableLesson: `For ${focus}, reuse the verified evidence-collection and bounded analysis pattern demonstrated by this successful ${input.agentKey} run; re-evaluate all current authorization, policy, and asset-specific evidence before acting.`,
    applicabilityConditions: [
      `agent_key=${input.agentKey}`,
      `skill_key=${skillKey}`,
      `focus=${focus}`,
    ],
    exclusionConditions: [
      'current authorization or policy differs',
      'required verification evidence is unavailable',
      'the future case requires source/business data mutation',
    ],
    evidenceRefs: [`agent_run:${input.run.id}`],
    verificationEvidenceRefs: [...input.verificationEvidenceRefs],
    significanceSignals: [
      input.priorPositiveCaseExists ? 'REPEATED_SUCCESS_THRESHOLD' : 'NEW_USE_CASE',
    ],
  })
}

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

  const run = rawRun as SuccessfulRunSnapshot
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

  const skillKey = AGENT_DEFAULT_LEARNING_SKILL[rawAgentKey]

  const output = record(run.output)
  const specialist = record(output.specialist)
  const focus = text(specialist.focus) || text(output.focus) || skillKey
  const useCaseKey = `${rawAgentKey}:${skillKey}:${slug(focus) || 'verified-run'}`

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
    const run = rawRun as SuccessfulRunSnapshot
    const rawAgentKey = agentKeyByDefinitionId.get(String(run.agent_definition_id))
    if (!isGovernedAgentKey(rawAgentKey)) continue
    evaluated += 1

    const skillKey = AGENT_DEFAULT_LEARNING_SKILL[rawAgentKey]

    const output = record(run.output)
    const specialist = record(output.specialist)
    const focus = text(specialist.focus) || text(output.focus) || skillKey
    const useCaseKey = `${rawAgentKey}:${skillKey}:${slug(focus) || 'verified-run'}`

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
