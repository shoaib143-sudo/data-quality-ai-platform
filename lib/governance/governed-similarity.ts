import { createAdminClient } from '@/lib/supabase/admin'
import { semanticSearch } from '@/lib/governance/semantic-search'
import {
  findSimilarGovernanceObjectsWithDependencies,
  normalizeGovernedSimilarityType,
  type GovernedSimilarityDependencies,
  type GovernedSimilarityType,
  type SimilaritySource,
} from '@/lib/governance/governed-similarity-contract'

export {
  GOVERNED_SIMILARITY_TYPES,
  findSimilarGovernanceObjectsWithDependencies,
  normalizeGovernedSimilarityType,
  normalizeSimilarityTargetTypes,
  similarityCapability,
} from '@/lib/governance/governed-similarity-contract'
export type {
  GovernedSimilarityDependencies,
  GovernedSimilarityResult,
  GovernedSimilarityType,
  SimilarityAuthorizationCapability,
  SimilarityMatch,
  SimilaritySource,
} from '@/lib/governance/governed-similarity-contract'

async function defaultLoadSource(input: {
  projectId: string
  objectType: GovernedSimilarityType
  objectKey: string
}): Promise<SimilaritySource | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('semantic_embeddings')
    .select('object_type,object_key,object_id,content,metadata,updated_at')
    .eq('project_id', input.projectId)
    .eq('object_type', input.objectType)
    .eq('object_key', input.objectKey)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Unable to load semantic similarity source: ${error.message}`)
  if (!data) return null
  return {
    objectType: normalizeGovernedSimilarityType(data.object_type),
    objectKey: String(data.object_key),
    objectId: data.object_id ? String(data.object_id) : null,
    content: String(data.content ?? ''),
    metadata: data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? data.metadata as Record<string, unknown>
      : {},
  }
}

async function defaultSearch(input: {
  projectId: string
  query: string
  targetTypes: GovernedSimilarityType[]
  threshold: number
  limit: number
}) {
  const admin = createAdminClient()
  return semanticSearch(admin, {
    projectId: input.projectId,
    query: input.query,
    objectTypes: input.targetTypes,
    threshold: input.threshold,
    limit: input.limit,
  })
}

const defaultDependencies: GovernedSimilarityDependencies = {
  loadSource: defaultLoadSource,
  search: defaultSearch,
}

export function findSimilarGovernanceObjects(
  input: Parameters<typeof findSimilarGovernanceObjectsWithDependencies>[0],
  dependencies: GovernedSimilarityDependencies = defaultDependencies,
) {
  return findSimilarGovernanceObjectsWithDependencies(input, dependencies)
}
