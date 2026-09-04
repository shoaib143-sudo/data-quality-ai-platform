import type { GraphDirection, GraphNodeRef } from '@/lib/data-plane/contracts'
import { getGraphProvider } from '@/lib/data-plane/graph-provider'

type GraphBenchmarkRequest = {
  projectId: string
  anchor: GraphNodeRef
  direction: GraphDirection
  depth: number
  maxEdges: number
  iterations: number
  warmupIterations?: number
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return Number(sorted[index]!.toFixed(2))
}

export async function benchmarkGraphProvider(request: GraphBenchmarkRequest) {
  const provider = getGraphProvider()
  const warmupIterations = Math.max(0, Math.min(5, request.warmupIterations ?? 1))
  const iterations = Math.max(3, Math.min(25, request.iterations))
  const baseRequest = {
    projectId: request.projectId,
    anchor: request.anchor,
    direction: request.direction,
    depth: Math.max(1, Math.min(4, request.depth)),
    maxEdges: Math.max(10, Math.min(400, request.maxEdges)),
  }

  for (let index = 0; index < warmupIterations; index += 1) {
    await provider.neighborhood(baseRequest)
  }

  const samples: Array<{ latencyMs: number; edgeCount: number; nodeCount: number; truncated: boolean }> = []
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    const result = await provider.neighborhood(baseRequest)
    const latencyMs = performance.now() - started
    samples.push({
      latencyMs: Number(latencyMs.toFixed(2)),
      edgeCount: result.edgeCount,
      nodeCount: result.nodeCount,
      truncated: result.truncated,
    })
  }

  const sorted = samples.map((sample) => sample.latencyMs).sort((a, b) => a - b)
  const total = sorted.reduce((sum, value) => sum + value, 0)
  const last = samples.at(-1)!

  return {
    providerKey: provider.providerKey,
    request: { ...baseRequest, iterations, warmupIterations },
    results: {
      minMs: Number((sorted[0] ?? 0).toFixed(2)),
      meanMs: Number((total / Math.max(1, sorted.length)).toFixed(2)),
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      maxMs: Number((sorted.at(-1) ?? 0).toFixed(2)),
      sampleCount: samples.length,
      edgeCount: last.edgeCount,
      nodeCount: last.nodeCount,
      truncated: samples.some((sample) => sample.truncated),
    },
    samples,
  }
}
