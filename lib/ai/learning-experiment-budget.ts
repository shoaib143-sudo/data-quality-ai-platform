import { randomUUID } from 'node:crypto'
import type { LearningEvaluationPolicy } from '../agents/learning-evaluation-policy'
import { GOVERNED_AGENT_KEYS } from '../agents/governed-agent-registry.ts'
import type { ModelCostAccountingProvider, ModelCostAccountingRecord } from './cost-accounting'
import type { ReasoningProvider, ReasoningRequest, ReasoningResult } from './reasoning-provider'

export type LearningExperimentScope = {
  projectId: string
  policyId: string
  candidateId: string
  runId: string
  agentKey: LearningEvaluationPolicy['agentKey']
  mode: LearningEvaluationPolicy['mode']
}
export type LearningExperimentQuote = {
  providerId: string
  modelName: string
  pricingVersionId: string
  currency: 'USD'
  maxOutputTokens: number
  totalTokensUpperBound: number
  costUsdUpperBound: string
}
/** Server-only port. Implementations must verify a conservative billable bound for
 * the exact provider, model, request and immutable pricing version. No estimate fallback. */
export interface LearningExperimentQuoteProvider {
  quote(request: ReasoningRequest): Promise<LearningExperimentQuote | null>
}
export interface LearningExperimentBudgetAdmission {
  reserve(input: LearningExperimentScope & { invocationId: string; reservedTokens: number; reservedCostUsd: string; providerId: string; modelName: string; pricingVersionId: string }): Promise<{
    admitted: boolean; reason: string; reservationId: string | null; deadlineAt: string | null
  }>
  reconcile(input: { projectId: string; reservationId: string; observedTokens: number | null; observedCostUsd: string | null; accountingComplete: boolean; costEventId: string | null }): Promise<{ status: 'ACCOUNTED' | 'UNKNOWN' | 'EXCEEDED'; reason?: string }>
}

function deny(reason: string): never {
  const error = new Error(`Learning experiment execution blocked: ${reason}`)
  error.name = 'LearningExperimentBudgetError'
  throw error
}
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function decimal(value: unknown): string | null {
  return typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && value.length <= 100 ? value : null
}
function compareCost(left: string, right: string) {
  const [li, lf = ''] = left.split('.')
  const [ri, rf = ''] = right.split('.')
  const scale = Math.max(lf.length, rf.length)
  const l = BigInt(li + lf.padEnd(scale, '0'))
  const r = BigInt(ri + rf.padEnd(scale, '0'))
  return l > r ? 1 : l < r ? -1 : 0
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function validateScope(scope: LearningExperimentScope) {
  for (const key of ['projectId', 'policyId', 'candidateId', 'runId'] as const) if (!UUID.test(scope[key])) deny(`INVALID_${key}`)
  if (!GOVERNED_AGENT_KEYS.includes(scope.agentKey) || !['GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS'].includes(scope.mode)) deny('INVALID_SCOPE')
}
function freezeJson(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child)
    Object.freeze(value)
  }
}
function addCost(left: string, right: string) {
  const [li, lf = ''] = left.split('.')
  const [ri, rf = ''] = right.split('.')
  const scale = Math.max(lf.length, rf.length)
  const sum = (BigInt(li + lf.padEnd(scale, '0')) + BigInt(ri + rf.padEnd(scale, '0'))).toString().padStart(scale + 1, '0')
  return scale ? `${sum.slice(0, -scale)}.${sum.slice(-scale)}` : sum
}

export async function executeLearningExperimentInvocation(input: {
  scope: LearningExperimentScope
  request: ReasoningRequest
  provider: ReasoningProvider
  expectedModelName: string
  admission: LearningExperimentBudgetAdmission
  quote: LearningExperimentQuoteProvider
  costAccounting: ModelCostAccountingProvider
  now?: () => number
  onAccounting?: (record: ModelCostAccountingRecord) => void
}): Promise<ReasoningResult> {
  const { provider, admission, costAccounting } = input
  const scope = { ...input.scope }
  const originalRequest = { ...input.request, input: JSON.parse(JSON.stringify(input.request.input)) }
  freezeJson(originalRequest.input)
  Object.freeze(originalRequest)
  validateScope(scope)
  originalRequest.signal?.throwIfAborted()
  if (!admission || !costAccounting || !input.quote) deny('BUDGET_DEPENDENCY_UNAVAILABLE')
  const quoted = await input.quote.quote(originalRequest)
  const quote = quoted ? Object.freeze({ ...quoted }) : null
  if (!quote || quote.currency !== 'USD' || quote.providerId !== provider.id || !input.expectedModelName || quote.modelName !== input.expectedModelName || !UUID.test(quote.pricingVersionId)
    || !integer(quote.maxOutputTokens) || quote.maxOutputTokens === 0 || !integer(quote.totalTokensUpperBound)
    || quote.totalTokensUpperBound < quote.maxOutputTokens || !decimal(quote.costUsdUpperBound)) deny('VERIFIED_QUOTE_UNAVAILABLE')
  if (originalRequest.maxOutputTokens != null && (!integer(originalRequest.maxOutputTokens) || originalRequest.maxOutputTokens === 0)) deny('INVALID_OUTPUT_LIMIT')
  originalRequest.signal?.throwIfAborted()
  const invocationId = randomUUID()
  const reservation = await admission.reserve({ ...scope, invocationId, reservedTokens: quote.totalTokensUpperBound, reservedCostUsd: quote.costUsdUpperBound, providerId: quote.providerId, modelName: quote.modelName, pricingVersionId: quote.pricingVersionId })
  if (!reservation || reservation.admitted !== true) deny(reservation?.reason ?? 'INVALID_RESERVATION')
  if (!reservation.reservationId) deny('INVALID_RESERVATION_ID')
  const now = input.now ?? Date.now
  let reconciled = false
  try {
    const remaining = Date.parse(reservation.deadlineAt ?? '') - now()
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 2_147_483_647) deny('EXPERIMENT_DEADLINE_EXCEEDED')
    const deadlineSignal = AbortSignal.timeout(Math.floor(remaining))
    const signal = originalRequest.signal ? AbortSignal.any([originalRequest.signal, deadlineSignal]) : deadlineSignal
    signal.throwIfAborted()
    const request: ReasoningRequest = {
      ...originalRequest, signal, allowFallback: false,
      maxOutputTokens: Math.min(originalRequest.maxOutputTokens ?? quote.maxOutputTokens, quote.maxOutputTokens),
    }
    const result = await provider.generateJson(request)
    const record = await costAccounting.recordInvocation({
      invocationId, projectId: scope.projectId, executionCorrelationId: scope.runId,
      providerRequestId: result.providerRequestId ?? null, providerId: result.provider, modelName: result.model,
      usage: result.usage, observedAt: new Date(now()).toISOString(),
    })
    const usage = result.usage
    input.onAccounting?.(record)
    const cost = decimal(record.totalCost)
    const inputCost = decimal(record.inputCost)
    const outputCost = decimal(record.outputCost)
    const complete = record.accountingStatus === 'PRICED' && record.currency === 'USD' && cost !== null
      && inputCost !== null && outputCost !== null && compareCost(addCost(inputCost, outputCost), cost) === 0 && UUID.test(record.id)
      && record.invocationId === invocationId && record.projectId === scope.projectId && record.executionCorrelationId === scope.runId
      && record.providerId === quote.providerId && result.provider === quote.providerId
      && record.modelName === quote.modelName && result.model === quote.modelName && record.pricingVersionId === quote.pricingVersionId
      && (result.resilience?.attempts ?? 1) === 1 && result.resilience?.fallbackApplied !== true
      && (result.providerRequestId == null || record.providerRequestId === result.providerRequestId)
      && integer(usage?.inputTokens) && integer(usage?.outputTokens) && integer(usage?.totalTokens)
      && usage.inputTokens + usage.outputTokens === usage.totalTokens
      && usage.outputTokens <= request.maxOutputTokens!
      && record.inputTokens === usage.inputTokens && record.outputTokens === usage.outputTokens && record.totalTokens === usage.totalTokens
    const settlement = await admission.reconcile({
      projectId: scope.projectId, reservationId: reservation.reservationId,
      observedTokens: complete ? usage!.totalTokens! : null, observedCostUsd: complete ? cost : null, accountingComplete: complete,
      costEventId: complete ? record.id : null,
    })
    reconciled = true
    if (!complete || settlement?.status !== 'ACCOUNTED') deny('ACCOUNTING_INCOMPLETE_OR_BUDGET_EXCEEDED')
    if (usage!.totalTokens! > quote.totalTokensUpperBound || usage!.outputTokens! > request.maxOutputTokens! || compareCost(cost!, quote.costUsdUpperBound) > 0) deny('PROVIDER_QUOTE_BOUND_EXCEEDED')
    signal.throwIfAborted()
    return result
  } catch (error) {
    if (!reconciled) {
      // Unknown charges remain reserved forever until trustworthy reconciliation.
      // Transport abort, crash and capacity-lease expiry are never a monetary refund.
      try { await admission.reconcile({ projectId: scope.projectId, reservationId: reservation.reservationId, observedTokens: null, observedCostUsd: null, accountingComplete: false, costEventId: null }) }
      catch { deny('RECONCILIATION_UNAVAILABLE_RESERVATION_RETAINED') }
    }
    throw error
  }
}
