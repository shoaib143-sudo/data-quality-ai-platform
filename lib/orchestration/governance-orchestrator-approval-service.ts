import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { runNativeSpecialistSupervisor } from '@/lib/agents/runtime/native-supervisor-service'
import { resolveBoundGuidedScope, sameBoundGuidedScope, type BoundGuidedScope } from '@/lib/orchestration/governance-guided-source-selection'
import { getProjectAutonomyPolicy, getLatestCoverageRun } from '@/lib/orchestration/governance-orchestrator-service-v2'

const SPECIALIST_KEYS = ['steward_agent','governance_analyst_agent','architect_agent','investigator_agent','executive_agent','support_agent'] as const

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function approvalParameters(row: Record<string, unknown>): Record<string, unknown> {
  const fingerprintPayload = safeObject(row.fingerprint_payload)
  return safeObject(fingerprintPayload.parameters)
}

async function resolveSpecialists() {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('agent_definitions').select('id,agent_key')
    .in('agent_key', [...SPECIALIST_KEYS]).eq('version', '1.0').eq('enabled', true)
  if (error) throw new Error(`Unable to resolve orchestrator specialists: ${error.message}`)
  const byKey = new Map((data ?? []).map(row => [String(row.agent_key), String(row.id)]))
  const missing = SPECIALIST_KEYS.filter(key => !byKey.has(key))
  if (missing.length) throw new Error(`Required orchestrator specialists are unavailable: ${missing.join(', ')}`)
  return byKey
}

async function createCapabilityRun(projectId: string, orchestratorRunId: string, policyVersion: string, mode: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('create_ai_capability_e2e_run', {
    p_project_id: projectId,
    p_metadata: { orchestrator_run_id: orchestratorRunId, policy_version: policyVersion, autonomy_mode: mode, source: 'datanexus_governance_orchestrator_approval_resume' },
  })
  if (error || !data) throw new Error(`Unable to create canonical AI capability run: ${error?.message ?? 'unknown error'}`)
  return String(data)
}

async function attachLatestDatasetVersions(projectId: string, capabilityRunId: string, guidedScope?: BoundGuidedScope | null) {
  const admin = createAdminClient()
  if (guidedScope) {
    const current = await resolveBoundGuidedScope({ projectId, scopeVersionId: guidedScope.scopeVersionId })
    if (!sameBoundGuidedScope(guidedScope, current)) throw new Error('GUIDED source scope changed during approval; submit a new request.')
    for (const datasetVersionId of current.datasetVersionIds) {
      const { error } = await admin.schema('governance').rpc('attach_ai_capability_e2e_dataset_version', { p_run_id: capabilityRunId, p_dataset_version_id: datasetVersionId })
      if (error) throw new Error(`Unable to attach selected version ${datasetVersionId}: ${error.message}`)
    }
    return current.datasetVersionIds
  }
  const { data: datasets, error: datasetError } = await admin.schema('catalog').from('datasets').select('id').eq('project_id', projectId).eq('status', 'ACTIVE')
  if (datasetError) throw new Error(`Unable to resolve project datasets: ${datasetError.message}`)
  const ids = (datasets ?? []).map(row => String(row.id))
  if (!ids.length) return [] as string[]
  const { data: versions, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,version_number').in('dataset_id', ids).eq('status', 'AVAILABLE').order('version_number', { ascending: false })
  if (versionError) throw new Error(`Unable to resolve project dataset versions: ${versionError.message}`)
  const latest = new Map<string,string>()
  for (const row of versions ?? []) if (!latest.has(String(row.dataset_id))) latest.set(String(row.dataset_id), String(row.id))
  const versionIds = [...latest.values()]
  for (const datasetVersionId of versionIds) {
    const { error } = await admin.schema('governance').rpc('attach_ai_capability_e2e_dataset_version', { p_run_id: capabilityRunId, p_dataset_version_id: datasetVersionId })
    if (error) throw new Error(`Unable to attach dataset version ${datasetVersionId}: ${error.message}`)
  }
  return versionIds
}

export async function loadPausedOrchestratorRun(input: { projectId: string; orchestratorRunId: string }) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('governance_orchestrator_runs')
    .select('id,project_id,actor_user_id,policy_version,mode,goal_hash,status,decision_trace,ai_capability_e2e_run_id,created_at')
    .eq('id', input.orchestratorRunId).eq('project_id', input.projectId).maybeSingle()
  if (error) throw new Error(`Unable to load paused orchestrator run: ${error.message}`)
  if (!data) throw new Error('Governance orchestrator run was not found.')
  return data as Record<string, unknown>
}

export async function rejectGovernanceOrchestratorApproval(input: {
  projectId: string
  orchestratorRunId: string
  approvalRequestId: string
  reviewerUserId: string
  comment: string
}) {
  const admin = createAdminClient()
  const run = await loadPausedOrchestratorRun(input)
  if (String(run.status) !== 'WAITING_APPROVAL') throw new Error(`Orchestrator run is not waiting for approval. Current status: ${String(run.status)}.`)
  const trace = safeObject(run.decision_trace)
  const { data, error } = await admin.schema('governance').from('governance_orchestrator_runs').update({
    status: 'BLOCKED_POLICY',
    completed_at: new Date().toISOString(),
    decision_trace: {
      ...trace,
      approval_request_id: input.approvalRequestId,
      approval_decision: 'REJECTED',
      approval_reviewed_by: input.reviewerUserId,
      approval_comment: input.comment.slice(0, 1000),
    },
  }).eq('id', input.orchestratorRunId).eq('project_id', input.projectId).eq('status', 'WAITING_APPROVAL').select('id').maybeSingle()
  if (error) throw new Error(`Unable to reject paused orchestrator run: ${error.message}`)
  if (!data) throw new Error('Orchestrator run changed concurrently; rejection was not applied to runtime state.')
  return { status: 'BLOCKED_POLICY' as const, orchestratorRunId: input.orchestratorRunId }
}

export async function resumeGovernanceOrchestratorAfterApproval(input: {
  projectId: string
  orchestratorRunId: string
  approvalRequestId: string
  reviewerUserId: string
  goal: string
}) {
  const admin = createAdminClient()
  const run = await loadPausedOrchestratorRun(input)
  if (String(run.status) !== 'WAITING_APPROVAL') throw new Error(`Orchestrator run is not waiting for approval. Current status: ${String(run.status)}.`)
  if (!input.goal.trim()) throw new Error('The original execution goal is required to resume this paused run.')
  const goalHash = createHash('sha256').update(input.goal).digest('hex')
  if (goalHash !== String(run.goal_hash)) throw new Error('Execution goal does not match the exact paused run. Resume denied.')

  const policy = await getProjectAutonomyPolicy(input.projectId)
  if (!policy.enabled || policy.mode === 'OFF' || policy.emergencyStop) throw new Error('Current autonomy policy no longer permits execution. Resume denied.')
  if (policy.policyVersion !== String(run.policy_version) || policy.mode !== String(run.mode)) {
    throw new Error('Autonomy policy changed while approval was pending. Resume denied; submit a new governed run.')
  }

  const trace = safeObject(run.decision_trace)
  let guidedScope: BoundGuidedScope | null = null
  if (policy.mode === 'GUIDED') {
    const snapshot = safeObject(trace.guided_scope)
    const scopeVersionId = String(snapshot.scope_version_id ?? '')
    if (!scopeVersionId || !Array.isArray(snapshot.qualified_names) || !Array.isArray(snapshot.dataset_version_ids)) {
      throw new Error('GUIDED request is missing its exact approved source snapshot. Resume denied.')
    }
    const expected: BoundGuidedScope = {
      scopeVersionId, sourceId: String(snapshot.source_id ?? ''), scopeHash: String(snapshot.scope_hash ?? ''),
      qualifiedNames: snapshot.qualified_names.map(String), datasetVersionIds: snapshot.dataset_version_ids.map(String),
    }
    const observed = await resolveBoundGuidedScope({ projectId: input.projectId, scopeVersionId })
    if (!sameBoundGuidedScope(expected, observed)) throw new Error('Source scope or dataset versions changed while approval was pending. Resume denied; submit a new GUIDED request.')
    guidedScope = observed
  }
  const startedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await admin.schema('governance').from('governance_orchestrator_runs').update({
    status: 'RUNNING',
    started_at: startedAt,
    completed_at: null,
    decision_trace: {
      ...trace,
      approval_request_id: input.approvalRequestId,
      approval_decision: 'APPROVED',
      approval_reviewed_by: input.reviewerUserId,
      resumed_at: startedAt,
      resumed_exact_run: true,
    },
  }).eq('id', input.orchestratorRunId).eq('project_id', input.projectId).eq('status', 'WAITING_APPROVAL').select('id').maybeSingle()
  if (claimError) throw new Error(`Unable to claim paused orchestrator run: ${claimError.message}`)
  if (!claimed) throw new Error('Orchestrator run changed concurrently. Resume denied.')

  try {
    const existingCapabilityRunId = run.ai_capability_e2e_run_id ? String(run.ai_capability_e2e_run_id) : ''
    const capabilityRunId = existingCapabilityRunId || await createCapabilityRun(input.projectId, input.orchestratorRunId, policy.policyVersion, policy.mode)
    if (!existingCapabilityRunId) {
      const { error } = await admin.schema('governance').from('governance_orchestrator_runs').update({ ai_capability_e2e_run_id: capabilityRunId }).eq('id', input.orchestratorRunId)
      if (error) throw new Error(`Unable to bind canonical capability run: ${error.message}`)
    }

    const datasetVersionIds = await attachLatestDatasetVersions(input.projectId, capabilityRunId, guidedScope)
    if (!datasetVersionIds.length) {
      await admin.schema('governance').from('governance_orchestrator_runs').update({
        status: 'BLOCKED_EXTERNAL', completed_at: new Date().toISOString(),
        decision_trace: { ...trace, approval_request_id: input.approvalRequestId, approval_decision: 'APPROVED', blocker: 'No AVAILABLE dataset version exists. Canonical certification requires at least one dataset version.' },
      }).eq('id', input.orchestratorRunId)
      return { status: 'BLOCKED_EXTERNAL' as const, orchestratorRunId: input.orchestratorRunId, capabilityRunId, coverage: await getLatestCoverageRun(input.projectId) }
    }

    const specialists = await resolveSpecialists()
    const supervisor = await runNativeSpecialistSupervisor({
      projectId: input.projectId,
      actorUserId: String(run.actor_user_id),
      goal: input.goal,
      workers: [
        { workerId: 'steward', agentDefinitionId: specialists.get('steward_agent')!, question: 'Assess stewardship, classification and governance evidence for this goal.' },
        { workerId: 'analyst', agentDefinitionId: specialists.get('governance_analyst_agent')!, question: 'Evaluate governance policies, controls, risks and certification evidence.', dependsOn: ['steward'] },
        { workerId: 'architect', agentDefinitionId: specialists.get('architect_agent')!, question: 'Evaluate schema, lineage, contract and architecture evidence.', dependsOn: ['analyst'] },
        { workerId: 'executive', agentDefinitionId: specialists.get('executive_agent')!, question: 'Summarize governance scorecard and executive risk evidence.', dependsOn: ['analyst'] },
        { workerId: 'investigator', agentDefinitionId: specialists.get('investigator_agent')!, question: 'Investigate anomalies, incidents, profile history and remediation evidence.', dependsOn: ['architect'] },
        { workerId: 'support', agentDefinitionId: specialists.get('support_agent')!, question: 'Validate operational support, recovery and observability evidence.', dependsOn: ['investigator'] },
      ],
    })
    const status = supervisor.status === 'SUCCEEDED' ? 'SUCCEEDED' : supervisor.status === 'WAITING_APPROVAL' ? 'WAITING_APPROVAL' : 'FAILED'
    await admin.schema('governance').from('governance_orchestrator_runs').update({
      supervisor_run_id: supervisor.supervisorRunId,
      status,
      completed_at: status === 'WAITING_APPROVAL' ? null : new Date().toISOString(),
      decision_trace: {
        ...trace,
        approval_request_id: input.approvalRequestId,
        approval_decision: 'APPROVED',
        approval_reviewed_by: input.reviewerUserId,
        resumed_exact_run: true,
        capability_run_id: capabilityRunId,
        dataset_version_count: datasetVersionIds.length,
        supervisor_status: supervisor.status,
        plan_hash: supervisor.planHash,
        child_run_ids: supervisor.childRunIds,
        certification_authority: 'governance.ai_capability_e2e_runs',
        self_certification: false,
      },
    }).eq('id', input.orchestratorRunId)
    return {
      status: supervisor.status,
      orchestratorRunId: input.orchestratorRunId,
      capabilityRunId,
      supervisorRunId: supervisor.supervisorRunId,
      childRunIds: supervisor.childRunIds,
      planHash: supervisor.planHash,
      coverage: await getLatestCoverageRun(input.projectId),
    }
  } catch (error) {
    await admin.schema('governance').from('governance_orchestrator_runs').update({
      status: 'FAILED', completed_at: new Date().toISOString(),
      decision_trace: { ...trace, approval_request_id: input.approvalRequestId, approval_decision: 'APPROVED', resumed_exact_run: true, error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown approval resume failure.' },
    }).eq('id', input.orchestratorRunId).eq('status', 'RUNNING')
    throw error
  }
}
