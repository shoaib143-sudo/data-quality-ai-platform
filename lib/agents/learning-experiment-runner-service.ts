import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceLearningExperimentBudgetAdmission } from '../ai/governance-learning-experiment-budget'
import { createGovernanceModelCostAccountingProvider } from '../ai/governance-cost-accounting'
import type { LearningExperimentQuoteProvider } from '../ai/learning-experiment-budget'
import type { ReasoningProvider } from '../ai/reasoning-provider'
import { runLearningExperiment, type LearningExperimentRunnerPlan, type LearningExperimentRunnerPorts, type RunnerArmOutcome } from './learning-experiment-runner'
import { createBudgetGuardedLearningRunnerExecutor, type LearningRunnerSettlement } from './learning-experiment-runner-invocation'
import { createLearningExperimentRunnerStore } from './learning-experiment-runner-store'

/** Canonical read adapter, intentionally refusing missing or ambiguous links. */
export function createLearningRunnerCanonicalSettlementLoader() {
  const admin = createAdminClient()
  return async (reservationId: string): Promise<LearningRunnerSettlement | null> => {
    const { data: reservation, error: rError } = await admin.schema('agent').from('learning_experiment_budget_reservations')
      .select('id,project_id,policy_id,candidate_id,run_id,invocation_id').eq('id', reservationId).maybeSingle()
    if (rError) throw new Error('RUNNER_RESERVATION_READ_FAILED')
    if (!reservation || reservation.id !== reservationId) return null
    const { data: settlement, error: sError } = await admin.schema('agent').from('learning_experiment_budget_settlements')
      .select('id,reservation_id,project_id,status,cost_event_id,observed_tokens,observed_cost')
      .eq('reservation_id', reservationId).eq('project_id', reservation.project_id).maybeSingle()
    if (sError) throw new Error('RUNNER_SETTLEMENT_READ_FAILED')
    if (!settlement || settlement.status !== 'ACCOUNTED' || !settlement.cost_event_id
      || settlement.reservation_id !== reservationId || settlement.project_id !== reservation.project_id) return null
    const { data: cost, error: cError } = await admin.schema('governance').from('ai_model_cost_events')
      .select('id,project_id,invocation_id,execution_correlation_id,accounting_status,currency,total_tokens,total_cost')
      .eq('id', settlement.cost_event_id).eq('project_id', reservation.project_id).maybeSingle()
    if (cError) throw new Error('RUNNER_COST_READ_FAILED')
    if (!cost || cost.id !== settlement.cost_event_id || cost.project_id !== reservation.project_id
      || cost.accounting_status !== 'PRICED' || cost.currency !== 'USD'
      || cost.invocation_id !== reservation.invocation_id || cost.execution_correlation_id !== reservation.run_id
      || cost.total_tokens !== settlement.observed_tokens || String(cost.total_cost) !== String(settlement.observed_cost)
      || cost.total_tokens == null || cost.total_cost == null
      || !/^\d+(?:\.\d+)?$/.test(String(cost.total_cost))
      || !Number.isFinite(Number(cost.total_cost)) || Number(cost.total_cost) < 0
      || !Number.isSafeInteger(Number(cost.total_tokens)) || Number(cost.total_tokens) < 0) return null
    return { id: String(settlement.id), reservationId, projectId: String(reservation.project_id),
      invocationId: String(reservation.invocation_id), policyRecordId: String(reservation.policy_id),
      candidateId: String(reservation.candidate_id), runId: String(reservation.run_id), costEventId: String(cost.id),
      status: 'ACCOUNTED', tokens: Number(cost.total_tokens), costUsd: String(cost.total_cost) }
  }
}

/** Server composition only. There is deliberately no browser route or automatic
 * scheduler: replay, authority, quoted pricing and deployment activation remain
 * mandatory server adapters. Omission is a preparation stop, never a paid call. */
export async function executeStoredLearningExperiment(input: {
  runId: string; dispatch?: boolean; signal?: AbortSignal
  loadServerPlan: LearningExperimentRunnerPorts['loadServerPlan']
  authorize: LearningExperimentRunnerPorts['authorize']
  isCancelled: (runId: string) => Promise<boolean>
  /** Verify the plan against immutable policy/candidate/manifest/artifact storage. */
  verifyStoredPlan: (plan: Readonly<LearningExperimentRunnerPlan>) => Promise<boolean>
  provider?: ReasoningProvider; expectedModelName?: string; quote?: LearningExperimentQuoteProvider
  assertActivated?: () => Promise<void>
}) {
  const loadSettlement = createLearningRunnerCanonicalSettlementLoader()
  let loadedPlan: LearningExperimentRunnerPlan | null = null
  const verify = async (outcome: Readonly<RunnerArmOutcome>) => {
    if (outcome.provenance !== 'prospective' || !outcome.reservationId) return false
    const receipt = await loadSettlement(outcome.reservationId)
    return !!receipt && receipt.projectId === outcome.identity.projectId && receipt.policyRecordId === outcome.identity.policyId
      && receipt.candidateId === outcome.identity.candidateId && receipt.runId === outcome.identity.runId
      && receipt.invocationId === outcome.invocationId && receipt.id === outcome.settlementId
      && receipt.costEventId === outcome.costEventId && receipt.tokens === outcome.tokens && receipt.costUsd === outcome.costUsd
  }
  return runLearningExperiment({ runId: input.runId, dispatch: input.dispatch, signal: input.signal, ports: {
    async loadServerPlan(runId) {
      const plan = structuredClone(await input.loadServerPlan(runId))
      if (plan.provenance !== 'prospective' || !await input.verifyStoredPlan(plan)) throw new Error('RUNNER_STORED_PLAN_UNVERIFIED')
      if (input.dispatch === true) {
        if (!input.provider || !input.expectedModelName || !input.quote || !input.assertActivated) throw new Error('RUNNER_ACTIVATION_DEPENDENCIES_MISSING')
        await input.assertActivated()
      }
      loadedPlan = structuredClone(plan)
      return plan
    },
    authorize: input.authorize,
    store: createLearningExperimentRunnerStore({ isCancelled: input.isCancelled }),
    verifyCanonicalOutcome: verify,
    async execute(attempt) {
      const plan = loadedPlan
      if (!plan || !input.provider || !input.expectedModelName || !input.quote || !input.assertActivated) throw new Error('RUNNER_ACTIVATION_DEPENDENCIES_MISSING')
      return createBudgetGuardedLearningRunnerExecutor({ provider: input.provider, expectedModelName: input.expectedModelName,
        agentKey: plan.policy.agentKey, skillKey: plan.policy.skillKey, mode: plan.policy.mode,
        baselineVersion: plan.policy.baselineVersion, candidateVersion: plan.policy.candidateVersion,
        admission: createGovernanceLearningExperimentBudgetAdmission(), quote: input.quote,
        costAccounting: createGovernanceModelCostAccountingProvider(), loadSettlement, assertActivated: input.assertActivated })(attempt)
    },
  } })
}
