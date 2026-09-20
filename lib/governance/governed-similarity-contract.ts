export const GOVERNED_SIMILARITY_TYPES = [
  'COLUMN',
  'GLOSSARY_TERM',
  'FINDING',
  'QUALITY_INCIDENT',
] as const

export type GovernedSimilarityType = typeof GOVERNED_SIMILARITY_TYPES[number]
export type SimilarityAuthorizationCapability = 'profiling.read' | 'glossary.read' | 'quality.read'

const CAPABILITY_BY_TYPE: Record<GovernedSimilarityType, SimilarityAuthorizationCapability> = {
  COLUMN: 'profiling.read',
  GLOSSARY_TERM: 'glossary.read',
  FINDING: 'quality.read',
  QUALITY_INCIDENT: 'quality.read',
}

const DEFAULT_TARGETS: Record<GovernedSimilarityType, GovernedSimilarityType[]> = {
  COLUMN: ['COLUMN'],
  GLOSSARY_TERM: ['GLOSSARY_TERM'],
  FINDING: ['FINDING', 'QUALITY_INCIDENT'],
  QUALITY_INCIDENT: ['FINDING', 'QUALITY_INCIDENT'],
}

export type SimilaritySource = {
  objectType: GovernedSimilarityType
  objectKey: string
  objectId: string | null
  content: string
  metadata: Record<string, unknown>
}

export type SimilarityMatch = {
  id: string
  object_type: string
  object_key: string
  object_id: string | null
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

export type GovernedSimilarityResult = {
  projectId: string
  source: SimilaritySource
  targetTypes: GovernedSimilarityType[]
  matches: Array<{
    id: string
    objectType: string
    objectKey: string
    objectId: string | null
    content: string
    metadata: Record<string, unknown>
    similarity: number
  }>
}

export type GovernedSimilarityDependencies = {
  loadSource: (input: {
    projectId: string
    objectType: GovernedSimilarityType
    objectKey: string
  }) => Promise<SimilaritySource | null>
  search: (input: {
    projectId: string
    query: string
    targetTypes: GovernedSimilarityType[]
    threshold: number
    limit: number
  }) => Promise<SimilarityMatch[]>
}

export function normalizeGovernedSimilarityType(value: unknown): GovernedSimilarityType {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!GOVERNED_SIMILARITY_TYPES.includes(normalized as GovernedSimilarityType)) {
    throw new Error(`Unsupported similarity object type: ${normalized || String(value)}`)
  }
  return normalized as GovernedSimilarityType
}

export function similarityCapability(
  objectType: GovernedSimilarityType,
): SimilarityAuthorizationCapability {
  return CAPABILITY_BY_TYPE[objectType]
}

export function normalizeSimilarityTargetTypes(
  sourceType: GovernedSimilarityType,
  values?: unknown,
): GovernedSimilarityType[] {
  if (values === undefined || values === null || values === '') return [...DEFAULT_TARGETS[sourceType]]
  const raw = Array.isArray(values)
    ? values
    : String(values).split(',').map((value) => value.trim()).filter(Boolean)
  if (!raw.length) return [...DEFAULT_TARGETS[sourceType]]

  const output: GovernedSimilarityType[] = []
  for (const value of raw) {
    const normalized = normalizeGovernedSimilarityType(value)
    if (!output.includes(normalized)) output.push(normalized)
  }
  return output
}

export async function findSimilarGovernanceObjectsWithDependencies(
  input: {
    projectId: string
    sourceType: GovernedSimilarityType | string
    sourceKey: string
    targetTypes?: unknown
    threshold?: number
    limit?: number
  },
  dependencies: GovernedSimilarityDependencies,
): Promise<GovernedSimilarityResult> {
  const projectId = input.projectId.trim()
  const sourceKey = input.sourceKey.trim()
  if (!projectId) throw new Error('projectId is required.')
  if (!sourceKey) throw new Error('sourceKey is required.')

  const sourceType = normalizeGovernedSimilarityType(input.sourceType)
  const targetTypes = normalizeSimilarityTargetTypes(sourceType, input.targetTypes)
  const threshold = typeof input.threshold === 'number' && Number.isFinite(input.threshold)
    ? Math.max(-1, Math.min(1, input.threshold))
    : 0.35
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit)
    ? Math.max(1, Math.min(50, Math.trunc(input.limit)))
    : 20

  const source = await dependencies.loadSource({ projectId, objectType: sourceType, objectKey: sourceKey })
  if (!source) throw new Error('Similarity source is not indexed.')
  if (!source.content.trim()) throw new Error('Similarity source has no searchable content.')

  const matches = await dependencies.search({
    projectId,
    query: source.content,
    targetTypes,
    threshold,
    limit: Math.min(100, limit + 1),
  })

  return {
    projectId,
    source,
    targetTypes,
    matches: matches
      .filter((match) => !(match.object_type === source.objectType && match.object_key === source.objectKey))
      .slice(0, limit)
      .map((match) => ({
        id: match.id,
        objectType: match.object_type,
        objectKey: match.object_key,
        objectId: match.object_id,
        content: match.content,
        metadata: match.metadata ?? {},
        similarity: Number(match.similarity),
      })),
  }
}
