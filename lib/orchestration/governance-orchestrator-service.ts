import { createAdminClient } from '@/lib/supabase/admin'
import { runNativeSpecialistSupervisor } from '@/lib/agents/runtime/native-supervisor-service'
import {
  evaluateAutonomyPolicy,
  mandatoryAiGovernanceCapabilities,
  summarizeCapabilityCoverage,
  validateBlastRadius,
  validateCapabilityPlan,
  type AutonomyPolicy,
  type CapabilityDescriptor,
  type CapabilityResult,
} from '@/lib/orchestration/governance-orchestrator'

const SPECIALIST_KEYS = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
] as const

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

function runtimeCapabilityDescriptors(): CapabilityDescriptor[] {
  return SPECIALIST_KEYS.map((key, index) => ({
    capabilityKey: `governance.specialist.${key}`,
    domain: 'GOVERNANCE',
    version: '1.0',
    mandatoryForE2E: true,
    executorType: 'AGENT',
    executorKey: key,
    requiredCapability: 'agent.execute',
    riskTier: 'LOW',
    dependencies: index === 0 ? [] : index === 1 ? ['governance.specialist.steward_agent'] : [],
    evidenceContract: ['agent_run', 'agent_run_steps'],
    certificationGate: 'canonical-agent-evidence',
    enabled: true,
  }))
}

async function persistCoverageRun(input: {
  projectId: string
  actorUserId: string
  policy: AutonomyPolicy
  descriptors: CapabilityDescriptor[]
  results: CapabilityResult[]
  supervisorRunId?: string | null
}) {
  const admin = createAdminClient()
  const summary = summarizeCapabilityCoverage(input.descriptors, input.results)
  const { data: run, error } = await admin.schema('orchestration').from('coverage_runs').insert({
    project_id: input.projectId,
    actor_user_id: input.actorUserId,
    policy_version: input.policy.policyVersion,
    mode: input.policy.mode,
    supervisor_run_id: input.supervisorRunId ?? null,
    mandatory_count: summary.mandatory,
    accounted_count: summary.accounted,
    executed_count: summary.executed,
    passed_count: summary.passed,
    failed_count: summary.failed,
    blocked_count: summary.blocked,
    not_measured_count: summary.notMeasured,
    accounting_coverage_pct: summary.accountingCoveragePct,
    execution_coverage_pct: summary.executionCoveragePct,
    certification_coverage_pct: summary.certificationCoveragePct,
    certification_eligible: summary.certificationEligible,
    status: summary.certificationEligible ? 'CERTIFIABLE' : 'INCOMPLETE',
  }).select('id').single()
  if (error || !run) throw new Error(`Unable to persist coverage run: ${error?.message ?? 'unknown error'}`)

  const resultByKey = new Map(input.results.map(row => [row.capabilityKey, row]))
  const rows = input.descriptors.map(descriptor => {
    const result = resultByKey.get(descriptor.capabilityKey)
    return {
      coverage_run_id: run.id,
      capability_key: descriptor.capabilityKey,
      mandatory_for_e2e: descriptor.mandatoryForE2E,
      outcome: result?.outcome ?? null,
      evidence_refs: result?.evidenceRefs ?? [],
      reason: result?.reason ?? 'No capability result was produced.',
    }
  })
  const { error: detailError } = await admin.schema('orchestration').from('coverage_run_capabilities').insert(rows)
  if (detailError) throw new Error(`Unable to persist capability coverage evidence: ${detailError.message}`)
  return { coverageRunId: String(run.id), summary }
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
  const descriptors = [...runtimeCapabilityDescriptors(), ...mandatoryAiGovernanceCapabilities]
  const planFailures = validateCapabilityPlan(descriptors)
  if (planFailures.length) throw new Error(`Governance orchestrator plan is invalid: ${planFailures.join(' ')}`)
  const blastRadiusFailures = validateBlastRadius(policy, { datasetsChanged: 0, projectsAffected: 1, remediationActionsThisHour: 0 })
  if (blastRadiusFailures.length) throw new Error(blastRadiusFailures.join(' '))

  if (!decision.allowed) {
    const results = descriptors.map(row => ({ capabilityKey: row.capabilityKey, outcome: 'BLOCKED_POLICY' as const, evidenceRefs: [], reason: decision.reason }))
    const persisted = await persistCoverageRun({ ...input, policy, descriptors, results })
    return { status: 'BLOCKED_POLICY' as const, policy, decision, ...persisted }
  }
  if (decision.requiresApproval) {
    const results = descriptors.map(row => ({ capabilityKey: row.capabilityKey, outcome: 'BLOCKED_POLICY' as const, evidenceRefs: [], reason: 'Approval is required before orchestrator dispatch.' }))
    const persisted = await persistCoverageRun({ ...input, policy, descriptors, results })
    return { status: 'WAITING_APPROVAL' as const, policy, decision, ...persisted }
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

  const specialistResults: CapabilityResult[] = SPECIALIST_KEYS.map((key, index) => ({
    capabilityKey: `governance.specialist.${key}`,
    outcome: supervisor.status === 'SUCCEEDED' ? 'EXECUTED_AND_PASSED' : 'EXECUTED_AND_FAILED',
    evidenceRefs: supervisor.childRunIds[index] ? [`agent_run:${supervisor.childRunIds[index]}`] : [],
    reason: supervisor.status === 'SUCCEEDED' ? null : `Native supervisor ended with ${supervisor.status}.`,
  }))

  // AI platform capabilities must be independently proven from canonical evidence.
  // The orchestrator deliberately does not self-certify them from its own claims.
  const aiResults: CapabilityResult[] = mandatoryAiGovernanceCapabilities.map(row => ({
    capabilityKey: row.capabilityKey,
    outcome: row.capabilityKey === 'ai.agent.execution' || row.capabilityKey === 'ai.agent.delegation'
      ? (supervisor.status === 'SUCCEEDED' ? 'EXECUTED_AND_PASSED' : 'EXECUTED_AND_FAILED')
      : 'NOT_MEASURED',
    evidenceRefs: row.capabilityKey === 'ai.agent.execution' || row.capabilityKey === 'ai.agent.delegation'
      ? [`supervisor_run:${supervisor.supervisorRunId}`, ...supervisor.childRunIds.map(id => `agent_run:${id}`)]
      : [],
    reason: row.capabilityKey === 'ai.agent.execution' || row.capabilityKey === 'ai.agent.delegation'
      ? null
      : 'Independent canonical evidence gate has not yet attached evidence for this capability.',
  }))

  const persisted = await persistCoverageRun({
    ...input,
    policy,
    descriptors,
    results: [...specialistResults, ...aiResults],
    supervisorRunId: supervisor.supervisorRunId,
  })

  return {
    status: supervisor.status,
    policy,
    decision,
    supervisorRunId: supervisor.supervisorRunId,
    childRunIds: supervisor.childRunIds,
    planHash: supervisor.planHash,
    ...persisted,
  }
}

export async function getLatestCoverageRun(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').from('coverage_runs')
    .select('*,coverage_run_capabilities(*)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Unable to load latest coverage run: ${error.message}`)
  return data
}
