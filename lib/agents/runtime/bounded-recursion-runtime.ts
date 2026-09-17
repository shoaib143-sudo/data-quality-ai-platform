export type BoundedRecursionBudget = {
  maxIterations: number
  maxToolCalls: number
  maxHandoffs: number
  maxRuntimeMs: number
  stopConfidence: number
}

export type BoundedRecursionIterationContext<TState> = {
  iteration: number
  state: TState
  remainingToolCalls: number
  remainingHandoffs: number
  elapsedMs: number
}

export type BoundedRecursionIterationResult<TState, TOutput> = {
  state: TState
  output: TOutput
  confidence: number
  toolCallsUsed?: number
  handoffsUsed?: number
  materialImprovement: boolean
}

export type BoundedRecursionStopReason =
  | 'CONFIDENCE_REACHED'
  | 'NO_MATERIAL_IMPROVEMENT'
  | 'ITERATION_BUDGET_EXHAUSTED'
  | 'TOOL_BUDGET_EXHAUSTED'
  | 'HANDOFF_BUDGET_EXHAUSTED'
  | 'RUNTIME_BUDGET_EXHAUSTED'

export type BoundedRecursionResult<TState, TOutput> = {
  state: TState
  output: TOutput
  confidence: number
  iterations: number
  toolCallsUsed: number
  handoffsUsed: number
  elapsedMs: number
  stopReason: BoundedRecursionStopReason
}

export type BoundedRecursionOptions<TState, TOutput> = {
  initialState: TState
  budget: BoundedRecursionBudget
  runIteration: (context: BoundedRecursionIterationContext<TState>) => Promise<BoundedRecursionIterationResult<TState, TOutput>>
  now?: () => number
}

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`)
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
}

export function validateBoundedRecursionBudget(budget: BoundedRecursionBudget): void {
  positiveInteger(budget.maxIterations, 'maxIterations')
  positiveInteger(budget.maxToolCalls, 'maxToolCalls')
  nonNegativeInteger(budget.maxHandoffs, 'maxHandoffs')
  positiveInteger(budget.maxRuntimeMs, 'maxRuntimeMs')
  if (!Number.isFinite(budget.stopConfidence) || budget.stopConfidence <= 0 || budget.stopConfidence > 1) {
    throw new Error('stopConfidence must be greater than 0 and at most 1')
  }
}

function usedCount(value: number | undefined, label: string) {
  const normalized = value ?? 0
  nonNegativeInteger(normalized, label)
  return normalized
}

function boundedConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('iteration confidence must be between 0 and 1')
  return value
}

export async function runBoundedRecursion<TState, TOutput>(
  options: BoundedRecursionOptions<TState, TOutput>,
): Promise<BoundedRecursionResult<TState, TOutput>> {
  validateBoundedRecursionBudget(options.budget)
  const now = options.now ?? Date.now
  const startedAt = now()
  let state = options.initialState
  let output: TOutput | undefined
  let confidence = 0
  let toolCallsUsed = 0
  let handoffsUsed = 0

  for (let iteration = 1; iteration <= options.budget.maxIterations; iteration += 1) {
    const elapsedBefore = Math.max(0, now() - startedAt)
    if (elapsedBefore >= options.budget.maxRuntimeMs) {
      if (output === undefined) throw new Error('Bounded recursion exhausted runtime budget before producing an output')
      return {
        state,
        output,
        confidence,
        iterations: iteration - 1,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedBefore,
        stopReason: 'RUNTIME_BUDGET_EXHAUSTED',
      }
    }
    if (toolCallsUsed >= options.budget.maxToolCalls) {
      if (output === undefined) throw new Error('Bounded recursion exhausted tool budget before producing an output')
      return {
        state,
        output,
        confidence,
        iterations: iteration - 1,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedBefore,
        stopReason: 'TOOL_BUDGET_EXHAUSTED',
      }
    }
    if (handoffsUsed >= options.budget.maxHandoffs && options.budget.maxHandoffs > 0) {
      if (output === undefined) throw new Error('Bounded recursion exhausted handoff budget before producing an output')
      return {
        state,
        output,
        confidence,
        iterations: iteration - 1,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedBefore,
        stopReason: 'HANDOFF_BUDGET_EXHAUSTED',
      }
    }

    const result = await options.runIteration({
      iteration,
      state,
      remainingToolCalls: options.budget.maxToolCalls - toolCallsUsed,
      remainingHandoffs: options.budget.maxHandoffs - handoffsUsed,
      elapsedMs: elapsedBefore,
    })

    const iterationToolCalls = usedCount(result.toolCallsUsed, 'toolCallsUsed')
    const iterationHandoffs = usedCount(result.handoffsUsed, 'handoffsUsed')
    if (iterationToolCalls > options.budget.maxToolCalls - toolCallsUsed) {
      throw new Error('Recursion iteration exceeded the remaining tool-call budget')
    }
    if (iterationHandoffs > options.budget.maxHandoffs - handoffsUsed) {
      throw new Error('Recursion iteration exceeded the remaining handoff budget')
    }

    toolCallsUsed += iterationToolCalls
    handoffsUsed += iterationHandoffs
    state = result.state
    output = result.output
    confidence = boundedConfidence(result.confidence)
    const elapsedAfter = Math.max(0, now() - startedAt)

    if (confidence >= options.budget.stopConfidence) {
      return {
        state,
        output,
        confidence,
        iterations: iteration,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedAfter,
        stopReason: 'CONFIDENCE_REACHED',
      }
    }
    if (!result.materialImprovement) {
      return {
        state,
        output,
        confidence,
        iterations: iteration,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedAfter,
        stopReason: 'NO_MATERIAL_IMPROVEMENT',
      }
    }
    if (elapsedAfter >= options.budget.maxRuntimeMs) {
      return {
        state,
        output,
        confidence,
        iterations: iteration,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedAfter,
        stopReason: 'RUNTIME_BUDGET_EXHAUSTED',
      }
    }
    if (toolCallsUsed >= options.budget.maxToolCalls) {
      return {
        state,
        output,
        confidence,
        iterations: iteration,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedAfter,
        stopReason: 'TOOL_BUDGET_EXHAUSTED',
      }
    }
    if (handoffsUsed >= options.budget.maxHandoffs && options.budget.maxHandoffs > 0) {
      return {
        state,
        output,
        confidence,
        iterations: iteration,
        toolCallsUsed,
        handoffsUsed,
        elapsedMs: elapsedAfter,
        stopReason: 'HANDOFF_BUDGET_EXHAUSTED',
      }
    }
  }

  if (output === undefined) throw new Error('Bounded recursion completed without producing an output')
  return {
    state,
    output,
    confidence,
    iterations: options.budget.maxIterations,
    toolCallsUsed,
    handoffsUsed,
    elapsedMs: Math.max(0, now() - startedAt),
    stopReason: 'ITERATION_BUDGET_EXHAUSTED',
  }
}
