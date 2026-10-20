import type { AuthorizationCapability } from '../../auth/authorize.ts'
import type { GovernedExecutionController } from '../../ai/execution-controller.ts'
import type { PolicyDecisionProvider, PolicyRiskLevel } from '../../governance/policy-decision-provider.ts'

export type GovernedExecutionGateRequest = {
  projectId: string
  actionKey: string
  targetType: string
  requiredCapability: AuthorizationCapability
  riskLevel: PolicyRiskLevel
  confidence: number
}

export type GovernedExecutionGateDependencies = {
  authorize: (projectId: string, capability: AuthorizationCapability) => Promise<void>
  executionController: Pick<GovernedExecutionController, 'assertAllowed'>
  policyDecisionProvider: PolicyDecisionProvider
}

export async function evaluateGovernedExecutionGate(
  request: GovernedExecutionGateRequest,
  dependencies: GovernedExecutionGateDependencies,
) {
  await dependencies.authorize(request.projectId, request.requiredCapability)
  const executionControl = await dependencies.executionController.assertAllowed({ projectId: request.projectId })
  const policy = await dependencies.policyDecisionProvider.decide({
    projectId: request.projectId,
    actionKey: request.actionKey,
    targetType: request.targetType,
    riskLevel: request.riskLevel,
    confidence: request.confidence,
  })
  return {
    allowed: policy.decision === 'ALLOW',
    requiresApproval: policy.decision === 'REQUIRE_APPROVAL',
    denied: policy.decision === 'DENY',
    executionControl,
    policy,
  }
}
