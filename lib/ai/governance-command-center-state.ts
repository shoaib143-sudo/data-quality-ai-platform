import { createAdminClient } from '@/lib/supabase/admin'
import {
  GovernedCommandCenterState,
  type CommandCenterPersistence,
} from './command-center-state'

export function createGovernanceCommandCenterState() {
  const supabase = createAdminClient()

  const persistence: CommandCenterPersistence = {
    async listAiSystems(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_systems')
        .select('id,project_id,system_key,name,system_type,lifecycle_status,current_version_id')
        .eq('project_id', projectId).order('updated_at', { ascending: false })
      if (error) throw new Error(`Unable to read AI system controls: ${error.message}`)
      return data ?? []
    },
    async listAiSystemVersions(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_system_versions')
        .select('id,project_id,ai_system_id,version_number,provider,model_name,external_version,intended_use,risk_tier,data_categories,human_oversight,limitations,semantic_hash,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI system versions: ${error.message}`)
      return data ?? []
    },
    async listAiSystemDecisions(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_system_decisions')
        .select('id,project_id,ai_system_id,version_id,decision,reviewer_user_id,reviewer_capability,review_note,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI system decisions: ${error.message}`)
      return data ?? []
    },
    async listAiSystemAssessments(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_system_assessments')
        .select('id,project_id,ai_system_id,version_id,assessment_type,result,assessor_type,assessor_user_id,source_agent_run_id,evidence,note,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI system assessments: ${error.message}`)
      return data ?? []
    },
    async listAiEvaluationResults(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_evaluation_results')
        .select('id,project_id,evaluation_type,capability,metric_name,score,pass,evaluator_type,evaluator_version,ai_system_id,ai_system_version_id,agent_run_id,source_agent_evaluation_id,telemetry_event_id,correlation_id,evidence_refs,dimensions,metadata,observed_at,created_at')
        .eq('project_id', projectId).order('observed_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read automated AI evaluation evidence: ${error.message}`)
      return data ?? []
    },
    async listAiTelemetryEvents(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_telemetry_events')
        .select('id,project_id,event_type,operation,status,provider_id,model_name,agent_run_id,ai_system_id,ai_system_version_id,correlation_id,latency_ms,input_tokens,output_tokens,cost_usd,observed_at')
        .eq('project_id', projectId).order('observed_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read AI telemetry: ${error.message}`)
      return data ?? []
    },
    async listRoutingPolicies(projectId) {
      const { data, error } = await supabase.schema('governance').from('ai_routing_policy_versions')
        .select('id,project_id,task,sensitivity,risk,enabled,allowed_ai_system_ids,min_evaluation_score,min_scored_count,allow_environment_fallback,reviewer_user_id,reviewer_capability,review_note,created_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read governed AI routing policy versions: ${error.message}`)
      return data ?? []
    },
    async listAutonomyPolicies(projectId) {
      const { data, error } = await supabase.schema('governance').from('autonomy_policies')
        .select('id,project_id,action_key,enabled,execution_mode,min_confidence,max_auto_risk_level,reversible,authority_status,reviewed_by,reviewed_at,current_version_id')
        .eq('project_id', projectId).order('updated_at', { ascending: false })
      if (error) throw new Error(`Unable to read autonomy policies: ${error.message}`)
      return data ?? []
    },
    async listAutonomyActions(projectId) {
      const { data, error } = await supabase.schema('governance').from('autonomy_actions')
        .select('id,project_id,action_key,risk_level,confidence,status,approval_workflow_instance_id,policy_version_id,created_at,executed_at,rolled_back_at')
        .eq('project_id', projectId).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(`Unable to read autonomy actions: ${error.message}`)
      return data ?? []
    },
  }

  return new GovernedCommandCenterState(persistence)
}