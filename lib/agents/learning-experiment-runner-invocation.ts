import { executeLearningExperimentInvocation, type LearningExperimentBudgetAdmission, type LearningExperimentQuoteProvider } from '../ai/learning-experiment-budget'
import type { ModelCostAccountingProvider, ModelCostAccountingRecord } from '../ai/cost-accounting'
import type { ReasoningProvider, ReasoningRequest } from '../ai/reasoning-provider'
import { runnerHash, type LearningExperimentRunnerPorts, type RunnerArmOutcome } from './learning-experiment-runner'

export type LearningRunnerSettlement = {
  id: string; reservationId: string; projectId: string; invocationId: string
  policyRecordId: string; candidateId: string; runId: string; costEventId: string
  status: 'ACCOUNTED'; tokens: number; costUsd: string
}

/** Executes a sealed prompt artifact through the existing budget guard. It does
 * not evaluate arbitrary code or allow artifact content to choose tools/scope. */
export function createBudgetGuardedLearningRunnerExecutor(input: {
  provider: ReasoningProvider
  expectedModelName: string
  agentKey: import('./learning-evaluation-policy').LearningEvaluationPolicy['agentKey']
  skillKey: import('./learning-evaluation-policy').LearningEvaluationPolicy['skillKey']
  mode: import('./learning-evaluation-policy').LearningEvaluationPolicy['mode']
  baselineVersion: string; candidateVersion: string
  admission: LearningExperimentBudgetAdmission
  quote: LearningExperimentQuoteProvider
  costAccounting: ModelCostAccountingProvider
  /** Must read canonical reservation + settlement + cost rows, not construct a receipt. */
  loadSettlement(reservationId: string): Promise<LearningRunnerSettlement | null>
  /** Server-owned deployment activation. Absent/denied activation must never invoke. */
  assertActivated(): Promise<void>
}): LearningExperimentRunnerPorts['execute'] {
  return async attempt => {
    if (attempt.provenance !== 'prospective') throw new Error('RUNNER_SYNTHETIC_PROVIDER_FORBIDDEN')
    await input.assertActivated()
    attempt.signal?.throwIfAborted()
    const prompt = JSON.parse(attempt.executable.bytes)
    if (!prompt || prompt.format !== 'reasoning_prompt_v1' || prompt.agentKey !== input.agentKey
      || prompt.skillKey !== input.skillKey || prompt.version !== (attempt.identity.arm === 'baseline' ? input.baselineVersion : input.candidateVersion)
      || !['general', 'profiling_investigation', 'governance_reasoning', 'incident_investigation'].includes(prompt.task)
      || typeof prompt.system !== 'string' || !prompt.system.trim()
      || !Number.isSafeInteger(prompt.maxOutputTokens) || prompt.maxOutputTokens <= 0
      || (prompt.temperature != null && (!Number.isFinite(prompt.temperature) || prompt.temperature < 0 || prompt.temperature > 2))) throw new Error('RUNNER_EXECUTABLE_FORMAT_UNSUPPORTED')
    const replay = JSON.parse(attempt.input.bytes)
    if (!replay || typeof replay !== 'object' || Array.isArray(replay)) throw new Error('RUNNER_REPLAY_INPUT_INVALID')
    let reservationId: string | null = null
    let accounting: ModelCostAccountingRecord | null = null
    const admission: LearningExperimentBudgetAdmission = {
      async reserve(value) {
        const result = await input.admission.reserve(value)
        if (result.admitted) reservationId = result.reservationId
        return result
      },
      reconcile: value => input.admission.reconcile(value),
    }
    const request: ReasoningRequest = { task: prompt.task, system: prompt.system, input: replay,
      temperature: prompt.temperature, maxOutputTokens: prompt.maxOutputTokens, signal: attempt.signal, allowFallback: false }
    const generated = await executeLearningExperimentInvocation({
      scope: { projectId: attempt.identity.projectId, policyId: attempt.identity.policyId,
        candidateId: attempt.identity.candidateId, runId: attempt.identity.runId, agentKey: input.agentKey, mode: input.mode },
      request, provider: input.provider, expectedModelName: input.expectedModelName,
      admission, quote: input.quote, costAccounting: input.costAccounting,
      onAccounting: value => { accounting = value },
    })
    // Callback-assigned accounting remains canonical only after the guard has
    // checked usage, quote bounds and actual durable reconciliation.
    const record = accounting as ModelCostAccountingRecord | null
    if (!reservationId || !record) throw new Error('RUNNER_CANONICAL_RECEIPT_MISSING')
    const settled = await input.loadSettlement(reservationId)
    if (!settled || settled.status !== 'ACCOUNTED' || settled.reservationId !== reservationId
      || settled.projectId !== attempt.identity.projectId || settled.policyRecordId !== attempt.identity.policyId
      || settled.candidateId !== attempt.identity.candidateId || settled.runId !== attempt.identity.runId
      || settled.invocationId !== record.invocationId || settled.costEventId !== record.id
      || settled.tokens !== record.totalTokens || settled.costUsd !== record.totalCost) throw new Error('RUNNER_CANONICAL_RECEIPT_MISMATCH')
    const bytes = JSON.stringify(generated.result)
    const hash = runnerHash(bytes)
    const outcome: RunnerArmOutcome = { identity: attempt.identity, inputHash: attempt.input.hash,
      output: { ref: `learning-output:${attempt.identity.runId}:${attempt.identity.caseKey}:${attempt.identity.arm}:${hash}`, hash, bytes },
      provenance: 'prospective', invocationId: record.invocationId, reservationId,
      settlementId: settled.id, costEventId: record.id, costUsd: settled.costUsd,
      tokens: settled.tokens, latencyMs: Math.ceil(generated.latencyMs) }
    return outcome
  }
}
