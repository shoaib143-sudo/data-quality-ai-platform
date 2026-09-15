import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { runNativeSpecialistSupervisor } from '@/lib/agents/runtime/native-supervisor-service'
import {
  evaluateAutonomyPolicy,
  validateBlastRadius,
  type AutonomyPolicy,
} from '@/lib/orchestration/governance-orchestrator'

const SPECIALIST_KEYS = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
] as const

const REQUIRED_AUTONOMOUS_AGENTS = ['governance_orchestrator_agent', ...SPECIALIST_KEYS] as const
const CANONICAL_CAPABILITY_COUNT = 75

export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  mode: 'OFF',
  enabled: false,
  policyVersion: 'default-off-v1',
  maximumRiskTier: 'NONE',
  allowedAgentKeys: [],
  allowedToolKeys: [],
  allowedModelClasses: [],
  allowedMutationClasses: [],
  approvalRequiredActions: [],
  autoRemediationEnabled: false,
  autoRollbackEnabled: false,
  maxExecutionBudget: 0,
  maxModelBudget: 0,
  maxRuntimeMs: 300000,
  maxDatasetsChangedPerRun: 0,
  maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 0,
  maxConcurrentModelCalls: 0,
  emergencyStop: false,
}

export type CanonicalCapabilityResultRow = {
  capability_sr_no: number
  module: string
  capability: string
  execution_state: 'NOT_RUN' | 'EXECUTED' | 'BLOCKED' | 'FAILED'
  verification_state: 'UNKNOWN' | 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE'
  blocker_code: string | null
}

export function summarizeCanonicalCapabilityLedger(rows: CanonicalCapabilityResultRow[]) {
  const unique = new Set(rows.map(row => row.capability_sr_no))
  const accounted = unique.size
  const duplicateRows = rows.length - accounted
  const executed = rows.filter(row => row.execution_state === 'EXECUTED').length
  const blocked = rows.filter(row => row.execution_state === 'BLOCKED').length
  const failed = rows.filter(row => row.execution_state === 'FAILED').length
  const verified = rows.filter(row => row.verification_state === 'VERIFIED').length
  const verificationFailed = rows.filter(row => row.verification_state === 'FAILED').length
  const inconclusive = rows.filter(row => row.verification_state === 'INCONCLUSIVE').length
  const unaccounted = Math.max(0, CANONICAL_CAPABILITY_COUNT - accounted)
  return {
    mandatory: CANONICAL_CAPABILITY_COUNT,
    accounted,
    executed,
    verified,
    blocked,
    failed,
    verificationFailed,
    inconclusive,
    unaccounted,
    duplicateRows,
    accountingCoveragePct: accounted / CANONICAL_CAPABILITY_COUNT * 100,
    executionCoveragePct: executed / CANONICAL_CAPABILITY_COUNT * 100,
    certificationCoveragePct: verified / CANONICAL_CAPABILITY_COUNT * 100,
    certificationEligible:
      rows.length === CANONICAL_CAPABILITY_COUNT &&
      accounted === CANONICAL_CAPABILITY_COUNT &&
      duplicateRows === 0 &&
      executed === CANONICAL_CAPABILITY_COUNT &&
      verified === CANONICAL_CAPABILITY_COUNT &&
      blocked === 0 &&
      failed === 0 &&
      verificationFailed === 0 &&
      inconclusive === 0,
  }
}

function asPolicy(row: Record<string, unknown> | null): AutonomyPolicy {
  if (!row) return DEFAULT_AUTONOMY_POLICY
  return {
    mode: String(row.mode ?? 'OFF') as AutonomyPolicy['mode'],
    enabled: row.enabled === true,
    policyVersion: String(row.policy_version ?? 'unknown'),
    maximumRiskTier: String(row.maximum_risk_tier ?? 'NONE') as AutonomyPolicy['maximumRiskTier'],
    allowedAgentKeys: Array.isArray(row.allowed_agent_keys) ? row.allowed_agent_keys.map(String) : [],
    allowedToolKeys: Array.isArray(row.allowed_tool_keys) ? row.allowed_tool_keys.map(String) : [],
    allowedModelClasses: Array.isArray(row.allowed_model_classes) ? row.allowed_model_classes.map(String) : [],
    allowedMutationClasses: Array.isArray(row.allowed_mutation_classes) ? row.allowed_mutation_classes.map(String) : [],
    approvalRequiredActions: Array.isArray(row.approval_required_actions) ? row.approval_required_actions.map(String) : [],
    autoRemediationEnabled: row.auto_remediation_enabled === true,
    autoRollbackEnabled: row.auto_rollback_enabled === true,
    maxExecutionBudget: Number(row.max_execution_budget ?? 0),
    maxModelBudget: Number(row.max_model_budget ?? 0),
    maxRuntimeMs: Number(row.max_runtime_ms ?? 300000),
    maxDatasetsChangedPerRun: Number(row.max_datasets_changed_per_run ?? 0),
    maxProjectsAffectedPerRun: Number(row.max_projects_affected_per_run ?? 1),
    maxRemediationActionsPerHour: Number(row.max_remediation_actions_per_hour ?? 0),
    maxConcurrentModelCalls: Number(row.max_concurrent_model_calls ?? 0),
    emergencyStop: row.emergency_stop === true,
  }
}

export async function getProjectAutonomyPolicy(projectId: string): Promise<AutonomyPolicy> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('autonomy_policies')
    .select('*').eq('project_id', projectId).maybeSingle()
  if (error) throw new Error(`Unable to load autonomy policy: ${error.message}`)
  return asPolicy(data as Record<string, unknown> | null)
}

export async function upsertProjectAutonomyPolicy(projectId: string, actorUserId: string, policy: AutonomyPolicy) {
  const admin = createAdminClient()
  const row = {
    project_id: projectId,
    mode: policy.mode,
    enabled: policy.enabled,
    policy_version: policy.policyVersion,
    maximum_risk_tier: policy.maximumRiskTier,
    allowed_agent_keys: policy.allowedAgentKeys,
    allowed_tool_keys: policy.allowedToolKeys,
    allowed_model_classes: policy.allowedModelClasses,
    allowed_mutation_classes: policy.allowedMutationClasses,
    approval_required_actions: policy.approvalRequiredActions,
    auto_remediation_enabled: policy.autoRemediationEnabled,
    auto_rollback_enabled: policy.autoRollbackEnabled,
    max_execution_budget: policy.maxExecutionBudget,
    max_model_budget: policy.maxModelBudget,
    max_runtime_ms: policy.maxRuntimeMs,
    max_datasets_changed_per_run: policy.maxDatasetsChangedPerRun,
    max_projects_affected_per_run: policy.maxProjectsAffectedPerRun,
    max_remediation_actions_per_hour: policy.maxRemediationActionsPerHour,
    max_concurrent_model_calls: policy.maxConcurrentModelCalls,
    emergency_stop: policy.emergencyStop,
    updated_by: actorUserId,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.schema('orchestration').from('autonomy_policies').upsert(row, { onConflict: 'project_id' })
  if (error) throw new Error(`Unable to update autonomy policy: ${error.message}`)
}

async function resolveSpecialists() {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').from('agent_definitions')
    .select('id,agent_key,version,enabled')
    .in('agent_key', [...SPECIALIST_KEYS])
    .eq('version', '1.0')
    .eq('enabled', true)
  if (error) throw new Error(`Unable to resolve orchestrator specialists: ${error.message}`)
  const byKey = new Map((data ?? []).map(row => [String(row.agent_key), String(row.id)]))
  const missing = SPECIALIST_KEYS.filter(key => !byKey.has(key))
  if (missing.length) throw new Error(`Required orchestrator specialists are unavailable: ${missing.join(', ')}`)
  return byKey
}

function requiredAgentPolicyFailure(policy: AutonomyPolicy) {
  const missing = REQUIRED_AUTONOMOUS_AGENTS.filter(key => !policy.allowedAgentKeys.includes(key))
  return missing.length ? `Autonomy policy does not permit required agents: ${missing.join(', ')}.` : null
}

async function insertOrchestratorRun(input: {
  projectId: string
  actorUserId: string
  policy: AutonomyPolicy
  goal: string
  status: string
  decisionTrace: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const goalHash = createHash('sha256').update(input.goal).digest('hex')
  const { data, error } = await admin.schema('orchestration').from('governance_orchestrator_runs').insert({
    project_id: input.projectId,
    actor_user_id: input.actorUserId,
    policy_version: input.policy.policyVersion,
    mode: input.policy.mode,
    goal_hash: goalHash,
    status: input.status,
    decision_trace: input.decisionTrace,
    started_at: input.status === 'RUNNING' ? new Date().toISOString() : null,
    completed_at: ['BLOCKED_POLICY','WAITING_APPROVAL','BLOCKED_EXTERNAL','FAILED'].includes(input.status) ? new Date().toISOString() : null,
  }).select('id').single()
  if (error || !data) throw new Error(`Unable to create orchestrator run: ${error?.message ?? 'unknown error'}`)
  return String(data.id)
}

async function updateOrchestratorRun(orchestratorRunId: string, patch: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.schema('orchestration').from('governance_orchestrator_runs').update(patch).eq('id', orchestratorRunId)
  if (error) throw new Error(`Unable to update orchestrator run: ${error.message}`)
}

async function createCanonicalCapabilityRun(projectId: string, orchestratorRunId: string, policy: AutonomyPolicy) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('create_ai_capability_e2e_run', {
    p_project_id: projectId,
    p_metadata: {
      orchestrator_run_id: orchestratorRunId,
      policy_version: policy.policyVersion,
      autonomy_mode: policy.mode,
      source: 'datanexus_governance_orchestrator',
    },
  })
  if (error || !data) throw new Error(`Unable to create canonical AI capability run: ${error?.message ?? 'unknown error'}`)
  return String(data)
}

async function attachProjectDatasetVersions(projectId: string, capabilityRunId: string) {
  const admin = createAdminClient()
  const { data: datasets, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id').eq('project_id', projectId).eq('status', 'ACTIVE')
  if (datasetError) throw new Error(`Unable to resolve project datasets: ${datasetError.message}`)
  const datasetIds = (datasets ?? []).map(row => String(row.id))
  if (!datasetIds.length) return [] as string[]
  const { data: versions, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,version_number,status')
    .in('dataset_id', datasetIds)
    .eq('status', 'AVAILABLE')
    .order('version_number', { ascending: false })
  if (versionError) throw new Error(`Unable to resolve project dataset versions: ${versionError.message}`)

  const latestByDataset = new Map<string, string>()
  for (const row of versions ?? []) {
    const datasetId = String(row.dataset_id)
    if (!latestByDataset.has(datasetId)) latestByDataset.set(datasetId, String(row.id))
  }
  const versionIds = [...latestByDataset.values()]
  for (const datasetVersionId of versionIds) {
    const { error } = await admin.schema('governance').rpc('attach_ai_capability_e2e_dataset_version', {
      p_run_id: capabilityRunId,
      p_dataset_version_id: datasetVersionId,
    })
    if (error) throw new Error(`Unable to attach dataset version ${datasetVersionId}: ${error.message}`)
  }
  return versionIds
}

async function loadCanonicalCapabilityRows(capabilityRunId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('ai_capability_e2e_results')
    .select('capability_sr_no,module,capability,execution_state,verification_state,blocker_code')
    .eq('run_id', capabilityRunId)
    .order('capability_sr_no')
  if (error) throw new Error(`Unable to load canonical capability ledger: ${error.message}`)
  return (data ?? []) as CanonicalCapabilityResultRow[]
}

async function canonicalCoverage(capabilityRunId: string) {
  return summarizeCanonicalCapabilityLedger(await loadCanonicalCapabilityRows(capabilityRunId))
}

export async function runGovernanceOrchestrator(input: {
  projectId: string
  actorUserId: string
  goal: string
}) {
  const policy = await getProjectAutonomyPolicy(input.projectId)
  const decision = evaluateAutonomyPolicy(policy, {
    riskTier: 'LOW',
    actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
    agentKey: 'governance_orchestrator_agent',
    estimatedExecutionCost: 0,
    estimatedModelCost: 0,
  })
  const blastRadiusFailures = validateBlastRadius(policy, { datasetsChanged: 0, projectsAffected: 1, remediationActionsThisHour: 0 })
  const agentPolicyFailure = policy.mode === 'OFF' ? null : requiredAgentPolicyFailure(policy)
  const policyFailures = [
    ...(decision.allowed ? [] : [decision.reason]),
    ...blastRadiusFailures,
    ...(agentPolicyFailure ? [agentPolicyFailure] : []),
  ]

  if (policyFailures.length) {
    const orchestratorRunId = await insertOrchestratorRun({
      ...input,
      policy,
      status: 'BLOCKED_POLICY',
      decisionTrace: { decision, policy_failures: policyFailures },
    })
    return {
      status: 'BLOCKED_POLICY' as const,
      orchestratorRunId,
      policy,
      decision,
      policyFailures,
      summary: summarizeCanonicalCapabilityLedger([]),
    }
  }

  if (decision.requiresApproval) {
    const orchestratorRunId = await insertOrchestratorRun({
      ...input,
      policy,
      status: 'WAITING_APPROVAL',
      decisionTrace: { decision, reason: 'Approval is required before orchestrator dispatch.' },
    })
    return {
      status: 'WAITING_APPROVAL' as const,
      orchestratorRunId,
      policy,
      decision,
      summary: summarizeCanonicalCapabilityLedger([]),
    }
  }

  const orchestratorRunId = await insertOrchestratorRun({
    ...input,
    policy,
    status: 'RUNNING',
    decisionTrace: { decision, policy_version: policy.policyVersion, mode: policy.mode },
  })

  try {
    const capabilityRunId = await createCanonicalCapabilityRun(input.projectId, orchestratorRunId, policy)
    await updateOrchestratorRun(orchestratorRunId, { ai_capability_e2e_run_id: capabilityRunId })
    const datasetVersionIds = await attachProjectDatasetVersions(input.projectId, capabilityRunId)
    if (!datasetVersionIds.length) {
      await updateOrchestratorRun(orchestratorRunId, {
        status: 'BLOCKED_EXTERNAL',
        completed_at: new Date().toISOString(),
        decision_trace: {
          decision,
          blocker: 'No AVAILABLE dataset version exists for this project. Canonical certification requires at least one attached dataset version.',
        },
      })
      return {
        status: 'BLOCKED_EXTERNAL' as const,
        orchestratorRunId,
        capabilityRunId,
        policy,
        decision,
        summary: await canonicalCoverage(capabilityRunId),
      }
    }

    const specialists = await resolveSpecialists()
    const supervisor = await runNativeSpecialistSupervisor({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
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

    const finalStatus = supervisor.status === 'SUCCEEDED' ? 'SUCCEEDED' : supervisor.status === 'WAITING_APPROVAL' ? 'WAITING_APPROVAL' : 'FAILED'
    await updateOrchestratorRun(orchestratorRunId, {
      supervisor_run_id: supervisor.supervisorRunId,
      status: finalStatus,
      completed_at: finalStatus === 'WAITING_APPROVAL' ? null : new Date().toISOString(),
      decision_trace: {
        decision,
        capability_run_id: capabilityRunId,
        dataset_version_count: datasetVersionIds.length,
        supervisor_status: supervisor.status,
        plan_hash: supervisor.planHash,
        child_run_ids: supervisor.childRunIds,
        certification_authority: 'governance.ai_capability_e2e_runs',
        self_certification: false,
      },
    })

    return {
      status: supervisor.status,
      orchestratorRunId,
      capabilityRunId,
      policy,
      decision,
      supervisorRunId: supervisor.supervisorRunId,
      childRunIds: supervisor.childRunIds,
      planHash: supervisor.planHash,
      summary: await canonicalCoverage(capabilityRunId),
    }
  } catch (error) {
    await updateOrchestratorRun(orchestratorRunId, {
      status: 'FAILED',
      completed_at: new Date().toISOString(),
      decision_trace: {
        decision,
        error: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown orchestrator failure.',
      },
    }).catch(() => undefined)
    throw error
  }
}

export async function getLatestCoverageRun(projectId: string) {
  const admin = createAdminClient()
  const { data: orchestratorRun, error } = await admin.schema('orchestration').from('governance_orchestrator_runs')
    .select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`Unable to load latest orchestrator run: ${error.message}`)
  if (!orchestratorRun) return null
  const capabilityRunId = orchestratorRun.ai_capability_e2e_run_id ? String(orchestratorRun.ai_capability_e2e_run_id) : null
  const summary = capabilityRunId ? await canonicalCoverage(capabilityRunId) : summarizeCanonicalCapabilityLedger([])
  return { ...orchestratorRun, capabilityRunId, summary }
}

export async function finalizeGovernanceOrchestratorCertification(input: {
  projectId: string
  orchestratorRunId: string
}) {
  const admin = createAdminClient()
  const { data: row, error } = await admin.schema('orchestration').from('governance_orchestrator_runs')
    .select('id,project_id,ai_capability_e2e_run_id,status').eq('id', input.orchestratorRunId).eq('project_id', input.projectId).maybeSingle()
  if (error) throw new Error(`Unable to resolve orchestrator certification run: ${error.message}`)
  if (!row) throw new Error('Governance orchestrator run was not found.')
  if (!row.ai_capability_e2e_run_id) throw new Error('Governance orchestrator run has no canonical capability evidence run.')

  const capabilityRunId = String(row.ai_capability_e2e_run_id)
  const { data: finalized, error: finalizeError } = await admin.schema('governance').rpc('finalize_ai_capability_e2e_run', {
    p_run_id: capabilityRunId,
  })
  if (finalizeError) throw new Error(`Independent capability certification failed: ${finalizeError.message}`)
  const result = finalized as Record<string, unknown>
  const assessment = String(result.assessment_state ?? 'NOT_ASSESSED')
  const summary = await canonicalCoverage(capabilityRunId)

  await updateOrchestratorRun(input.orchestratorRunId, {
    status: assessment === 'PASS' ? 'SUCCEEDED' : 'FAILED',
    completed_at: new Date().toISOString(),
    decision_trace: {
      certification_authority: 'governance.finalize_ai_capability_e2e_run',
      assessment_state: assessment,
      self_certification: false,
    },
  })

  return { capabilityRunId, assessmentState: assessment, summary, canonical: result }
}
