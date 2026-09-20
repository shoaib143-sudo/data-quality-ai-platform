import { createAdminClient } from '@/lib/supabase/admin'
import { dataGovernanceSuperAdminProjectIds } from '@/lib/auth/data-governance-super-admin'

export type PositiveLearningCaseAdminItem = {
  candidateId: string
  projectId: string
  projectName: string
  sourceAgentRunId: string
  agentKey: string
  skillKey: string
  runMode: 'SUPERVISED' | 'HANDSFREE'
  useCaseKey: string
  problemSignature: string
  resultSummary: string
  reusableLesson: string
  applicabilityConditions: string[]
  exclusionConditions: string[]
  evidenceRefs: string[]
  verificationEvidenceRefs: string[]
  significanceSignals: string[]
  reviewStatus: string
  occurrenceCount: number
  lastObservedAt: string | null
  createdAt: string
}

export async function loadPositiveLearningCaseAdminInbox(
  userId: string,
): Promise<PositiveLearningCaseAdminItem[]> {
  const projectIds = await dataGovernanceSuperAdminProjectIds(userId)
  if (!projectIds.length) return []

  const admin = createAdminClient()
  const [{ data: cases, error: casesError }, { data: projects, error: projectsError }] = await Promise.all([
    admin
      .schema('agent')
      .from('positive_learning_cases')
      .select(
        'candidate_id,project_id,source_agent_run_id,run_mode,use_case_key,problem_signature,result_summary,reusable_lesson,applicability_conditions,exclusion_conditions,evidence_refs,verification_evidence_refs,significance_signals,review_status,created_at',
      )
      .in('project_id', projectIds)
      .in('review_status', ['PENDING_REVIEW', 'DEFERRED'])
      .order('created_at', { ascending: false }),
    admin.schema('app').from('projects').select('id,name').in('id', projectIds),
  ])

  if (casesError) throw new Error(`Unable to load PGCL review inbox: ${casesError.message}`)
  if (projectsError) throw new Error(`Unable to load PGCL project names: ${projectsError.message}`)

  const candidateIds = (cases ?? []).map((item) => String(item.candidate_id))
  const [{ data: candidates, error: candidateError }, { data: occurrences, error: occurrenceError }] = candidateIds.length
    ? await Promise.all([
        admin
          .schema('agent')
          .from('learning_candidates')
          .select('id,agent_key,skill_key')
          .in('id', candidateIds),
        admin
          .schema('agent')
          .from('positive_learning_case_occurrences')
          .select('candidate_id,observed_at')
          .in('candidate_id', candidateIds)
          .order('observed_at', { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  if (candidateError) throw new Error(`Unable to load PGCL candidate metadata: ${candidateError.message}`)
  if (occurrenceError) throw new Error(`Unable to load PGCL occurrence history: ${occurrenceError.message}`)

  const occurrenceByCandidate = new Map<string, { count: number; lastObservedAt: string | null }>()
  for (const occurrence of occurrences ?? []) {
    const candidateId = String(occurrence.candidate_id)
    const current = occurrenceByCandidate.get(candidateId) ?? { count: 0, lastObservedAt: null }
    occurrenceByCandidate.set(candidateId, {
      count: current.count + 1,
      lastObservedAt: current.lastObservedAt ?? String(occurrence.observed_at),
    })
  }


  const projectNameById = new Map((projects ?? []).map((project) => [String(project.id), String(project.name)]))
  const candidateById = new Map((candidates ?? []).map((candidate) => [String(candidate.id), candidate]))

  return (cases ?? []).map((item) => {
    const candidate = candidateById.get(String(item.candidate_id))
    return {
      candidateId: String(item.candidate_id),
      projectId: String(item.project_id),
      projectName: projectNameById.get(String(item.project_id)) ?? String(item.project_id),
      sourceAgentRunId: String(item.source_agent_run_id),
      agentKey: String(candidate?.agent_key ?? 'unknown'),
      skillKey: String(candidate?.skill_key ?? 'unknown'),
      runMode: item.run_mode as 'SUPERVISED' | 'HANDSFREE',
      useCaseKey: String(item.use_case_key),
      problemSignature: String(item.problem_signature),
      resultSummary: String(item.result_summary),
      reusableLesson: String(item.reusable_lesson),
      applicabilityConditions: Array.isArray(item.applicability_conditions) ? item.applicability_conditions.map(String) : [],
      exclusionConditions: Array.isArray(item.exclusion_conditions) ? item.exclusion_conditions.map(String) : [],
      evidenceRefs: Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String) : [],
      verificationEvidenceRefs: Array.isArray(item.verification_evidence_refs) ? item.verification_evidence_refs.map(String) : [],
      significanceSignals: Array.isArray(item.significance_signals) ? item.significance_signals.map(String) : [],
      reviewStatus: String(item.review_status),
      occurrenceCount: occurrenceByCandidate.get(String(item.candidate_id))?.count ?? 1,
      lastObservedAt: occurrenceByCandidate.get(String(item.candidate_id))?.lastObservedAt ?? null,
      createdAt: String(item.created_at),
    }
  })
}
