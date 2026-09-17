import assert from 'node:assert/strict'

const { runBoundedRecursion, validateBoundedRecursionBudget } = await import('../lib/agents/runtime/bounded-recursion-runtime.ts')

const budget = {
  maxIterations: 4,
  maxToolCalls: 6,
  maxHandoffs: 2,
  maxRuntimeMs: 1000,
  stopConfidence: 0.9,
}
validateBoundedRecursionBudget(budget)

{
  let calls = 0
  const result = await runBoundedRecursion({
    initialState: { evidence: 0 },
    budget,
    now: () => calls * 10,
    runIteration: async ({ iteration, state, remainingToolCalls }) => {
      calls += 1
      assert.ok(remainingToolCalls > 0)
      const evidence = state.evidence + 1
      return {
        state: { evidence },
        output: { iteration, evidence },
        confidence: iteration === 2 ? 0.93 : 0.7,
        toolCallsUsed: 1,
        materialImprovement: true,
      }
    },
  })
  assert.equal(result.stopReason, 'CONFIDENCE_REACHED')
  assert.equal(result.iterations, 2)
  assert.equal(result.toolCallsUsed, 2)
  assert.deepEqual(result.output, { iteration: 2, evidence: 2 })
}

{
  const result = await runBoundedRecursion({
    initialState: 0,
    budget,
    runIteration: async ({ state }) => ({
      state: state + 1,
      output: state + 1,
      confidence: 0.5,
      materialImprovement: false,
    }),
  })
  assert.equal(result.stopReason, 'NO_MATERIAL_IMPROVEMENT')
  assert.equal(result.iterations, 1)
}

{
  const result = await runBoundedRecursion({
    initialState: 0,
    budget: { ...budget, maxIterations: 2, maxToolCalls: 10 },
    runIteration: async ({ state }) => ({
      state: state + 1,
      output: state + 1,
      confidence: 0.4,
      materialImprovement: true,
    }),
  })
  assert.equal(result.stopReason, 'ITERATION_BUDGET_EXHAUSTED')
  assert.equal(result.iterations, 2)
}

{
  const result = await runBoundedRecursion({
    initialState: 0,
    budget: { ...budget, maxIterations: 4, maxToolCalls: 2 },
    runIteration: async ({ state }) => ({
      state: state + 1,
      output: state + 1,
      confidence: 0.4,
      toolCallsUsed: 1,
      materialImprovement: true,
    }),
  })
  assert.equal(result.stopReason, 'TOOL_BUDGET_EXHAUSTED')
  assert.equal(result.toolCallsUsed, 2)
}

{
  const result = await runBoundedRecursion({
    initialState: 0,
    budget: { ...budget, maxHandoffs: 1 },
    runIteration: async ({ state }) => ({
      state: state + 1,
      output: state + 1,
      confidence: 0.4,
      handoffsUsed: 1,
      materialImprovement: true,
    }),
  })
  assert.equal(result.stopReason, 'HANDOFF_BUDGET_EXHAUSTED')
  assert.equal(result.handoffsUsed, 1)
}

{
  let clock = 0
  const result = await runBoundedRecursion({
    initialState: 0,
    budget: { ...budget, maxRuntimeMs: 25 },
    now: () => clock,
    runIteration: async ({ state }) => {
      clock += 30
      return {
        state: state + 1,
        output: state + 1,
        confidence: 0.4,
        materialImprovement: true,
      }
    },
  })
  assert.equal(result.stopReason, 'RUNTIME_BUDGET_EXHAUSTED')
}

await assert.rejects(
  () => runBoundedRecursion({
    initialState: 0,
    budget,
    runIteration: async ({ state, remainingToolCalls }) => ({
      state,
      output: state,
      confidence: 0.4,
      toolCallsUsed: remainingToolCalls + 1,
      materialImprovement: true,
    }),
  }),
  /exceeded the remaining tool-call budget/,
)

assert.throws(
  () => validateBoundedRecursionBudget({ ...budget, maxIterations: 0 }),
  /maxIterations must be a positive integer/,
)
assert.throws(
  () => validateBoundedRecursionBudget({ ...budget, stopConfidence: 1.1 }),
  /stopConfidence must be greater than 0 and at most 1/,
)

console.log('Bounded recursion runtime confidence, convergence, iteration, tool, handoff, runtime, and overrun safeguards verified.')
