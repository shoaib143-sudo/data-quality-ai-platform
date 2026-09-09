import { createAdminClient } from '@/lib/supabase/admin'
import {
  normalizeHumanRetrievalRelevanceCase,
  type HumanRetrievalRelevanceCaseInput,
  type HumanRetrievalRelevanceCaseReceipt,
  type RetrievalLabelRecorder,
} from './retrieval-label-recorder'

export class GovernanceRetrievalLabelRecorder implements RetrievalLabelRecorder {
  readonly id = 'governance_human_retrieval_label_recorder'

  async recordHumanReviewedCase(input: HumanRetrievalRelevanceCaseInput): Promise<HumanRetrievalRelevanceCaseReceipt> {
    const normalized = normalizeHumanRetrievalRelevanceCase(input)
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').rpc('record_human_retrieval_relevance_case', {
      p_project_id: normalized.projectId,
      p_case_key: normalized.caseKey,
      p_query_text: normalized.query,
      p_evidence_refs: normalized.evidenceRefs,
      p_judgments: normalized.judgments.map((judgment) => ({
        object_key: judgment.objectKey,
        relevance: judgment.relevance,
      })),
      p_reviewer_user_id: normalized.reviewerUserId,
      p_reviewer_capability: normalized.reviewerCapability,
    })

    if (error) throw new Error(`Unable to record human retrieval relevance case: ${error.message}`)
    if (typeof data !== 'string' || !data.trim()) throw new Error('Unable to record human retrieval relevance case: no case version id returned')
    return { caseVersionId: data, authority: 'HUMAN_REVIEWED', persisted: true }
  }
}

export function createGovernanceRetrievalLabelRecorder(): RetrievalLabelRecorder {
  return new GovernanceRetrievalLabelRecorder()
}
