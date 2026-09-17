import {
  getAgentExcellenceContract,
  type AgentRecursionBudget,
} from '../agent-excellence-contracts'
import type { GovernedAgentKey } from '../governed-agent-registry'
import {
  runBoundedRecursion,
  type BoundedRecursionIterationContext,
  type BoundedRecursionIterationResult,
  type BoundedRecursionResult,
} from './bounded-recursion-runtime'

export type AgentExcellenceIterationContext<TState> = BoundedRecursionIterationContext<TState> & {
  agentKey: GovernedAgentKey
}

export type AgentExcellenceRuntimeOptions<TState, TOutput> = {
  agentKey: GovernedAgentKey
  initialState: TState
  runIteration: (context: AgentExcellenceIterationContext<TState>) => Promise<BoundedRecursionIterationResult<TState, TOutput>>
  now?: () => number
}

function runtimeBudget(budget: AgentRecursionBudget) {
  return {
    maxIterations: budget.maxIterations,
    maxToolCalls: budget.maxToolCalls,
    maxHandoffs: budget.maxHandoffs,
    maxRuntimeMs: budget.maxRuntimeMs,
    stopConfidence: budget.stopConfidence,
  }
}

export async function runAgentExcellenceRecursion<TState, TOutput>(
  options: AgentExcellenceRuntimeOptions<TState, TOutput>,
): Promise<BoundedRecursionResult<TState, TOutput>> {
  const contract = getAgentExcellenceContract(options.agentKey)

  return runBoundedRecursion({
    initialState: options.initialState,
    budget: runtimeBudget(contract.recursionBudget),
    now: options.now,
    runIteration: (context) => options.runIteration({
      ...context,
      agentKey: options.agentKey,
    }),
  })
}
