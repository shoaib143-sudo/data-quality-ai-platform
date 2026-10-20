import assert from 'node:assert/strict'
import './lib/register-typescript-resolution.mjs'

const { executeLearningExperimentInvocation } = await import('../lib/ai/learning-experiment-budget.ts')

const ids = {
  projectId: '11111111-1111-4111-8111-111111111111',
  policyId: '22222222-2222-4222-8222-222222222222',
  candidateId: '33333333-3333-4333-8333-333333333333',
  runId: '44444444-4444-4444-8444-444444444444',
  pricingVersionId: '66666666-6666-4666-8666-666666666666',
}
const quote = {
  providerId: 'synthetic-provider',
  modelName: 'synthetic-model',
  pricingVersionId: ids.pricingVersionId,
  currency: 'USD',
  maxOutputTokens: 8,
  totalTokensUpperBound: 20,
  costUsdUpperBound: '0.000001',
}

function scenario(quoteResult) {
  const calls = { reservation: [], provider: 0, accounting: 0, prospectiveResults: 0, accountingCallback: 0 }
  const zeroDollarPolicy = { totalCostBudgetUsd: '0', perRunCostBudgetUsd: '0' }
  const input = {
    scope: { ...ids, agentKey: 'profiling_agent', mode: 'GUIDED' },
    request: { task: 'general', system: 'synthetic zero dollar test', input: {} },
    provider: {
      id: quote.providerId,
      async generateJson() {
        calls.provider += 1
        calls.prospectiveResults += 1
        return {
          provider: quote.providerId,
          model: quote.modelName,
          result: { ok: true },
          latencyMs: 1,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }
      },
    },
    expectedModelName: quote.modelName,
    quote: { async quote() { return quoteResult } },
    admission: {
      async reserve(reservation) {
        calls.reservation.push(reservation)
        const positiveEstimate = Number(reservation.reservedCostUsd) > 0
        const overZeroBudget = positiveEstimate
          && (Number(reservation.reservedCostUsd) > Number(zeroDollarPolicy.totalCostBudgetUsd)
            || Number(reservation.reservedCostUsd) > Number(zeroDollarPolicy.perRunCostBudgetUsd))
        return {
          admitted: !overZeroBudget,
          reason: overZeroBudget ? 'RUN_BUDGET_EXCEEDED' : 'ADMITTED',
          reservationId: overZeroBudget ? null : '55555555-5555-4555-8555-555555555555',
          deadlineAt: overZeroBudget ? null : new Date(Date.now() + 10000).toISOString(),
        }
      },
      async reconcile() { return { status: 'ACCOUNTED' } },
    },
    costAccounting: {
      async recordInvocation() {
        calls.accounting += 1
        return {}
      },
    },
    onAccounting() { calls.accountingCallback += 1 },
  }
  return { calls, input }
}

const cases = [
  ['positive verified USD quote', { ...quote }, 'RUN_BUDGET_EXCEEDED', 1],
  ['unknown quote', null, 'VERIFIED_QUOTE_UNAVAILABLE', 0],
  ['non-USD quote', { ...quote, currency: 'EUR' }, 'VERIFIED_QUOTE_UNAVAILABLE', 0],
]

for (const [label, quoteResult, error, expectedReservations] of cases) {
  const { calls, input } = scenario(quoteResult)
  await assert.rejects(executeLearningExperimentInvocation(input), new RegExp(error))
  assert.equal(calls.reservation.length, expectedReservations, `${label}: reservation calls`)
  assert.equal(calls.provider, 0, `${label}: provider dispatches`)
  assert.equal(calls.accounting, 0, `${label}: cost records`)
  assert.equal(calls.accountingCallback, 0, `${label}: accounting callbacks`)
  assert.equal(calls.prospectiveResults, 0, `${label}: prospective result writes`)
}

console.log('Zero-dollar learning gate rejects positive, unknown, and non-USD quotes before provider dispatch or prospective result creation.')
