import type {
  PolicyDecision,
  PolicyDecisionProvider,
  PolicyDecisionRequest,
  PolicyDecisionResult,
} from './policy-decision-provider'

export type OpaPolicyDecisionProviderOptions = {
  endpoint: string | null
  decisionPath?: string | null
  authorizationToken?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

type OpaDecisionPayload = {
  decision: PolicyDecision
  policy_version_id: string
  reason?: string | null
}

const DECISION_RANK: Record<PolicyDecision, number> = {
  ALLOW: 0,
  REQUIRE_APPROVAL: 1,
  DENY: 2,
}

function blockedResult(canonical: PolicyDecisionResult, reason: string): PolicyDecisionResult {
  return {
    ...canonical,
    decision: 'DENY',
    reason,
    providerId: 'opa_policy_enforcement',
  }
}

function normalizeDecision(value: unknown): PolicyDecision | null {
  return value === 'ALLOW' || value === 'REQUIRE_APPROVAL' || value === 'DENY' ? value : null
}

function resolvePayload(payload: unknown): OpaDecisionPayload | null {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
  const result = body?.result && typeof body.result === 'object'
    ? body.result as Record<string, unknown>
    : body
  if (!result) return null

  const decision = normalizeDecision(result.decision)
  const policyVersionId = typeof result.policy_version_id === 'string' ? result.policy_version_id.trim() : ''
  if (!decision || !policyVersionId) return null
  return {
    decision,
    policy_version_id: policyVersionId,
    reason: typeof result.reason === 'string' ? result.reason.trim() : null,
  }
}

/**
 * OPA is an external enforcement point, not a replacement governance authority.
 * The canonical DataNexus provider resolves the exact current policy/version first.
 * OPA may keep or strengthen that decision, but can never relax it.
 */
export class OpaPolicyDecisionProvider implements PolicyDecisionProvider {
  readonly id = 'opa_policy_enforcement'

  private readonly canonical: PolicyDecisionProvider
  private readonly endpoint: string | null
  private readonly decisionPath: string
  private readonly authorizationToken: string | null
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(canonical: PolicyDecisionProvider, options: OpaPolicyDecisionProviderOptions) {
    this.canonical = canonical
    this.endpoint = options.endpoint?.trim().replace(/\/$/, '') || null
    this.decisionPath = `/${(options.decisionPath?.trim() || 'v1/data/datanexus/autonomy/decision').replace(/^\/+/, '')}`
    this.authorizationToken = options.authorizationToken?.trim() || null
    this.timeoutMs = Math.max(250, Math.min(10_000, options.timeoutMs ?? 2_000))
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async decide(request: PolicyDecisionRequest): Promise<PolicyDecisionResult> {
    const canonical = await this.canonical.decide(request)

    // A dedicated PDP must never be able to weaken a canonical deny.
    if (canonical.decision === 'DENY') return canonical
    if (!canonical.policyVersionId) {
      return blockedResult(canonical, 'OPA enforcement requires a verified canonical policy version.')
    }
    if (!this.endpoint) {
      return blockedResult(canonical, 'OPA enforcement is selected but no OPA endpoint is configured.')
    }
    if (!this.authorizationToken) {
      return blockedResult(canonical, 'OPA enforcement is selected but no OPA authentication token is configured.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.endpoint}${this.decisionPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.authorizationToken}`,
        },
        body: JSON.stringify({
          input: {
            request: {
              project_id: request.projectId,
              action_key: request.actionKey,
              target_type: request.targetType,
              risk_level: request.riskLevel,
              confidence: request.confidence,
            },
            canonical: {
              decision: canonical.decision,
              policy_id: canonical.policyId,
              policy_version_id: canonical.policyVersionId,
              authority_status: canonical.authorityStatus,
              execution_mode: canonical.executionMode,
              reversible: canonical.reversible,
            },
          },
        }),
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        return blockedResult(canonical, `OPA enforcement failed closed after HTTP ${response.status}.`)
      }

      const opa = resolvePayload(await response.json().catch(() => null))
      if (!opa) return blockedResult(canonical, 'OPA returned an incompatible decision contract.')
      if (opa.policy_version_id !== canonical.policyVersionId) {
        return blockedResult(canonical, 'OPA decision was evaluated against a stale or mismatched policy version.')
      }
      if (DECISION_RANK[opa.decision] < DECISION_RANK[canonical.decision]) {
        return blockedResult(canonical, 'OPA attempted to relax the canonical DataNexus policy decision.')
      }

      return {
        ...canonical,
        decision: opa.decision,
        reason: opa.reason || `OPA preserved or strengthened canonical decision ${canonical.decision}.`,
        providerId: this.id,
      }
    } catch {
      return blockedResult(canonical, 'OPA enforcement could not be reached and failed closed.')
    } finally {
      clearTimeout(timeout)
    }
  }
}
