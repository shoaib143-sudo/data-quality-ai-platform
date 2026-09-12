import { chooseProfileReadinessRemediation } from '@/lib/ai/profile-readiness-remediation-model'
import { evaluateProfileReadinessRemediationPolicy } from '@/lib/profiling/readiness-remediation-policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'

type AllowedAction = 'REVALIDATE_SOURCE' | 'NO_ACTION'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

async function loadReadiness(projectId: string, datasetVersionId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').rpc('verify_dataset_version_profile_readiness', {
    p_project_id: projectId,
    p_dataset_version_id: datasetVersionId,
  })
  if (error) throw new Error(`Unable to verify profile readiness for remediation: ${error.message}`)
  return record(data)
}

export async function executeProfileReadinessRemediation(input: {
  projectId: string
  datasetVersionId: string
  agentRunId: string
}) {
  const before = await loadReadiness(input.projectId, input.datasetVersionId)
  const beforeState = text(before.state) || 'NOT_ASSESSED'
  const policy = evaluateProfileReadinessRemediationPolicy(before)

  if (beforeState === 'READY' && before.profiling_ready === true) {
    return {
      status: 'ALREADY_READY',
      selected_action: 'NO_ACTION',
      executed: false,
      approval_required: false,
      rationale: 'The deterministic readiness verifier already reports READY.',
      confidence: 1,
      before_state: beforeState,
      after_state: beforeState,
      blocker_codes: policy.blockerCodes,
      readiness: before,
      provider: null,
      model: null,
    }
  }

  const ai = await chooseProfileReadinessRemediation({
    projectId: input.projectId,
    executionCorrelationId: input.agentRunId,
    readiness: before,
    allowedActions: policy.allowedActions,
  })

  if (!ai) {
    return {
      status: policy.approvalRequired ? 'APPROVAL_REQUIRED' : 'AI_UNAVAILABLE',
      selected_action: 'NO_ACTION',
      executed: false,
      approval_required: policy.approvalRequired,
      rationale: policy.approvalRequired
        ? 'One or more active readiness blockers require explicit approval before any governed change.'
        : 'No governed AI reasoning provider is currently available. No mutation was attempted.',
      confidence: null,
      before_state: beforeState,
      after_state: beforeState,
      blocker_codes: policy.blockerCodes,
      readiness: before,
      provider: null,
      model: null,
    }
  }

  const rawAction = text(ai.result.action).toUpperCase()
  const selectedAction: AllowedAction = policy.allowedActions.includes(rawAction as AllowedAction) ? rawAction as AllowedAction : 'NO_ACTION'
  const rationale = text(ai.result.rationale) || 'The AI planner did not provide a rationale.'
  const confidence = number(ai.result.confidence)

  if (selectedAction !== 'REVALIDATE_SOURCE') {
    return {
      status: policy.approvalRequired ? 'APPROVAL_REQUIRED' : 'NO_SAFE_AUTOMATIC_ACTION',
      selected_action: 'NO_ACTION',
      executed: false,
      approval_required: policy.approvalRequired,
      rationale,
      confidence,
      before_state: beforeState,
      after_state: beforeState,
      blocker_codes: policy.blockerCodes,
      readiness: before,
      provider: ai.provider,
      model: ai.model,
      routing: ai.routing,
    }
  }

  if (!policy.canExecuteLowRiskRepair || !policy.sourceId) {
    return {
      status: 'POLICY_BLOCKED',
      selected_action: 'NO_ACTION',
      executed: false,
      approval_required: policy.approvalRequired,
      rationale: 'The AI requested an action that is not authorized by the deterministic remediation policy. No mutation was attempted.',
      confidence,
      before_state: beforeState,
      after_state: beforeState,
      blocker_codes: policy.blockerCodes,
      readiness: before,
      provider: ai.provider,
      model: ai.model,
      routing: ai.routing,
    }
  }

  const repair = await revalidateAndReconcileSourceForProfiling({ projectId: input.projectId, sourceId: policy.sourceId })
  const after = await loadReadiness(input.projectId, input.datasetVersionId)
  const afterState = text(after.state) || 'NOT_ASSESSED'

  return {
    status: afterState === 'READY' && after.profiling_ready === true ? 'REMEDIATED' : 'REMEDIATION_ATTEMPTED',
    selected_action: selectedAction,
    executed: true,
    approval_required: false,
    rationale,
    confidence,
    before_state: beforeState,
    after_state: afterState,
    blocker_codes: policy.blockerCodes,
    readiness: after,
    source_validation: repair.validation,
    provider: ai.provider,
    model: ai.model,
    routing: ai.routing,
  }
}
