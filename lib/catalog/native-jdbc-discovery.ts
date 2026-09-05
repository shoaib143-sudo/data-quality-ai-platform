import { jdbcEngineFromUrl, type JdbcTransformation } from '@/lib/connectors/jdbc'
import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'
import { hierarchySelection, selectedObjectNodes, type NativeHierarchyNode } from '@/lib/connectors/native-hierarchy'

export type NativeDiscoveredAsset = {
  asset_type: string
  namespace: string | null
  name: string
  columns: unknown[]
  metadata: Record<string, unknown>
}

export type NativeJdbcDiscoveryResult = {
  assets: NativeDiscoveredAsset[]
  snapshot: Record<string, unknown>
  jdbc: { jdbcUrl: string; credentialRef: string; catalog: string | null; transformations: JdbcTransformation[] }
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function assetNamespace(node: NativeHierarchyNode) {
  if (node.catalog && node.schema) return `${node.catalog}.${node.schema}`
  return node.schema || node.catalog || null
}

function objectFields(nodes: NativeHierarchyNode[], object: NativeHierarchyNode) {
  return nodes
    .filter(node => node.kind === 'FIELD' && node.parentId === object.id)
    .sort((left, right) => (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name))
    .map(node => ({
      name: node.name,
      type: node.dataType ?? null,
      nullable: typeof node.metadata?.nullable === 'boolean' ? node.metadata.nullable : null,
      defaultValue: typeof node.metadata?.default_value === 'string' ? node.metadata.default_value : null,
      ordinal: node.ordinal ?? null,
      native_type: node.nativeType,
      qualified_name: node.qualifiedName,
      metadata: node.metadata ?? {},
    }))
}

export async function discoverJdbcFromNativeHierarchy(connectionMetadata: Record<string, unknown>): Promise<NativeJdbcDiscoveryResult> {
  const metadata = record(connectionMetadata)
  const jdbcUrl = stringField(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
  const credentialRef = stringField(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
  if (!jdbcUrl || !credentialRef) throw new Error('JDBC source discovery requires jdbc_url and credential_ref.')

  const hierarchy = await discoverNativeHierarchy({ jdbcUrl, credentialRef })
  const selection = hierarchySelection(metadata.hierarchy_selection)
  const objects = selectedObjectNodes(hierarchy, selection)
    .filter(node => !node.system)
    .sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName))
  const engine = jdbcEngineFromUrl(jdbcUrl)
  const assets: NativeDiscoveredAsset[] = []
  let discoveredFieldCount = 0

  for (const object of objects) {
    // Technical metadata discovery always captures the complete field definition for an
    // included object. Field-level selection is preserved as downstream governance intent,
    // but must not create an intentionally incomplete digital representation of the object.
    const columns = objectFields(hierarchy.nodes, object)
    discoveredFieldCount += columns.length
    const objectType = String(object.objectType ?? object.nativeType ?? 'OBJECT').toUpperCase()
    const namespace = assetNamespace(object)

    assets.push({
      asset_type: objectType,
      namespace,
      name: object.name,
      columns,
      metadata: {
        source_type: 'JDBC',
        jdbc_engine: engine,
        database_product: hierarchy.databaseProduct,
        database_version: hierarchy.databaseVersion,
        native_type: object.nativeType,
        native_qualified_name: object.qualifiedName,
        catalog: object.catalog ?? null,
        schema: object.schema ?? null,
        object_type: object.objectType ?? object.nativeType,
        hierarchy_node_id: object.id,
        hierarchy_selection_mode: selection.mode,
        metadata_discovery_field_scope: 'FULL_OBJECT',
        native_metadata: object.metadata ?? {},
      },
    })
  }

  const catalogs = [...new Set(objects.map(node => node.catalog).filter((value): value is string => Boolean(value)))]
  const schemas = [...new Set(objects.map(node => node.schema).filter((value): value is string => Boolean(value)))]
  const complete = !hierarchy.truncated && assets.length === objects.length
  const consistencyMode = 'BEST_EFFORT_RECONCILIATION'
  const discoveryManifest = {
    expected_object_count: objects.length,
    expected_field_count: discoveredFieldCount,
    observed_object_count: assets.length,
    observed_field_count: discoveredFieldCount,
    failed_item_count: 0,
    truncated: hierarchy.truncated,
    complete,
    consistency_mode: consistencyMode,
    provider_hierarchy_node_count: hierarchy.nodes.length,
  }

  return {
    assets,
    snapshot: {
      source_type: 'JDBC',
      jdbc_engine: engine,
      database_product: hierarchy.databaseProduct,
      database_version: hierarchy.databaseVersion,
      native_terms: hierarchy.terms,
      hierarchy_selection: selection,
      hierarchy_node_count: hierarchy.nodes.length,
      scoped_object_count: objects.length,
      scoped_field_count: discoveredFieldCount,
      catalogs,
      schemas,
      asset_count: assets.length,
      hierarchy_details: hierarchy.details,
      hierarchy_warnings: hierarchy.warnings,
      discovery_truncated: hierarchy.truncated,
      discovery_manifest: discoveryManifest,
      consistency_mode: consistencyMode,
      lineage_candidate_count: objects.filter(object => String(object.objectType ?? object.nativeType ?? '').toUpperCase().includes('VIEW') || engine === 'DATABRICKS').length,
      lineage_enrichment_status: 'DEFERRED',
    },
    jdbc: {
      jdbcUrl,
      credentialRef,
      catalog: catalogs.length === 1 ? catalogs[0] : null,
      // Lineage is intentionally a downstream enrichment. Factual physical metadata
      // publication must never wait on lineage permissions, APIs, or AI processing.
      transformations: [],
    },
  }
}
