export type KnowledgeSearchProviderKey = 'postgres' | 'opensearch'
export type GraphProviderKey = 'postgres' | 'age' | 'distributed'
export type AnalyticsProviderKey = 'postgres' | 'clickhouse'
export type ObjectStoreProviderKey = 'supabase' | 's3'

export type DataPlaneProviderSelection = {
  knowledgeSearch: KnowledgeSearchProviderKey
  graph: GraphProviderKey
  analytics: AnalyticsProviderKey
  objectStore: ObjectStoreProviderKey
}

function readChoice<T extends string>(
  value: string | undefined,
  fallback: T,
  allowed: readonly T[],
  variableName: string,
): T {
  const normalized = (value ?? fallback).trim().toLowerCase() as T
  if (!allowed.includes(normalized)) {
    throw new Error(`${variableName} must be one of: ${allowed.join(', ')}`)
  }
  return normalized
}

export function getDataPlaneProviderSelection(): DataPlaneProviderSelection {
  return {
    knowledgeSearch: readChoice(
      process.env.KNOWLEDGE_SEARCH_PROVIDER,
      'postgres',
      ['postgres', 'opensearch'] as const,
      'KNOWLEDGE_SEARCH_PROVIDER',
    ),
    graph: readChoice(
      process.env.GRAPH_PROVIDER,
      'postgres',
      ['postgres', 'age', 'distributed'] as const,
      'GRAPH_PROVIDER',
    ),
    analytics: readChoice(
      process.env.ANALYTICS_PROVIDER,
      'postgres',
      ['postgres', 'clickhouse'] as const,
      'ANALYTICS_PROVIDER',
    ),
    objectStore: readChoice(
      process.env.OBJECT_STORE_PROVIDER,
      'supabase',
      ['supabase', 's3'] as const,
      'OBJECT_STORE_PROVIDER',
    ),
  }
}
