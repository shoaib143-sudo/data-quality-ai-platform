export type CommandCenterSeverity = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

export type CommandCenterFindingCode =
  | 'AI_SYSTEM_NOT_APPROVED'
  | 'AI_SYSTEM_CURRENT_VERSION_NO_APPROVAL'
  | 'AI_SYSTEM_ACTIVE_WITHOUT_APPROVAL'
  | 'AI_TELEMETRY_ERROR'
  | 'AUTO_POLICY_ENABLED'
  | 'AUTO_POLICY_NOT_REVIEWED'
  | 'AUTO_POLICY_NOT_REVERSIBLE'
  | 'AUTO_POLICY_HIGH_RISK'
  | 'APPROVAL_POLICY_ENABLED'
  | 'BLOCKED_POLICY'
  | 'ACTION_PENDING_APPROVAL'
  | 'ACTION_FAILED'
  | 'ACTION_ROLLED_BACK'

export type AiSystemControlRow = {
  id: string
  project_id: string
  system_key: string
  name: string
  system_type: string
  lifecycle_status: string
  current_version_id: string | null
}

export type AiSystemVersionControlRow = {
  id: string
  project_id: string
  ai_system_id: string
  version_number: number
  provider: string | null
  model_name: string | null
  external_version: string | null
  intended_use: string
  risk_tier: string
  data_categories: unknown
  human_oversight: string
  limitations: string
  semantic_hash: string
  created_at: string
}

export type AiSystemDecisionControlRow = {
  id: string
  project_id: string
  ai_system_id: string
  version_id: string
  decision: 'APPROVED' | 'REJECTED' | 'REVOKED'
  reviewer_user_id: string
  reviewer_capability: string
  review_note: string
  created_at: string
}

export type AiSystemAssessmentControlRow = {
  id: string
  project_id: string
  ai_system_id: string
  version_id: string
  assessment_type: string
  result: 'PASS' | 'FAIL' | 'PARTIAL' | 'NOT_ASSESSED'
  assessor_type: 'HUMAN' | 'SYSTEM' | 'AGENT'
  assessor_user_id: string | null
  source_agent_run_id: string | null
  evidence: Record<string, unknown>
  note: string | null
  created_at: string
}

export type AiEvaluationControlRow = {
  id: string
  project_id: string
  evaluation_type: string
  capability: string | null
  metric_name: string
  score: number | string | null
  pass: boolean | null
  evaluator_type: string
  evaluator_version: string | null
  ai_system_id: string | null
  ai_system_version_id: string | null
  agent_run_id: string | null
  source_agent_evaluation_id: string | null
  telemetry_event_id: string | null
  correlation_id: string | null
  evidence_refs: unknown[]
  dimensions: Record<string, unknown>
  metadata: Record<string, unknown>
  observed_at: string
  created_at: string
}

export type AiTelemetryControlRow = {
  id: string
  project_id: string
  event_type: string
  operation: string
  status: 'INFO' | 'SUCCESS' | 'ERROR'
  provider_id: string | null
  model_name: string | null
  agent_run_id: string | null
  ai_system_id: string | null
  ai_system_version_id: string | null
  correlation_id: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | string | null
  observed_at: string
}

export type RoutingPolicyControlRow = {
  id: string
  project_id: string
  task: string
  sensitivity: string
  risk: string
  enabled: boolean
  allowed_ai_system_ids: string[]
  min_evaluation_score: number | string | null
  min_scored_count: number
  allow_environment_fallback: boolean
  reviewer_user_id: string
  reviewer_capability: string
  review_note: string
  created_at: string
}

export type AutonomyPolicyControlRow = {
  id: string
  project_id: string
  action_key: string
  enabled: boolean
  execution_mode: string
  min_confidence: number | string
  max_auto_risk_level: string
  reversible: boolean
  authority_status: string
  reviewed_by: string | null
  reviewed_at: string | null
  current_version_id: string | null
}

export type AutonomyActionControlRow = {
  id: string
  project_id: string
  action_key: string
  risk_level: string
  confidence: number | string
  status: string
  approval_workflow_instance_id: string | null
  policy_version_id: string
  created_at: string
  executed_at: string | null
  rolled_back_at: string | null
}

export type CommandCenterFinding = {
  code: CommandCenterFindingCode
  severity: CommandCenterSeverity
  source:
    | 'governance.ai_systems'
    | 'governance.ai_system_decisions'
    | 'governance.ai_telemetry_events'
    | 'governance.autonomy_policies'
    | 'governance.autonomy_actions'
  recordId: string
  message: string
}

export type CommandCenterState = {
  projectId: string
  aiSystems: AiSystemControlRow[]
  aiSystemVersions: AiSystemVersionControlRow[]
  aiSystemDecisions: AiSystemDecisionControlRow[]
  aiSystemAssessments: AiSystemAssessmentControlRow[]
  aiEvaluationResults: AiEvaluationControlRow[]
  aiTelemetryEvents: AiTelemetryControlRow[]
  routingPolicies: RoutingPolicyControlRow[]
  autonomyPolicies: AutonomyPolicyControlRow[]
  autonomyActions: AutonomyActionControlRow[]
  findings: CommandCenterFinding[]
  controls: {
    autonomyExpansionAllowed: false
    directMutationEnabled: false
    emergencyKillMutationEnabled: false
    policyMutationEnabled: false
  }
  counts: {
    aiSystems: number
    aiSystemVersions: number
    aiSystemDecisions: number
    aiSystemAssessments: number
    aiEvaluationResults: number
    aiEvaluationPasses: number
    aiEvaluationFailures: number
    aiEvaluationUnresolved: number
    aiTelemetryEvents: number
    aiTelemetryErrors: number
    routingPolicyVersions: number
    enabledRoutingPolicyVersions: number
    enabledAutoPolicies: number
    enabledApprovalPolicies: number
    blockedPolicies: number
    openActions: number
    highOrCriticalFindings: number
  }
}

export type CommandCenterPersistence = {
  listAiSystems(projectId: string): Promise<AiSystemControlRow[]>
  listAiSystemVersions(projectId: string): Promise<AiSystemVersionControlRow[]>
  listAiSystemDecisions(projectId: string): Promise<AiSystemDecisionControlRow[]>
  listAiSystemAssessments(projectId: string): Promise<AiSystemAssessmentControlRow[]>
  listAiEvaluationResults(projectId: string): Promise<AiEvaluationControlRow[]>
  listAiTelemetryEvents(projectId: string): Promise<AiTelemetryControlRow[]>
  listRoutingPolicies(projectId: string): Promise<RoutingPolicyControlRow[]>
  listAutonomyPolicies(projectId: string): Promise<AutonomyPolicyControlRow[]>
  listAutonomyActions(projectId: string): Promise<AutonomyActionControlRow[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function numeric(value: number | string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isHighRisk(value: string) {
  return value === 'HIGH' || value === 'CRITICAL'
}

export class GovernedCommandCenterState {
  private readonly persistence: CommandCenterPersistence

  constructor(persistence: CommandCenterPersistence) {
    this.persistence = persistence
  }

  async read(projectIdInput: string): Promise<CommandCenterState> {
    const projectId = requiredText(projectIdInput, 'projectId')
    const [systemsRaw, versionsRaw, decisionsRaw, assessmentsRaw, evaluationsRaw, telemetryRaw, routingPoliciesRaw, policiesRaw, actionsRaw] = await Promise.all([
      this.persistence.listAiSystems(projectId),
      this.persistence.listAiSystemVersions(projectId),
      this.persistence.listAiSystemDecisions(projectId),
      this.persistence.listAiSystemAssessments(projectId),
      this.persistence.listAiEvaluationResults(projectId),
      this.persistence.listAiTelemetryEvents(projectId),
      this.persistence.listRoutingPolicies(projectId),
      this.persistence.listAutonomyPolicies(projectId),
      this.persistence.listAutonomyActions(projectId),
    ])

    const aiSystems = systemsRaw.filter((row) => row.project_id === projectId)
    const aiSystemVersions = versionsRaw.filter((row) => row.project_id === projectId)
    const aiSystemDecisions = decisionsRaw.filter((row) => row.project_id === projectId)
    const aiSystemAssessments = assessmentsRaw.filter((row) => row.project_id === projectId)
    const aiEvaluationResults = evaluationsRaw.filter((row) => row.project_id === projectId)
    const aiTelemetryEvents = telemetryRaw.filter((row) => row.project_id === projectId)
    const routingPolicies = routingPoliciesRaw.filter((row) => row.project_id === projectId)
    const autonomyPolicies = policiesRaw.filter((row) => row.project_id === projectId)
    const autonomyActions = actionsRaw.filter((row) => row.project_id === projectId)
    const findings: CommandCenterFinding[] = []

    const latestDecisionByVersion = new Map<string, AiSystemDecisionControlRow>()
    for (const decision of [...aiSystemDecisions].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      if (!latestDecisionByVersion.has(decision.version_id)) latestDecisionByVersion.set(decision.version_id, decision)
    }

    for (const system of aiSystems) {
      if (system.lifecycle_status !== 'ACTIVE') {
        findings.push({ code: 'AI_SYSTEM_NOT_APPROVED', severity: 'WARN', source: 'governance.ai_systems', recordId: system.id, message: `AI system ${system.system_key} is ${system.lifecycle_status}; only an ACTIVE current version has deployment authority.` })
      }
      const currentDecision = system.current_version_id ? latestDecisionByVersion.get(system.current_version_id) : undefined
      if (!currentDecision || currentDecision.decision !== 'APPROVED') {
        findings.push({ code: 'AI_SYSTEM_CURRENT_VERSION_NO_APPROVAL', severity: system.lifecycle_status === 'ACTIVE' ? 'CRITICAL' : 'WARN', source: 'governance.ai_system_decisions', recordId: system.id, message: `AI system ${system.system_key} has no recorded APPROVED human decision for its exact current version.` })
      }
      if (system.lifecycle_status === 'ACTIVE' && (!currentDecision || currentDecision.decision !== 'APPROVED')) {
        findings.push({ code: 'AI_SYSTEM_ACTIVE_WITHOUT_APPROVAL', severity: 'CRITICAL', source: 'governance.ai_systems', recordId: system.id, message: `AI system ${system.system_key} is ACTIVE without an APPROVED decision on its exact current version.` })
      }
    }

    for (const telemetry of aiTelemetryEvents) {
      if (telemetry.status === 'ERROR') {
        findings.push({ code: 'AI_TELEMETRY_ERROR', severity: 'HIGH', source: 'governance.ai_telemetry_events', recordId: telemetry.id, message: `AI telemetry recorded ERROR for ${telemetry.operation} (${telemetry.event_type}).` })
      }
    }

    for (const policy of autonomyPolicies) {
      if (!policy.enabled || policy.execution_mode === 'BLOCKED') {
        findings.push({ code: 'BLOCKED_POLICY', severity: 'INFO', source: 'governance.autonomy_policies', recordId: policy.id, message: `Autonomy policy ${policy.action_key} is blocked or disabled.` })
        continue
      }
      if (policy.execution_mode === 'APPROVAL_REQUIRED') {
        findings.push({ code: 'APPROVAL_POLICY_ENABLED', severity: 'INFO', source: 'governance.autonomy_policies', recordId: policy.id, message: `Autonomy policy ${policy.action_key} requires approval before execution.` })
      }
      if (policy.execution_mode === 'AUTO') {
        findings.push({ code: 'AUTO_POLICY_ENABLED', severity: 'HIGH', source: 'governance.autonomy_policies', recordId: policy.id, message: `Autonomy policy ${policy.action_key} permits automatic execution.` })
        if (policy.authority_status !== 'APPROVED' || !policy.reviewed_by || !policy.reviewed_at) findings.push({ code: 'AUTO_POLICY_NOT_REVIEWED', severity: 'CRITICAL', source: 'governance.autonomy_policies', recordId: policy.id, message: `Automatic policy ${policy.action_key} lacks recorded approved authority review.` })
        if (!policy.reversible) findings.push({ code: 'AUTO_POLICY_NOT_REVERSIBLE', severity: 'CRITICAL', source: 'governance.autonomy_policies', recordId: policy.id, message: `Automatic policy ${policy.action_key} is not marked reversible.` })
        if (isHighRisk(policy.max_auto_risk_level)) findings.push({ code: 'AUTO_POLICY_HIGH_RISK', severity: 'CRITICAL', source: 'governance.autonomy_policies', recordId: policy.id, message: `Automatic policy ${policy.action_key} allows ${policy.max_auto_risk_level} risk.` })
      }
    }

    for (const action of autonomyActions) {
      if (action.status === 'PENDING_APPROVAL' || (action.approval_workflow_instance_id && !action.executed_at)) findings.push({ code: 'ACTION_PENDING_APPROVAL', severity: 'WARN', source: 'governance.autonomy_actions', recordId: action.id, message: `Autonomy action ${action.action_key} is awaiting approval or execution.` })
      if (action.status === 'FAILED') findings.push({ code: 'ACTION_FAILED', severity: isHighRisk(action.risk_level) ? 'CRITICAL' : 'HIGH', source: 'governance.autonomy_actions', recordId: action.id, message: `Autonomy action ${action.action_key} failed at confidence ${numeric(action.confidence)}.` })
      if (action.status === 'ROLLED_BACK' || action.rolled_back_at) findings.push({ code: 'ACTION_ROLLED_BACK', severity: 'HIGH', source: 'governance.autonomy_actions', recordId: action.id, message: `Autonomy action ${action.action_key} was rolled back.` })
    }

    const enabledAutoPolicies = autonomyPolicies.filter((row) => row.enabled && row.execution_mode === 'AUTO').length
    const enabledApprovalPolicies = autonomyPolicies.filter((row) => row.enabled && row.execution_mode === 'APPROVAL_REQUIRED').length
    const blockedPolicies = autonomyPolicies.filter((row) => !row.enabled || row.execution_mode === 'BLOCKED').length
    const openActions = autonomyActions.filter((row) => !['EXECUTED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'].includes(row.status)).length
    const highOrCriticalFindings = findings.filter((finding) => finding.severity === 'HIGH' || finding.severity === 'CRITICAL').length

    return {
      projectId,
      aiSystems,
      aiSystemVersions,
      aiSystemDecisions,
      aiSystemAssessments,
      aiEvaluationResults,
      aiTelemetryEvents,
      routingPolicies,
      autonomyPolicies,
      autonomyActions,
      findings,
      controls: { autonomyExpansionAllowed: false, directMutationEnabled: false, emergencyKillMutationEnabled: false, policyMutationEnabled: false },
      counts: {
        aiSystems: aiSystems.length,
        aiSystemVersions: aiSystemVersions.length,
        aiSystemDecisions: aiSystemDecisions.length,
        aiSystemAssessments: aiSystemAssessments.length,
        aiEvaluationResults: aiEvaluationResults.length,
        aiEvaluationPasses: aiEvaluationResults.filter((row) => row.pass === true).length,
        aiEvaluationFailures: aiEvaluationResults.filter((row) => row.pass === false).length,
        aiEvaluationUnresolved: aiEvaluationResults.filter((row) => row.pass == null).length,
        aiTelemetryEvents: aiTelemetryEvents.length,
        aiTelemetryErrors: aiTelemetryEvents.filter((row) => row.status === 'ERROR').length,
        routingPolicyVersions: routingPolicies.length,
        enabledRoutingPolicyVersions: routingPolicies.filter((row) => row.enabled).length,
        enabledAutoPolicies,
        enabledApprovalPolicies,
        blockedPolicies,
        openActions,
        highOrCriticalFindings,
      },
    }
  }
}