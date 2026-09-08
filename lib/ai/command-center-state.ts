export type CommandCenterSeverity = 'INFO' | 'WARN' | 'HIGH' | 'CRITICAL'

export type CommandCenterFindingCode =
  | 'AI_SYSTEM_NOT_APPROVED'
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
  source: 'governance.ai_systems' | 'governance.autonomy_policies' | 'governance.autonomy_actions'
  recordId: string
  message: string
}

export type CommandCenterState = {
  projectId: string
  aiSystems: AiSystemControlRow[]
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
    enabledAutoPolicies: number
    enabledApprovalPolicies: number
    blockedPolicies: number
    openActions: number
    highOrCriticalFindings: number
  }
}

export type CommandCenterPersistence = {
  listAiSystems(projectId: string): Promise<AiSystemControlRow[]>
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
    const [aiSystemsRaw, autonomyPoliciesRaw, autonomyActionsRaw] = await Promise.all([
      this.persistence.listAiSystems(projectId),
      this.persistence.listAutonomyPolicies(projectId),
      this.persistence.listAutonomyActions(projectId),
    ])

    const aiSystems = aiSystemsRaw.filter((row) => row.project_id === projectId)
    const autonomyPolicies = autonomyPoliciesRaw.filter((row) => row.project_id === projectId)
    const autonomyActions = autonomyActionsRaw.filter((row) => row.project_id === projectId)
    const findings: CommandCenterFinding[] = []

    for (const system of aiSystems) {
      if (system.lifecycle_status !== 'APPROVED' && system.lifecycle_status !== 'ACTIVE') {
        findings.push({
          code: 'AI_SYSTEM_NOT_APPROVED',
          severity: 'WARN',
          source: 'governance.ai_systems',
          recordId: system.id,
          message: `AI system ${system.system_key} is ${system.lifecycle_status}, not approved for expanded autonomy.`,
        })
      }
    }

    for (const policy of autonomyPolicies) {
      if (!policy.enabled || policy.execution_mode === 'BLOCKED') {
        findings.push({
          code: 'BLOCKED_POLICY',
          severity: 'INFO',
          source: 'governance.autonomy_policies',
          recordId: policy.id,
          message: `Autonomy policy ${policy.action_key} is blocked or disabled.`,
        })
        continue
      }

      if (policy.execution_mode === 'APPROVAL_REQUIRED') {
        findings.push({
          code: 'APPROVAL_POLICY_ENABLED',
          severity: 'INFO',
          source: 'governance.autonomy_policies',
          recordId: policy.id,
          message: `Autonomy policy ${policy.action_key} requires approval before execution.`,
        })
      }

      if (policy.execution_mode === 'AUTO') {
        findings.push({
          code: 'AUTO_POLICY_ENABLED',
          severity: 'HIGH',
          source: 'governance.autonomy_policies',
          recordId: policy.id,
          message: `Autonomy policy ${policy.action_key} permits automatic execution.`,
        })
        if (policy.authority_status !== 'APPROVED' || !policy.reviewed_by || !policy.reviewed_at) {
          findings.push({
            code: 'AUTO_POLICY_NOT_REVIEWED',
            severity: 'CRITICAL',
            source: 'governance.autonomy_policies',
            recordId: policy.id,
            message: `Automatic policy ${policy.action_key} lacks recorded approved authority review.`,
          })
        }
        if (!policy.reversible) {
          findings.push({
            code: 'AUTO_POLICY_NOT_REVERSIBLE',
            severity: 'CRITICAL',
            source: 'governance.autonomy_policies',
            recordId: policy.id,
            message: `Automatic policy ${policy.action_key} is not marked reversible.`,
          })
        }
        if (isHighRisk(policy.max_auto_risk_level)) {
          findings.push({
            code: 'AUTO_POLICY_HIGH_RISK',
            severity: 'CRITICAL',
            source: 'governance.autonomy_policies',
            recordId: policy.id,
            message: `Automatic policy ${policy.action_key} allows ${policy.max_auto_risk_level} risk.`,
          })
        }
      }
    }

    for (const action of autonomyActions) {
      if (action.status === 'PENDING_APPROVAL' || (action.approval_workflow_instance_id && !action.executed_at)) {
        findings.push({
          code: 'ACTION_PENDING_APPROVAL',
          severity: 'WARN',
          source: 'governance.autonomy_actions',
          recordId: action.id,
          message: `Autonomy action ${action.action_key} is awaiting approval or execution.`,
        })
      }
      if (action.status === 'FAILED') {
        findings.push({
          code: 'ACTION_FAILED',
          severity: isHighRisk(action.risk_level) ? 'CRITICAL' : 'HIGH',
          source: 'governance.autonomy_actions',
          recordId: action.id,
          message: `Autonomy action ${action.action_key} failed at confidence ${numeric(action.confidence)}.`,
        })
      }
      if (action.status === 'ROLLED_BACK' || action.rolled_back_at) {
        findings.push({
          code: 'ACTION_ROLLED_BACK',
          severity: 'HIGH',
          source: 'governance.autonomy_actions',
          recordId: action.id,
          message: `Autonomy action ${action.action_key} was rolled back.`,
        })
      }
    }

    const enabledAutoPolicies = autonomyPolicies.filter((row) => row.enabled && row.execution_mode === 'AUTO').length
    const enabledApprovalPolicies = autonomyPolicies.filter((row) => row.enabled && row.execution_mode === 'APPROVAL_REQUIRED').length
    const blockedPolicies = autonomyPolicies.filter((row) => !row.enabled || row.execution_mode === 'BLOCKED').length
    const openActions = autonomyActions.filter((row) => !['EXECUTED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'].includes(row.status)).length
    const highOrCriticalFindings = findings.filter((finding) => finding.severity === 'HIGH' || finding.severity === 'CRITICAL').length

    return {
      projectId,
      aiSystems,
      autonomyPolicies,
      autonomyActions,
      findings,
      controls: {
        autonomyExpansionAllowed: false,
        directMutationEnabled: false,
        emergencyKillMutationEnabled: false,
        policyMutationEnabled: false,
      },
      counts: {
        aiSystems: aiSystems.length,
        enabledAutoPolicies,
        enabledApprovalPolicies,
        blockedPolicies,
        openActions,
        highOrCriticalFindings,
      },
    }
  }
}
