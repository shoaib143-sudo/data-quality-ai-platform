import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }

export type LineageChangeGateResult = {
  analysisId: string
  projectId: string
  decision: string
  canProceed: boolean
  gateStatus: 'OPEN' | 'BLOCKED'
  reason: string
  approvalRequired: boolean
  approvalStatus: string | null
  workflowInstanceId: string | null
  productionMutationPerformed: false
}

export async function evaluateLineageChangeGate(analysisId: string): Promise<LineageChangeGateResult> {
  const admin = createAdminClient()
  const { data: analysis, error: analysisError } = await admin.schema('governance').from('lineage_impact_analyses')
    .select('id,project_id,evidence')
    .eq('id', analysisId)
    .maybeSingle()
  if (analysisError) throw new Error(`Unable to load lineage impact analysis: ${analysisError.message}`)
  if (!analysis) throw new Error('Lineage impact analysis not found.')

  const evidence = object(analysis.evidence)
  const proposedChange = object(evidence.proposed_change)
  const decision = text(proposedChange.decision).toUpperCase()
  const approvalRequired = proposedChange.approval_required === true || decision === 'APPROVAL_REQUIRED'

  if (decision === 'SAFE_TO_PROCEED' && !approvalRequired) {
    return {
      analysisId: analysis.id,
      projectId: analysis.project_id,
      decision,
      canProceed: true,
      gateStatus: 'OPEN',
      reason: 'Impact assessment is within the governed safe-to-proceed boundary.',
      approvalRequired: false,
      approvalStatus: null,
      workflowInstanceId: null,
      productionMutationPerformed: false,
    }
  }

  if (decision === 'REVIEW_REQUIRED' && !approvalRequired) {
    return {
      analysisId: analysis.id,
      projectId: analysis.project_id,
      decision,
      canProceed: false,
      gateStatus: 'BLOCKED',
      reason: 'Manual governance review is required before this change can proceed.',
      approvalRequired: false,
      approvalStatus: null,
      workflowInstanceId: null,
      productionMutationPerformed: false,
    }
  }

  if (!approvalRequired) {
    return {
      analysisId: analysis.id,
      projectId: analysis.project_id,
      decision: decision || 'UNKNOWN',
      canProceed: false,
      gateStatus: 'BLOCKED',
      reason: 'No recognized governed proceed decision exists for this analysis.',
      approvalRequired: false,
      approvalStatus: null,
      workflowInstanceId: null,
      productionMutationPerformed: false,
    }
  }

  const { data: definitions, error: definitionError } = await admin.schema('governance').from('workflow_definitions')
    .select('id')
    .eq('project_id', analysis.project_id)
    .eq('workflow_key', 'LINEAGE_CHANGE_APPROVAL')
    .eq('entity_type', 'LINEAGE_IMPACT_ANALYSIS')
  if (definitionError) throw new Error(`Unable to resolve lineage approval workflow: ${definitionError.message}`)
  const definitionIds = (definitions ?? []).map((row) => row.id)
  if (!definitionIds.length) {
    return {
      analysisId: analysis.id,
      projectId: analysis.project_id,
      decision,
      canProceed: false,
      gateStatus: 'BLOCKED',
      reason: 'Governed approval is required but no approval workflow exists yet.',
      approvalRequired: true,
      approvalStatus: null,
      workflowInstanceId: null,
      productionMutationPerformed: false,
    }
  }

  const { data: instance, error: instanceError } = await admin.schema('governance').from('workflow_instances')
    .select('id,status,started_at')
    .eq('project_id', analysis.project_id)
    .eq('entity_type', 'LINEAGE_IMPACT_ANALYSIS')
    .eq('entity_id', analysis.id)
    .in('workflow_definition_id', definitionIds)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (instanceError) throw new Error(`Unable to evaluate lineage approval gate: ${instanceError.message}`)

  const approvalStatus = text(instance?.status).toUpperCase() || null
  const approved = approvalStatus === 'APPROVED'
  return {
    analysisId: analysis.id,
    projectId: analysis.project_id,
    decision,
    canProceed: approved,
    gateStatus: approved ? 'OPEN' : 'BLOCKED',
    reason: approved
      ? 'The exact lineage impact analysis has completed governed approval.'
      : approvalStatus
        ? `Governed approval is ${approvalStatus.toLowerCase()}; deployment remains blocked.`
        : 'Governed approval is required and has not been completed.',
    approvalRequired: true,
    approvalStatus,
    workflowInstanceId: instance?.id ?? null,
    productionMutationPerformed: false,
  }
}
