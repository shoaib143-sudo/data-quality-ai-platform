export type CapabilityOutcome = 'EXECUTED_AND_PASSED' | 'EXECUTED_AND_FAILED' | 'BLOCKED_POLICY' | 'BLOCKED_EXTERNAL' | 'NOT_APPLICABLE' | 'NOT_MEASURED'
export type AutonomyMode = 'OFF' | 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'
export type RiskTier = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type CapabilityDescriptor = {
  capabilityKey: string
  domain: string
  version: string
  mandatoryForE2E: boolean
  executorType: 'AGENT' | 'TOOL' | 'WORKFLOW' | 'MODEL' | 'RETRIEVAL' | 'CERTIFIER'
  executorKey: string
  requiredCapability: string | null
  riskTier: RiskTier
  dependencies: string[]
  evidenceContract: string[]
  certificationGate: string | null
  enabled: boolean
}

export type CapabilityResult = {
  capabilityKey: string
  outcome: CapabilityOutcome
  evidenceRefs: string[]
  reason: string | null
}

export type AutonomyPolicy = {
  mode: AutonomyMode
  enabled: boolean
  policyVersion: string
  maximumRiskTier: RiskTier
  allowedAgentKeys: string[]
  allowedToolKeys: string[]
  allowedModelClasses: string[]
  allowedMutationClasses: string[]
  approvalRequiredActions: string[]
  autoRemediationEnabled: boolean
  autoRollbackEnabled: boolean
  maxExecutionBudget: number
  maxModelBudget: number
  maxRuntimeMs: number
  maxDatasetsChangedPerRun: number
  maxProjectsAffectedPerRun: number
  maxRemediationActionsPerHour: number
  maxConcurrentModelCalls: number
  emergencyStop: boolean
}

const riskRank: Record<RiskTier, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }

export function evaluateAutonomyPolicy(policy: AutonomyPolicy, input: {
  riskTier: RiskTier
  actionKey: string
  agentKey?: string
  toolKey?: string
  modelClass?: string
  mutationClass?: string
  estimatedExecutionCost?: number
  estimatedModelCost?: number
}) {
  if (!policy.enabled || policy.mode === 'OFF') return { allowed: false, requiresApproval: false, reason: 'Autonomy is disabled.' }
  if (policy.emergencyStop) return { allowed: false, requiresApproval: false, reason: 'Emergency stop is active.' }
  if (riskRank[input.riskTier] > riskRank[policy.maximumRiskTier]) return { allowed: false, requiresApproval: false, reason: 'Risk tier exceeds policy maximum.' }
  if ((input.estimatedExecutionCost ?? 0) > policy.maxExecutionBudget) return { allowed: false, requiresApproval: false, reason: 'Execution budget exceeded.' }
  if ((input.estimatedModelCost ?? 0) > policy.maxModelBudget) return { allowed: false, requiresApproval: false, reason: 'Model budget exceeded.' }
  if (input.agentKey && !policy.allowedAgentKeys.includes(input.agentKey)) return { allowed: false, requiresApproval: false, reason: 'Agent is not permitted.' }
  if (input.toolKey && !policy.allowedToolKeys.includes(input.toolKey)) return { allowed: false, requiresApproval: false, reason: 'Tool is not permitted.' }
  if (input.modelClass && !policy.allowedModelClasses.includes(input.modelClass)) return { allowed: false, requiresApproval: false, reason: 'Model class is not permitted.' }
  if (input.mutationClass && !policy.allowedMutationClasses.includes(input.mutationClass)) return { allowed: false, requiresApproval: false, reason: 'Mutation class is not permitted.' }
  const requiresApproval = policy.mode === 'GUIDED' || policy.approvalRequiredActions.includes(input.actionKey)
  return { allowed: true, requiresApproval, reason: requiresApproval ? 'Action is permitted but requires approval.' : 'Action is permitted by active autonomy policy.' }
}

export function validateBlastRadius(policy: AutonomyPolicy, input: { datasetsChanged: number; projectsAffected: number; remediationActionsThisHour: number }) {
  const failures: string[] = []
  if (input.datasetsChanged > policy.maxDatasetsChangedPerRun) failures.push('Dataset blast-radius limit exceeded.')
  if (input.projectsAffected > policy.maxProjectsAffectedPerRun) failures.push('Project blast-radius limit exceeded.')
  if (input.remediationActionsThisHour > policy.maxRemediationActionsPerHour) failures.push('Remediation rate limit exceeded.')
  return failures
}

export function validateCapabilityPlan(descriptors: CapabilityDescriptor[]) {
  const failures: string[] = []
  const keys = new Set(descriptors.map(row => row.capabilityKey))
  if (keys.size !== descriptors.length) failures.push('Capability keys must be unique.')
  for (const row of descriptors) {
    for (const dependency of row.dependencies) {
      if (!keys.has(dependency)) failures.push(`${row.capabilityKey}: unknown dependency ${dependency}.`)
      if (dependency === row.capabilityKey) failures.push(`${row.capabilityKey}: capability cannot depend on itself.`)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byKey = new Map(descriptors.map(row => [row.capabilityKey, row]))
  const visit = (key: string) => {
    if (visited.has(key)) return
    if (visiting.has(key)) { failures.push(`Capability dependency cycle detected at ${key}.`); return }
    visiting.add(key)
    for (const dep of byKey.get(key)?.dependencies ?? []) visit(dep)
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of keys) visit(key)
  return [...new Set(failures)]
}

export function summarizeCapabilityCoverage(descriptors: CapabilityDescriptor[], results: CapabilityResult[]) {
  const required = descriptors.filter(row => row.enabled && row.mandatoryForE2E)
  const requiredKeys = new Set(required.map(row => row.capabilityKey))
  const matching = results.filter(row => requiredKeys.has(row.capabilityKey))
  const duplicateResults = matching.length - new Set(matching.map(row => row.capabilityKey)).size
  const byKey = new Map(matching.map(row => [row.capabilityKey, row]))
  const values = [...byKey.values()]
  const passed = values.filter(row => row.outcome === 'EXECUTED_AND_PASSED').length
  const failed = values.filter(row => row.outcome === 'EXECUTED_AND_FAILED').length
  const blocked = values.filter(row => row.outcome === 'BLOCKED_POLICY' || row.outcome === 'BLOCKED_EXTERNAL').length
  const notMeasured = values.filter(row => row.outcome === 'NOT_MEASURED').length
  const mandatory = required.length
  const accounted = byKey.size
  const executed = passed + failed
  return {
    mandatory, accounted, executed, passed, failed, blocked, notMeasured,
    unaccounted: Math.max(0, mandatory - accounted),
    duplicateResults,
    accountingCoveragePct: mandatory === 0 ? 100 : accounted / mandatory * 100,
    executionCoveragePct: mandatory === 0 ? 100 : executed / mandatory * 100,
    certificationCoveragePct: mandatory === 0 ? 100 : passed / mandatory * 100,
    certificationEligible: duplicateResults === 0 && mandatory === accounted && passed === mandatory && failed === 0 && blocked === 0 && notMeasured === 0,
  }
}

export const mandatoryAiGovernanceCapabilities: CapabilityDescriptor[] = [
  ['ai.agent.execution','AI_AGENTS','AGENT','native_supervisor_agent',['agent_run','agent_run_steps']],
  ['ai.agent.delegation','AI_AGENTS','AGENT','native_supervisor_agent',['parent_run_id','correlation_id']],
  ['ai.conversation.governed','AI_AGENTS','AGENT','governance_specialist_agent',['authorization_decision','response_evidence']],
  ['ai.recommendation.governed','AI_AGENTS','AGENT','governance_specialist_agent',['recommendation','evidence_refs']],
  ['ai.tool.execution','AI_AGENTS','TOOL','governance_specialist_investigate',['tool_key','tool_result']],
  ['ai.retrieval.authorized','RETRIEVAL','RETRIEVAL','governed_retrieval',['retrieval_scope','source_refs']],
  ['ai.rag.grounded','RETRIEVAL','RETRIEVAL','governed_rag',['context_refs','grounded_answer']],
  ['ai.grounding.citations','EVALUATION','CERTIFIER','grounding_evaluator',['citation_refs']],
  ['ai.model.routing','MODEL_RUNTIME','MODEL','model_gateway',['model_policy','selected_model']],
  ['ai.provider.fallback','MODEL_RUNTIME','MODEL','provider_fallback',['fallback_reason','provider_attempts']],
  ['ai.budget.enforcement','MODEL_RUNTIME','CERTIFIER','budget_enforcement',['budget_snapshot','usage']],
  ['ai.prompt.governance','SECURITY','CERTIFIER','prompt_governance',['prompt_version']],
  ['ai.output.structured','EVALUATION','CERTIFIER','structured_output',['schema_validation']],
  ['ai.evaluation.independent','EVALUATION','CERTIFIER','evaluation_engine',['evaluation_result']],
  ['ai.redteam.controls','SECURITY','CERTIFIER','red_team_assurance',['adversarial_case','control_result']],
  ['ai.approval.boundary','GOVERNANCE','CERTIFIER','approval_boundary',['approval_decision']],
  ['ai.recovery.controlled','RECOVERY','WORKFLOW','execution_recovery',['failure_class','recovery_action']],
  ['ai.observability.decision_trace','OBSERVABILITY','CERTIFIER','decision_trace',['decision_trace']],
  ['ai.audit.complete','CERTIFICATION','CERTIFIER','audit_evidence',['audit_event_refs']],
].map(([capabilityKey, domain, executorType, executorKey, evidenceContract]) => ({
  capabilityKey: capabilityKey as string,
  domain: domain as string,
  version: '1.0',
  mandatoryForE2E: true,
  executorType: executorType as CapabilityDescriptor['executorType'],
  executorKey: executorKey as string,
  requiredCapability: 'agent.execute',
  riskTier: 'LOW' as RiskTier,
  dependencies: [],
  evidenceContract: evidenceContract as string[],
  certificationGate: 'independent-evidence',
  enabled: true,
}))
