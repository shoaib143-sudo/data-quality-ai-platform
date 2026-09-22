import { createAdminClient } from '../lib/supabase/admin'
import { executeLineageEnrichment } from '../lib/catalog/lineage-enrichment'

type SourceRow = {
  id: string
  project_id: string
  name: string
  source_type: string
  connection_metadata: Record<string, unknown> | null
}

type DiscoveryRun = {
  id: string
  source_id: string
  catalog_revision_id: string | null
  status: string
  completed_at: string | null
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const required = process.env.POSTGRES_DIRECT_LINEAGE_BACKFILL_REQUIRED === 'true'
const requestedSourceId = process.env.POSTGRES_LINEAGE_SOURCE_ID?.trim() || null
const admin = createAdminClient()

let sourceQuery = admin
  .schema('catalog')
  .from('data_sources')
  .select('id,project_id,name,source_type,connection_metadata')
  .eq('status', 'ACTIVE')
  .eq('source_type', 'JDBC')

if (requestedSourceId) sourceQuery = sourceQuery.eq('id', requestedSourceId)

const { data: sourceRows, error: sourceError } = await sourceQuery.order('created_at')
if (sourceError) throw new Error(`Unable to load JDBC sources: ${sourceError.message}`)

const postgresSources = ((sourceRows ?? []) as SourceRow[]).filter(source => {
  const jdbcUrl = stringField(record(source.connection_metadata), ['jdbc_url', 'jdbcUrl', 'url'])
  return Boolean(jdbcUrl?.toLowerCase().startsWith('jdbc:postgresql:'))
})

if (!postgresSources.length && required) {
  throw new Error('No active PostgreSQL JDBC sources are available for direct lineage backfill.')
}

const evidence: Array<Record<string, unknown>> = []
let totalMappings = 0

for (const source of postgresSources) {
  const { data: runRows, error: runError } = await admin
    .schema('catalog')
    .from('discovery_runs')
    .select('id,source_id,catalog_revision_id,status,completed_at')
    .eq('source_id', source.id)
    .eq('status', 'COMPLETED')
    .not('catalog_revision_id', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)

  if (runError) {
    evidence.push({ sourceId: source.id, sourceName: source.name, status: 'FAILED', error: runError.message })
    continue
  }

  const run = (runRows?.[0] ?? null) as DiscoveryRun | null
  if (!run?.catalog_revision_id) {
    evidence.push({ sourceId: source.id, sourceName: source.name, status: 'SKIPPED', reason: 'NO_PUBLISHED_DISCOVERY_RUN' })
    continue
  }

  try {
    const result = await executeLineageEnrichment({
      sourceId: source.id,
      discoveryRunId: run.id,
      actorUserId: null,
    })
    totalMappings += result.columnMappings
    evidence.push({
      sourceId: source.id,
      sourceName: source.name,
      projectId: source.project_id,
      discoveryRunId: run.id,
      catalogRevisionId: run.catalog_revision_id,
      status: 'COMPLETED',
      engine: result.engine,
      transformations: result.transformations,
      edges: result.edges,
      columnMappings: result.columnMappings,
      warnings: result.warnings,
    })
  } catch (error) {
    evidence.push({
      sourceId: source.id,
      sourceName: source.name,
      discoveryRunId: run.id,
      catalogRevisionId: run.catalog_revision_id,
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Unknown lineage enrichment failure.',
    })
  }
}

const { count: persistedMappings, error: countError } = await admin
  .schema('governance')
  .from('lineage_column_mappings')
  .select('id', { count: 'exact', head: true })

if (countError) throw new Error(`Unable to count persisted lineage mappings: ${countError.message}`)

const summary = {
  status: required && totalMappings < 1 ? 'FAILED' : 'COMPLETED',
  sourcesConsidered: postgresSources.length,
  mappingsPersistedThisRun: totalMappings,
  persistedMappings: persistedMappings ?? 0,
  evidence,
}

console.log(JSON.stringify(summary, null, 2))

if (required && totalMappings < 1) {
  throw new Error('PostgreSQL direct lineage backfill completed without persisting any direct column mappings.')
}
