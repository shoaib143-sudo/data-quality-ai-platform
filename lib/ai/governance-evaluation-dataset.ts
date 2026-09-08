import { createAdminClient } from '@/lib/supabase/admin'
import {
  VerifiedEvaluationDatasetBuilder,
  type EvaluationDatasetSource,
  type VerifiedDataQualityLearningRecord,
} from './evaluation-dataset'

export function createGovernanceEvaluationDatasetBuilder() {
  const supabase = createAdminClient()

  const source: EvaluationDatasetSource = {
    async listLearningCases(projectId, limit) {
      const { data, error } = await supabase
        .schema('agent')
        .from('agent_learning_cases')
        .select('id,project_id,source_agent_run_id,case_key,source_kind,problem_type,context,decision_status,outcome_status,effectiveness,confidence,evidence,status,occurred_at')
        .eq('project_id', projectId)
        .eq('status', 'ACTIVE')
        .eq('source_kind', 'DATA_QUALITY_RECOMMENDATION_LEARNING')
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(limit)

      if (error) throw new Error(`Unable to read evaluation learning cases: ${error.message}`)
      return data ?? []
    },

    async listDataQualityLearning(projectId, ids) {
      if (ids.length === 0) return []

      const { data: learningRows, error: learningError } = await supabase
        .schema('governance')
        .from('data_quality_recommendation_learning')
        .select('id,project_id,workflow_instance_id,remediation_outcome_id,source_agent_run_id,verification_agent_run_id,status,effective,evidence')
        .eq('project_id', projectId)
        .in('id', ids)
        .eq('status', 'VERIFIED')
        .eq('effective', true)

      if (learningError) throw new Error(`Unable to read verified recommendation learning: ${learningError.message}`)
      if (!learningRows?.length) return []

      const outcomeIds = [...new Set(learningRows.map((row) => row.remediation_outcome_id))]
      const { data: outcomes, error: outcomeError } = await supabase
        .schema('governance')
        .from('data_quality_remediation_outcomes')
        .select('id,status,verified_at,verification_job_id,verification_agent_run_id,checks')
        .eq('project_id', projectId)
        .in('id', outcomeIds)
        .eq('status', 'VERIFIED')

      if (outcomeError) throw new Error(`Unable to read verified remediation outcomes: ${outcomeError.message}`)
      const outcomeById = new Map((outcomes ?? []).map((outcome) => [outcome.id, outcome]))

      return learningRows.map((row) => ({
        ...row,
        outcome: outcomeById.get(row.remediation_outcome_id) ?? null,
      })) as VerifiedDataQualityLearningRecord[]
    },
  }

  return new VerifiedEvaluationDatasetBuilder(source)
}
