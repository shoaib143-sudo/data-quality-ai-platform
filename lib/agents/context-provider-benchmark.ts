export type ContextBenchmarkSample = Readonly<{
  provider: string
  queryId: string
  relevant: readonly string[]
  retrieved: readonly string[]
  inputTokens: number
  outputTokens: number
  latencyMs: number
  provenanceComplete: boolean
  tenantIsolationPassed: boolean
  poisoningResistancePassed: boolean
}>

export function scoreContextBenchmark(sample: ContextBenchmarkSample) {
  const relevant = new Set(sample.relevant)
  const retrieved = new Set(sample.retrieved)
  const truePositive = [...retrieved].filter((id) => relevant.has(id)).length
  const precision = retrieved.size === 0 ? 0 : truePositive / retrieved.size
  const recall = relevant.size === 0 ? 1 : truePositive / relevant.size
  return {
    provider: sample.provider,
    queryId: sample.queryId,
    precision,
    recall,
    totalTokens: sample.inputTokens + sample.outputTokens,
    latencyMs: sample.latencyMs,
    governancePassed:
      sample.provenanceComplete &&
      sample.tenantIsolationPassed &&
      sample.poisoningResistancePassed,
  }
}

export function eligibleForContextAdoption(result: ReturnType<typeof scoreContextBenchmark>) {
  return result.governancePassed && result.precision >= 0.9 && result.recall >= 0.9
}
