import type {
  PolicyDecisionProvider,
  PolicyDecisionRequest,
  PolicyDecisionResult,
} from './policy-decision-provider'
import type { TelemetryProvider, TelemetryTraceContext } from '@/lib/ai/telemetry-provider'

type TraceContextResolver = () => TelemetryTraceContext | null

export class ObservablePolicyDecisionProvider implements PolicyDecisionProvider {
  readonly id: string
  private readonly delegate: PolicyDecisionProvider
  private readonly telemetry: TelemetryProvider
  private readonly resolveTraceContext: TraceContextResolver

  constructor(
    delegate: PolicyDecisionProvider,
    telemetry: TelemetryProvider,
    resolveTraceContext: TraceContextResolver = () => null,
  ) {
    this.delegate = delegate
    this.telemetry = telemetry
    this.resolveTraceContext = resolveTraceContext
    this.id = delegate.id
  }

  async decide(request: PolicyDecisionRequest): Promise<PolicyDecisionResult> {
    const startedAt = Date.now()
    const result = await this.delegate.decide(request)

    try {
      await this.telemetry.record({
        projectId: request.projectId,
        eventType: 'POLICY_DECISION',
        operation: 'autonomy_policy_decision',
        status: 'SUCCESS',
        providerId: result.providerId,
        traceContext: this.resolveTraceContext(),
        latencyMs: Math.max(0, Date.now() - startedAt),
        attributes: {
          action_key: request.actionKey,
          target_type: request.targetType,
          risk_level: request.riskLevel,
          confidence: request.confidence,
          decision: result.decision,
          decision_reason: result.reason,
          policy_id: result.policyId,
          policy_version_id: result.policyVersionId,
          authority_status: result.authorityStatus,
          execution_mode: result.executionMode,
          reversible: result.reversible,
        },
      })
    } catch {
      // Policy telemetry is observation only. A telemetry failure must never change
      // the already-resolved policy decision or create/bypass governance authority.
    }

    return result
  }
}
