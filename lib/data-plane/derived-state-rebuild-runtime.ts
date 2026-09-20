import { rebuildProjectionSnapshot } from '@/lib/data-plane/projection-snapshot'
import { reindexProjectSemanticCorpusWithRuntime } from '@/lib/governance/semantic-project-reindex-runtime'
import {
  rebuildProjectDerivedState,
  type DerivedStateRebuildResult,
} from '@/lib/data-plane/derived-state-rebuild'

export function rebuildProjectDerivedStateWithRuntime(input: {
  projectId: string
  reason: string
  actorUserId?: string | null
  targets?: unknown
  semanticConcurrency?: number
}): Promise<DerivedStateRebuildResult> {
  return rebuildProjectDerivedState(input, {
    projectionSnapshot: rebuildProjectionSnapshot,
    semanticCorpus: reindexProjectSemanticCorpusWithRuntime,
  })
}
