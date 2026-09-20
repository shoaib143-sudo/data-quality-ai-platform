export type DerivedStateRebuildTarget = 'PROJECTION_SNAPSHOT' | 'SEMANTIC_CORPUS'
export type DerivedStateSurfaceStatus = 'COMPLETED' | 'PARTIAL' | 'FAILED'

export type DerivedStateRebuildSurfaceResult = {
  target: DerivedStateRebuildTarget
  status: DerivedStateSurfaceStatus
  detail?: unknown
  error?: string
}

export type DerivedStateRebuildResult = {
  projectId: string
  reason: string
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  targets: DerivedStateRebuildTarget[]
  results: DerivedStateRebuildSurfaceResult[]
}

export type DerivedStateRebuildDependencies = {
  projectionSnapshot: (input: {
    projectId: string
    reason: string
    actorUserId?: string | null
  }) => Promise<unknown>
  semanticCorpus: (
    projectId: string,
    options?: { concurrency?: number },
  ) => Promise<{ failed: number; [key: string]: unknown }>
}

const TARGETS: DerivedStateRebuildTarget[] = ['PROJECTION_SNAPSHOT', 'SEMANTIC_CORPUS']

function normalizeReason(value: string) {
  const reason = value.trim()
  if (reason.length < 8) throw new Error('A derived-state rebuild reason of at least 8 characters is required.')
  return reason
}

export function normalizeDerivedStateRebuildTargets(input?: unknown): DerivedStateRebuildTarget[] {
  if (input === undefined || input === null) return [...TARGETS]
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('At least one derived-state rebuild target is required.')
  }

  const normalized: DerivedStateRebuildTarget[] = []
  for (const value of input) {
    if (value !== 'PROJECTION_SNAPSHOT' && value !== 'SEMANTIC_CORPUS') {
      throw new Error(`Unsupported derived-state rebuild target: ${String(value)}`)
    }
    if (!normalized.includes(value)) normalized.push(value)
  }
  return normalized
}

export async function rebuildProjectDerivedState(
  input: {
    projectId: string
    reason: string
    actorUserId?: string | null
    targets?: unknown
    semanticConcurrency?: number
  },
  dependencies: DerivedStateRebuildDependencies,
): Promise<DerivedStateRebuildResult> {
  const projectId = input.projectId.trim()
  if (!projectId) throw new Error('projectId is required.')
  const reason = normalizeReason(input.reason)
  const targets = normalizeDerivedStateRebuildTargets(input.targets)
  const semanticConcurrency = typeof input.semanticConcurrency === 'number' && Number.isFinite(input.semanticConcurrency)
    ? Math.max(1, Math.min(8, Math.trunc(input.semanticConcurrency)))
    : undefined

  const results: DerivedStateRebuildSurfaceResult[] = []

  for (const target of targets) {
    if (target === 'PROJECTION_SNAPSHOT') {
      try {
        const detail = await dependencies.projectionSnapshot({
          projectId,
          reason,
          actorUserId: input.actorUserId ?? null,
        })
        results.push({ target, status: 'COMPLETED', detail })
      } catch (error) {
        results.push({
          target,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        })
      }
      continue
    }

    try {
      const detail = await dependencies.semanticCorpus(
        projectId,
        semanticConcurrency ? { concurrency: semanticConcurrency } : {},
      )
      results.push({
        target,
        status: detail.failed > 0 ? 'PARTIAL' : 'COMPLETED',
        detail,
      })
    } catch (error) {
      results.push({
        target,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const completed = results.filter((result) => result.status === 'COMPLETED').length
  const degraded = results.filter((result) => result.status !== 'COMPLETED').length
  const status = degraded === 0
    ? 'COMPLETED'
    : completed === 0 && results.every((result) => result.status === 'FAILED')
      ? 'FAILED'
      : 'PARTIAL'

  return { projectId, reason, status, targets, results }
}
