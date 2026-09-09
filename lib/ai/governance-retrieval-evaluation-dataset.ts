import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildGovernedRetrievalEvaluationDataset,
  type GovernedRetrievalEvaluationDataset,
  type GovernedRetrievalEvaluationRecord,
} from './retrieval-evaluation-dataset'

type RetrievalCaseRow = {
  id: string
  project_id: string
  query_text: string
  authority: 'HUMAN_REVIEWED' | 'GOVERNED_IMPORT'
  evidence_refs: string[]
  reviewer_user_id: string | null
  reviewed_at: string | null
}

type RetrievalJudgmentRow = {
  id: string
  project_id: string
  case_version_id: string
  object_key: string
  relevance: number
}

export async function buildGovernanceRetrievalEvaluationDataset(projectId: string): Promise<GovernedRetrievalEvaluationDataset> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')

  const supabase = createAdminClient()
  const { data: casesData, error: casesError } = await supabase
    .schema('governance')
    .from('ai_retrieval_evaluation_case_effective')
    .select('id,project_id,query_text,authority,evidence_refs,reviewer_user_id,reviewed_at')
    .eq('project_id', normalizedProjectId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (casesError) throw new Error(`Unable to read governed retrieval evaluation cases: ${casesError.message}`)

  const cases = (casesData ?? []) as RetrievalCaseRow[]
  if (cases.length === 0) {
    return buildGovernedRetrievalEvaluationDataset({ projectId: normalizedProjectId, records: [] })
  }

  const caseIds = cases.map((row) => row.id)
  const { data: judgmentsData, error: judgmentsError } = await supabase
    .schema('governance')
    .from('ai_retrieval_relevance_judgments')
    .select('id,project_id,case_version_id,object_key,relevance')
    .eq('project_id', normalizedProjectId)
    .in('case_version_id', caseIds)
    .order('object_key')
  if (judgmentsError) throw new Error(`Unable to read governed retrieval relevance judgments: ${judgmentsError.message}`)

  const judgments = (judgmentsData ?? []) as RetrievalJudgmentRow[]
  const judgmentsByCase = new Map<string, RetrievalJudgmentRow[]>()
  for (const judgment of judgments) {
    if (judgment.project_id !== normalizedProjectId) continue
    const current = judgmentsByCase.get(judgment.case_version_id) ?? []
    current.push(judgment)
    judgmentsByCase.set(judgment.case_version_id, current)
  }

  const records: GovernedRetrievalEvaluationRecord[] = cases.map((row) => {
    const caseJudgments = judgmentsByCase.get(row.id) ?? []
    return {
      caseId: row.id,
      projectId: row.project_id,
      query: row.query_text,
      authority: row.authority,
      evidenceRefs: [
        `governance.ai_retrieval_evaluation_case_versions:${row.id}`,
        ...row.evidence_refs,
        ...caseJudgments.map((judgment) => `governance.ai_retrieval_relevance_judgments:${judgment.id}`),
      ],
      reviewedBy: row.reviewer_user_id,
      reviewedAt: row.reviewed_at,
      judgments: caseJudgments.map((judgment) => ({
        objectKey: judgment.object_key,
        relevance: judgment.relevance,
      })),
    }
  })

  return buildGovernedRetrievalEvaluationDataset({
    projectId: normalizedProjectId,
    records,
  })
}
