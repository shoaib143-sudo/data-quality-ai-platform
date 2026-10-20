import { createAdminClient } from '@/lib/supabase/admin'
import { dataGovernanceSuperAdminProjectIds } from '@/lib/auth/data-governance-super-admin'

export type NegativeLearningCaseAdminItem = {
  candidateId: string
  projectId: string
  projectName: string
  sourceAgentRunId: string
  agentKey: string
  skillKey: string
  runMode: 'SUPERVISED' | 'HANDSFREE'
  useCaseKey: string
  problemSignature: string
  failureSummary: string
  avoidLesson: string
  evidenceRefs: string[]
  verificationEvidenceRefs: string[]
  reviewStatus: string
  occurrenceCount: number
  createdAt: string
}

export async function loadNegativeLearningCaseAdminInbox(userId: string): Promise<NegativeLearningCaseAdminItem[]> {
  const projectIds = await dataGovernanceSuperAdminProjectIds(userId)
  if (!projectIds.length) return []

  const admin = createAdminClient()
  const [{ data: cases, error: casesError }, { data: projects, error: projectsError }] = await Promise.all([
    admin.schema('agent').from('negative_learning_cases')
      .select('candidate_id,project_id,source_agent_run_id,run_mode,use_case_key,problem_signature,failure_summary,avoid_lesson,evidence_refs,verification_evidence_refs,review_status,created_at')
      .in('project_id', projectIds)
      .in('review_status', ['PENDING_REVIEW', 'DEFERRED'])
      .order('created_at', { ascending: false }),
    admin.schema('app').from('projects').select('id,name').in('id', projectIds),
  ])
  if (casesError) throw new Error(`Unable to load negative learning review inbox: ${casesError.message}`)
  if (projectsError) throw new Error(`Unable to load negative learning project names: ${projectsError.message}`)

  const candidateIds = (cases ?? []).map((item) => String(item.candidate_id))
  const { data: candidates, error: candidateError } = candidateIds.length
    ? await admin.schema('agent').from('learning_candidates').select('id,agent_key,skill_key').in('id', candidateIds)
    : { data: [], error: null }
  if (candidateError) throw new Error(`Unable to load negative learning candidate metadata: ${candidateError.message}`)

  const { data: occurrences, error: occurrenceError } = candidateIds.length
    ? await admin.schema('agent').from('negative_learning_case_occurrences')
        .select('candidate_id')
        .in('candidate_id', candidateIds)
    : { data: [], error: null }
  if (occurrenceError) throw new Error(`Unable to load negative learning occurrence evidence: ${occurrenceError.message}`)

  const occurrenceCounts = new Map<string, number>()
  for (const occurrence of occurrences ?? []) {
    const key = String(occurrence.candidate_id)
    occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1)
  }

  const projectNames = new Map((projects ?? []).map((p) => [String(p.id), String(p.name)]))
  const candidateById = new Map((candidates ?? []).map((c) => [String(c.id), c]))

  return (cases ?? []).map((item) => {
    const candidate = candidateById.get(String(item.candidate_id))
    return {
      candidateId: String(item.candidate_id),
      projectId: String(item.project_id),
      projectName: projectNames.get(String(item.project_id)) ?? String(item.project_id),
      sourceAgentRunId: String(item.source_agent_run_id),
      agentKey: String(candidate?.agent_key ?? 'unknown'),
      skillKey: String(candidate?.skill_key ?? 'unknown'),
      runMode: item.run_mode as 'SUPERVISED' | 'HANDSFREE',
      useCaseKey: String(item.use_case_key),
      problemSignature: String(item.problem_signature),
      failureSummary: String(item.failure_summary),
      avoidLesson: String(item.avoid_lesson),
      evidenceRefs: Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String) : [],
      verificationEvidenceRefs: Array.isArray(item.verification_evidence_refs) ? item.verification_evidence_refs.map(String) : [],
      reviewStatus: String(item.review_status),
      occurrenceCount: occurrenceCounts.get(String(item.candidate_id)) ?? 1,
      createdAt: String(item.created_at),
    }
  })
}
