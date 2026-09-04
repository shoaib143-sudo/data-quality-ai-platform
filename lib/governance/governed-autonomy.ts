import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type RiskLevel = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type ActionStatus = 'PROPOSED' | 'AWAITING_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'EXECUTED' | 'REJECTED' | 'BLOCKED' | 'FAILED' | 'ROLLED_BACK'

type AutonomyPolicy = {
  id: string
  project_id: string
  action_key: string
  enabled: boolean
  execution_mode: 'AUTO' | 'APPROVAL_REQUIRED' | 'BLOCKED'
  min_confidence: number | string
  max_auto_risk_level: RiskLevel
  reversible: boolean
  rollback_strategy: string | null
  allowed_target_types: string[] | null
  metadata: Record<string, unknown> | null
}

type ProposedAction = {
  projectId: string
  actionKey: string
  targetType: string
  targetId?: string | null
  riskLevel: RiskLevel
  confidence: number
  idempotencyKey: string
  requestedBy?: string | null
  sourceAgentRunId?: string | null
  input?: Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function riskRank(value: unknown) {
  return ({ INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as Record<string, number>)[text(value).toUpperCase()] ?? 0
}

function normalizeRisk(value: unknown): RiskLevel {
  const normalized = text(value).toUpperCase()
  return (['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized) ? normalized : 'MEDIUM') as RiskLevel
}

function allowedTarget(policy: AutonomyPolicy, targetType: string) {
  const allowed = (policy.allowed_target_types ?? []).map((value) => value.toUpperCase())
  return allowed.length === 0 || allowed.includes(targetType.toUpperCase())
}

async function loadPolicy(projectId: string, actionKey: string) {
  const admin = createAdminClient()
  await admin.schema('governance').rpc('seed_default_autonomy_policies', { p_project_id: projectId })
  const { data, error } = await admin.schema('governance').from('autonomy_policies')
    .select('id,project_id,action_key,enabled,execution_mode,min_confidence,max_auto_risk_level,reversible,rollback_strategy,allowed_target_types,metadata')
    .eq('project_id', projectId)
    .eq('action_key', actionKey)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve autonomy policy: ${error.message}`)
  if (!data) throw new Error(`No autonomy policy is registered for ${actionKey}.`)
  return data as AutonomyPolicy
}

async function ensureApprovalWorkflow(input: {
  projectId: string
  actionId: string
  requestedBy: string | null
  actionKey: string
  targetType: string
  targetId: string | null
  riskLevel: RiskLevel
  confidence: number
  actionInput: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const workflowKey = 'GOVERNED_AUTONOMY_ACTION_APPROVAL'
  let { data: definition, error: definitionError } = await admin.schema('governance').from('workflow_definitions')
    .select('id,workflow_key,version')
    .eq('project_id', input.projectId)
    .eq('workflow_key', workflowKey)
    .eq('entity_type', 'AUTONOMY_ACTION')
    .eq('enabled', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (definitionError) throw new Error(`Unable to resolve autonomy approval workflow: ${definitionError.message}`)

  if (!definition) {
    const created = await admin.schema('governance').from('workflow_definitions').insert({
      project_id: input.projectId,
      workflow_key: workflowKey,
      name: 'Governed autonomy action approval',
      entity_type: 'AUTONOMY_ACTION',
      version: 1,
      steps: [{
        index: 0,
        name: 'Human autonomy action approval',
        capability: 'issues.manage',
        description: 'Review the proposed governed action, evidence, confidence, risk and rollback posture before execution.',
      }],
      enabled: true,
      created_by: input.requestedBy,
    }).select('id,workflow_key,version').single()
    if (created.error || !created.data) {
      const raced = await admin.schema('governance').from('workflow_definitions').select('id,workflow_key,version')
        .eq('project_id', input.projectId)
        .eq('workflow_key', workflowKey)
        .eq('entity_type', 'AUTONOMY_ACTION')
        .eq('enabled', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (raced.error || !raced.data) throw new Error(`Unable to provision autonomy approval workflow: ${created.error?.message ?? raced.error?.message ?? 'unknown error'}`)
      definition = raced.data
    } else {
      definition = created.data
    }
  }

  const { data: instanceId, error: startError } = await admin.schema('governance').rpc('start_workflow', {
    p_definition_id: definition.id,
    p_entity_type: 'AUTONOMY_ACTION',
    p_entity_id: input.actionId,
    p_started_by: input.requestedBy,
    p_context: {
      source: 'GOVERNED_AUTONOMY',
      autonomy_action_id: input.actionId,
      action_key: input.actionKey,
      target_type: input.targetType,
      target_id: input.targetId,
      risk_level: input.riskLevel,
      confidence: input.confidence,
      input: input.actionInput,
      human_approval_required: true,
    },
  })
  if (startError || !instanceId) throw new Error(`Unable to start autonomy approval workflow: ${startError?.message ?? 'unknown error'}`)
  return String(instanceId)
}

async function executeCreateGovernanceIssue(action: Record<string, any>) {
  const admin = createAdminClient()
  const input = object(action.input)
  const title = text(input.title) || 'Autonomous governance risk review'
  const description = text(input.description) || 'A governed autonomous risk signal requires review.'
  const severity = normalizeRisk(input.severity ?? action.risk_level)
  const datasetId = text(input.datasetId ?? input.dataset_id) || (action.target_type === 'DATASET' ? action.target_id : null)
  const datasetVersionId = text(input.datasetVersionId ?? input.dataset_version_id) || null
  const profileRunId = text(input.profileRunId ?? input.profile_run_id) || null

  const { data: issue, error: issueError } = await admin.schema('governance').from('issues').insert({
    project_id: action.project_id,
    dataset_id: datasetId,
    dataset_version_id: datasetVersionId,
    profile_run_id: profileRunId,
    title: title.slice(0, 500),
    description: description.slice(0, 4000),
    severity,
    status: 'OPEN',
    created_by: action.requested_by ?? null,
    resolution_evidence: {
      autonomy_action_id: action.id,
      source_agent_run_id: action.source_agent_run_id ?? null,
      source_prediction_id: input.predictionId ?? input.prediction_id ?? null,
      autonomous_creation: true,
      production_source_mutation: false,
    },
  }).select('id,title,severity,status,created_at').single()
  if (issueError || !issue) throw new Error(`Unable to create governed autonomy issue: ${issueError?.message ?? 'unknown error'}`)

  return {
    issueId: issue.id,
    issue,
    rollback: { strategy: 'CLOSE_CREATED_ISSUE', issue_id: issue.id },
  }
}

async function executeActionRow(action: Record<string, any>, actorUserId?: string | null) {
  const admin = createAdminClient()
  const { data: claimed, error: claimError } = await admin.schema('governance').from('autonomy_actions').update({
    status: 'EXECUTING',
    error_message: null,
    updated_at: new Date().toISOString(),
  }).eq('id', action.id).in('status', ['PROPOSED', 'APPROVED']).select('*').maybeSingle()
  if (claimError) throw new Error(`Unable to claim autonomy action: ${claimError.message}`)
  if (!claimed) {
    const current = await admin.schema('governance').from('autonomy_actions').select('*').eq('id', action.id).maybeSingle()
    if (current.error || !current.data) throw new Error(`Unable to resolve autonomy action after claim: ${current.error?.message ?? 'not found'}`)
    return current.data
  }

  try {
    if (claimed.action_key !== 'CREATE_GOVERNANCE_ISSUE') {
      throw new Error(`Autonomous execution is not implemented for ${claimed.action_key}; explicit governed execution remains required.`)
    }
    const executed = await executeCreateGovernanceIssue(claimed)
    const { data: completed, error: completeError } = await admin.schema('governance').from('autonomy_actions').update({
      status: 'EXECUTED',
      result: executed,
      rollback: executed.rollback,
      executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', claimed.id).select('*').single()
    if (completeError || !completed) throw new Error(`Unable to persist autonomy execution result: ${completeError?.message ?? 'unknown error'}`)

    await writeGovernanceAudit({
      projectId: claimed.project_id,
      actorUserId: actorUserId ?? claimed.requested_by ?? null,
      actorType: actorUserId || claimed.requested_by ? 'USER' : 'AGENT',
      eventType: 'GOVERNED_AUTONOMY_ACTION_EXECUTED',
      entityType: claimed.target_type,
      entityId: claimed.target_id ?? claimed.id,
      correlationId: claimed.id,
      metadata: {
        autonomy_action_id: claimed.id,
        action_key: claimed.action_key,
        risk_level: claimed.risk_level,
        confidence: claimed.confidence,
        result: executed,
        production_source_mutation: false,
        reversible: true,
      },
    })
    return completed
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Governed autonomy execution failed.'
    await admin.schema('governance').from('autonomy_actions').update({
      status: 'FAILED',
      error_message: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
    }).eq('id', claimed.id)
    throw error
  }
}

export async function proposeGovernedAction(input: ProposedAction) {
  const admin = createAdminClient()
  const actionKey = input.actionKey.trim().toUpperCase()
  const targetType = input.targetType.trim().toUpperCase()
  const riskLevel = normalizeRisk(input.riskLevel)
  const confidence = clamp(input.confidence)
  const policy = await loadPolicy(input.projectId, actionKey)

  const { data: existing, error: existingError } = await admin.schema('governance').from('autonomy_actions')
    .select('*')
    .eq('project_id', input.projectId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve existing autonomy action: ${existingError.message}`)
  if (existing) return { action: existing, reused: true }

  let initialStatus: ActionStatus = 'PROPOSED'
  let blockedReason: string | null = null
  if (!policy.enabled || policy.execution_mode === 'BLOCKED') {
    initialStatus = 'BLOCKED'
    blockedReason = text(policy.metadata?.blocked_reason) || `Action ${actionKey} is blocked by governed autonomy policy.`
  } else if (!allowedTarget(policy, targetType)) {
    initialStatus = 'BLOCKED'
    blockedReason = `Target type ${targetType} is not allowlisted for ${actionKey}.`
  }

  const { data: action, error: insertError } = await admin.schema('governance').from('autonomy_actions').insert({
    project_id: input.projectId,
    policy_id: policy.id,
    source_agent_run_id: input.sourceAgentRunId ?? null,
    action_key: actionKey,
    target_type: targetType,
    target_id: input.targetId ?? null,
    risk_level: riskLevel,
    confidence,
    status: initialStatus,
    idempotency_key: input.idempotencyKey,
    requested_by: input.requestedBy ?? null,
    input: input.input ?? {},
    error_message: blockedReason,
  }).select('*').single()
  if (insertError || !action) throw new Error(`Unable to persist autonomy action proposal: ${insertError?.message ?? 'unknown error'}`)

  if (initialStatus === 'BLOCKED') {
    await writeGovernanceAudit({
      projectId: input.projectId,
      actorUserId: input.requestedBy ?? null,
      actorType: input.requestedBy ? 'USER' : 'AGENT',
      eventType: 'GOVERNED_AUTONOMY_ACTION_BLOCKED',
      entityType: targetType,
      entityId: input.targetId ?? action.id,
      correlationId: action.id,
      metadata: { autonomy_action_id: action.id, action_key: actionKey, reason: blockedReason, risk_level: riskLevel, confidence },
    })
    return { action, reused: false }
  }

  const autoEligible = policy.execution_mode === 'AUTO'
    && confidence >= Number(policy.min_confidence)
    && riskRank(riskLevel) <= riskRank(policy.max_auto_risk_level)
    && policy.reversible

  if (autoEligible) {
    const executed = await executeActionRow(action, input.requestedBy ?? null)
    return { action: executed, reused: false }
  }

  const workflowInstanceId = await ensureApprovalWorkflow({
    projectId: input.projectId,
    actionId: action.id,
    requestedBy: input.requestedBy ?? null,
    actionKey,
    targetType,
    targetId: input.targetId ?? null,
    riskLevel,
    confidence,
    actionInput: input.input ?? {},
  })
  const { data: awaiting, error: updateError } = await admin.schema('governance').from('autonomy_actions').update({
    status: 'AWAITING_APPROVAL',
    approval_workflow_instance_id: workflowInstanceId,
    updated_at: new Date().toISOString(),
  }).eq('id', action.id).select('*').single()
  if (updateError || !awaiting) throw new Error(`Unable to persist autonomy approval state: ${updateError?.message ?? 'unknown error'}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.requestedBy ?? null,
    actorType: input.requestedBy ? 'USER' : 'AGENT',
    eventType: 'GOVERNED_AUTONOMY_APPROVAL_REQUESTED',
    entityType: targetType,
    entityId: input.targetId ?? action.id,
    correlationId: workflowInstanceId,
    metadata: { autonomy_action_id: action.id, action_key: actionKey, workflow_instance_id: workflowInstanceId, risk_level: riskLevel, confidence },
  })

  return { action: awaiting, reused: false }
}

export async function executeApprovedGovernedAction(actionId: string, actorUserId: string) {
  const admin = createAdminClient()
  const { data: action, error: actionError } = await admin.schema('governance').from('autonomy_actions').select('*').eq('id', actionId).maybeSingle()
  if (actionError || !action) throw new Error(`Unable to resolve governed autonomy action: ${actionError?.message ?? 'not found'}`)
  if (action.status === 'EXECUTED' || action.status === 'ROLLED_BACK') return action
  if (!action.approval_workflow_instance_id) throw new Error('This autonomy action has no approval workflow.')

  const { data: workflow, error: workflowError } = await admin.schema('governance').from('workflow_instances')
    .select('id,status')
    .eq('id', action.approval_workflow_instance_id)
    .eq('project_id', action.project_id)
    .maybeSingle()
  if (workflowError || !workflow) throw new Error(`Unable to resolve autonomy approval workflow: ${workflowError?.message ?? 'not found'}`)
  if (workflow.status === 'REJECTED' || workflow.status === 'CANCELLED') {
    await admin.schema('governance').from('autonomy_actions').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', action.id)
    throw new Error(`Autonomy action cannot execute because workflow is ${workflow.status}.`)
  }
  if (workflow.status !== 'APPROVED') throw new Error('Autonomy action requires explicit human workflow approval before execution.')

  await admin.schema('governance').from('autonomy_actions').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', action.id)
  return executeActionRow({ ...action, status: 'APPROVED' }, actorUserId)
}

export async function rollbackGovernedAction(actionId: string, actorUserId: string) {
  const admin = createAdminClient()
  const { data: action, error: actionError } = await admin.schema('governance').from('autonomy_actions')
    .select('*,autonomy_policies(reversible,rollback_strategy)')
    .eq('id', actionId)
    .maybeSingle()
  if (actionError || !action) throw new Error(`Unable to resolve autonomy action for rollback: ${actionError?.message ?? 'not found'}`)
  if (action.status === 'ROLLED_BACK') return action
  if (action.status !== 'EXECUTED') throw new Error(`Only executed autonomy actions can be rolled back, received ${action.status}.`)

  const policyRaw = Array.isArray(action.autonomy_policies) ? action.autonomy_policies[0] : action.autonomy_policies
  if (!policyRaw?.reversible || policyRaw.rollback_strategy !== 'CLOSE_CREATED_ISSUE' || action.action_key !== 'CREATE_GOVERNANCE_ISSUE') {
    throw new Error('This governed autonomy action has no approved rollback strategy.')
  }

  const result = object(action.result)
  const issueId = text(result.issueId) || text(object(action.rollback).issue_id)
  if (!issueId) throw new Error('Autonomy action rollback is missing the created issue identifier.')

  const { data: issue, error: issueError } = await admin.schema('governance').from('issues')
    .select('id,status,resolution_summary,resolution_evidence')
    .eq('id', issueId)
    .eq('project_id', action.project_id)
    .maybeSingle()
  if (issueError || !issue) throw new Error(`Unable to resolve created issue for rollback: ${issueError?.message ?? 'not found'}`)

  const beforeState = { issue }
  const { error: closeError } = await admin.schema('governance').from('issues').update({
    status: 'CLOSED',
    resolution_summary: `Rolled back governed autonomous issue creation by ${actorUserId}.`,
    resolution_evidence: {
      ...object(issue.resolution_evidence),
      autonomy_action_id: action.id,
      autonomy_rollback: true,
      rolled_back_by: actorUserId,
      rolled_back_at: new Date().toISOString(),
    },
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', issueId).eq('project_id', action.project_id)
  if (closeError) throw new Error(`Unable to rollback autonomous issue creation: ${closeError.message}`)

  const { data: rolledBack, error: actionUpdateError } = await admin.schema('governance').from('autonomy_actions').update({
    status: 'ROLLED_BACK',
    before_state: beforeState,
    rollback: { ...object(action.rollback), strategy: 'CLOSE_CREATED_ISSUE', issue_id: issueId, rolled_back_by: actorUserId },
    rolled_back_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', action.id).select('*').single()
  if (actionUpdateError || !rolledBack) throw new Error(`Unable to persist autonomy rollback: ${actionUpdateError?.message ?? 'unknown error'}`)

  await writeGovernanceAudit({
    projectId: action.project_id,
    actorUserId,
    actorType: 'USER',
    eventType: 'GOVERNED_AUTONOMY_ACTION_ROLLED_BACK',
    entityType: action.target_type,
    entityId: action.target_id ?? action.id,
    correlationId: action.id,
    metadata: { autonomy_action_id: action.id, action_key: action.action_key, issue_id: issueId, rollback_strategy: 'CLOSE_CREATED_ISSUE' },
  })
  return rolledBack
}

export async function applyPredictiveRiskGovernedActions(projectId: string) {
  const admin = createAdminClient()
  const { data: predictions, error: predictionError } = await admin.schema('governance').from('governance_risk_predictions')
    .select('id,dataset_id,prediction_type,probability,risk_level,confidence,source_profile_run_id,contributors,explanation,evidence,expires_at')
    .eq('project_id', projectId)
    .eq('prediction_type', 'GOVERNANCE_RISK_30D')
    .in('risk_level', ['HIGH', 'CRITICAL'])
    .gte('confidence', 0.8)
    .gt('expires_at', new Date().toISOString())
    .order('probability', { ascending: false })
  if (predictionError) throw new Error(`Unable to load predictive risk for governed autonomy: ${predictionError.message}`)

  const datasetIds = [...new Set((predictions ?? []).map((prediction) => prediction.dataset_id))]
  const { data: datasets, error: datasetError } = datasetIds.length
    ? await admin.schema('catalog').from('datasets').select('id,name').in('id', datasetIds).eq('project_id', projectId)
    : { data: [], error: null }
  if (datasetError) throw new Error(`Unable to load governed autonomy dataset labels: ${datasetError.message}`)
  const datasetNames = new Map((datasets ?? []).map((dataset) => [dataset.id, dataset.name]))

  const results: Array<Record<string, unknown>> = []
  for (const prediction of predictions ?? []) {
    const datasetName = datasetNames.get(prediction.dataset_id) ?? `dataset ${prediction.dataset_id}`
    const proposed = await proposeGovernedAction({
      projectId,
      actionKey: 'CREATE_GOVERNANCE_ISSUE',
      targetType: 'DATASET',
      targetId: prediction.dataset_id,
      riskLevel: normalizeRisk(prediction.risk_level),
      confidence: Number(prediction.confidence),
      idempotencyKey: `predictive-risk-review:${prediction.id}`,
      input: {
        predictionId: prediction.id,
        datasetId: prediction.dataset_id,
        profileRunId: prediction.source_profile_run_id,
        severity: prediction.risk_level,
        title: `${datasetName} predictive governance risk requires review`,
        description: `${prediction.explanation} This issue was created autonomously as reversible governance metadata; no source data, schema or quality thresholds were changed.`,
        probability: prediction.probability,
        contributors: prediction.contributors,
        evidence: prediction.evidence,
      },
    })
    results.push({ predictionId: prediction.id, datasetId: prediction.dataset_id, actionId: proposed.action.id, status: proposed.action.status, reused: proposed.reused })
  }
  return { projectId, qualifyingPredictions: predictions?.length ?? 0, actions: results }
}

export async function applyAllPredictiveRiskGovernedActions() {
  const admin = createAdminClient()
  const { data: projects, error } = await admin.schema('app').from('projects').select('id').limit(500)
  if (error) throw new Error(`Unable to list projects for governed autonomy: ${error.message}`)
  const results: Array<Record<string, unknown>> = []
  for (const project of projects ?? []) {
    try {
      results.push(await applyPredictiveRiskGovernedActions(project.id))
    } catch (error) {
      results.push({ projectId: project.id, error: error instanceof Error ? error.message : 'Governed autonomy failed.' })
    }
  }
  return results
}

export async function listGovernedAutonomy(projectId: string) {
  const admin = createAdminClient()
  const [policies, actions] = await Promise.all([
    admin.schema('governance').from('autonomy_policies').select('*').eq('project_id', projectId).order('action_key'),
    admin.schema('governance').from('autonomy_actions').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),
  ])
  if (policies.error) throw new Error(`Unable to list autonomy policies: ${policies.error.message}`)
  if (actions.error) throw new Error(`Unable to list autonomy actions: ${actions.error.message}`)
  return { policies: policies.data ?? [], actions: actions.data ?? [] }
}
