import { createClient } from '@/lib/supabase/server'

export type LearningLifecycleCandidate = {
  id: string
  agentKey: string
  skillKey: string
  category: string
  title: string
  baselineVersion: string
  candidateVersion: string
  status: string
  createdAt: string
  updatedAt: string
  benchmarkStatus: string | null
  benchmarkScore: number | null
  benchmarkBaselineScore: number | null
  approvalRequestId: string | null
  releaseStatus: string | null
  canaryStartedAt: string | null
  verifiedAt: string | null
  activatedAt: string | null
  rolledBackAt: string | null
}

export type LearningLifecycleCommandCenterState = {
  candidates: LearningLifecycleCandidate[]
  counts: {
    total: number
    reviewRequired: number
    approvedForControlledRelease: number
    canary: number
    verified: number
    active: number
    rolledBack: number
    notReadyOrRejected: number
  }
  authority: {
    selfPromotionAllowed: false
    automaticAuthorityExpansionAllowed: false
    automaticMutationBoundaryChangeAllowed: false
    humanReviewRequired: true
    currentAuthorizationRequiredAtRelease: true
  }
}

export async function readGovernedLearningLifecycleCommandCenter(
  projectId: string,
): Promise<LearningLifecycleCommandCenterState> {
  const supabase = await createClient()

  const [candidateResult, benchmarkResult, approvalResult, releaseResult] = await Promise.all([
    supabase.schema('agent').from('learning_candidates')
      .select('id,agent_key,skill_key,category,title,baseline_version,candidate_version,status,created_at,updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.schema('agent').from('learning_candidate_benchmarks')
      .select('candidate_id,gate_status,baseline_score,candidate_score,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase.schema('agent').from('learning_candidate_approval_links')
      .select('candidate_id,approval_request_id,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase.schema('agent').from('learning_candidate_releases')
      .select('candidate_id,status,canary_started_at,verified_at,activated_at,rolled_back_at,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  ])

  if (candidateResult.error) throw new Error(`Unable to load governed learning candidates: ${candidateResult.error.message}`)
  if (benchmarkResult.error) throw new Error(`Unable to load governed learning benchmarks: ${benchmarkResult.error.message}`)
  if (approvalResult.error) throw new Error(`Unable to load governed learning approvals: ${approvalResult.error.message}`)
  if (releaseResult.error) throw new Error(`Unable to load governed learning releases: ${releaseResult.error.message}`)

  const latestBenchmark = new Map<string, (typeof benchmarkResult.data)[number]>()
  for (const row of benchmarkResult.data ?? []) {
    const key = String(row.candidate_id)
    if (!latestBenchmark.has(key)) latestBenchmark.set(key, row)
  }

  const latestApproval = new Map<string, (typeof approvalResult.data)[number]>()
  for (const row of approvalResult.data ?? []) {
    const key = String(row.candidate_id)
    if (!latestApproval.has(key)) latestApproval.set(key, row)
  }

  const latestRelease = new Map<string, (typeof releaseResult.data)[number]>()
  for (const row of releaseResult.data ?? []) {
    const key = String(row.candidate_id)
    if (!latestRelease.has(key)) latestRelease.set(key, row)
  }

  const candidates: LearningLifecycleCandidate[] = (candidateResult.data ?? []).map((row) => {
    const benchmark = latestBenchmark.get(String(row.id))
    const approval = latestApproval.get(String(row.id))
    const release = latestRelease.get(String(row.id))
    return {
      id: String(row.id),
      agentKey: String(row.agent_key),
      skillKey: String(row.skill_key),
      category: String(row.category),
      title: String(row.title),
      baselineVersion: String(row.baseline_version),
      candidateVersion: String(row.candidate_version),
      status: String(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      benchmarkStatus: benchmark ? String(benchmark.gate_status) : null,
      benchmarkScore: benchmark?.candidate_score == null ? null : Number(benchmark.candidate_score),
      benchmarkBaselineScore: benchmark?.baseline_score == null ? null : Number(benchmark.baseline_score),
      approvalRequestId: approval ? String(approval.approval_request_id) : null,
      releaseStatus: release ? String(release.status) : null,
      canaryStartedAt: release?.canary_started_at ? String(release.canary_started_at) : null,
      verifiedAt: release?.verified_at ? String(release.verified_at) : null,
      activatedAt: release?.activated_at ? String(release.activated_at) : null,
      rolledBackAt: release?.rolled_back_at ? String(release.rolled_back_at) : null,
    }
  })

  const statuses = candidates.map((candidate) => candidate.status)
  return {
    candidates,
    counts: {
      total: candidates.length,
      reviewRequired: statuses.filter((status) => status === 'REVIEW_REQUIRED').length,
      approvedForControlledRelease: statuses.filter((status) => status === 'APPROVED_FOR_CONTROLLED_RELEASE').length,
      canary: statuses.filter((status) => status === 'CANARY').length,
      verified: statuses.filter((status) => status === 'VERIFIED').length,
      active: statuses.filter((status) => status === 'ACTIVE').length,
      rolledBack: statuses.filter((status) => status === 'ROLLED_BACK').length,
      notReadyOrRejected: statuses.filter((status) => status === 'NOT_READY' || status === 'REJECTED').length,
    },
    authority: {
      selfPromotionAllowed: false,
      automaticAuthorityExpansionAllowed: false,
      automaticMutationBoundaryChangeAllowed: false,
      humanReviewRequired: true,
      currentAuthorizationRequiredAtRelease: true,
    },
  }
}
