import { jdbcEngineFromUrl, type JdbcTransformation } from '@/lib/connectors/jdbc'
import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'
import { hierarchySelection, nodeInSelection, selectedObjectNodes, type NativeHierarchyNode, type NativeHierarchyResult, type NativeHierarchySelection } from '@/lib/connectors/native-hierarchy'

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

export type NativeDiscoveryCheckpointAdapter = {
  load: (partitionKey: string) => Promise<{ assets: NativeDiscoveredAsset[]; snapshot: Record<string, unknown> } | null>
  save: (partitionKey: string, assets: NativeDiscoveredAsset[], snapshot: Record<string, unknown>) => Promise<void>
}

type PartitionResult = {
  assets: NativeDiscoveredAsset[]
  objects: NativeHierarchyNode[]
  fieldCount: number
  failedItemCount: number
  hierarchyNodeCount: number
  warnings: string[]
  truncated: boolean
  hierarchy: NativeHierarchyResult
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
      native_id: node.nativeId ?? null,
      qualified_name: node.qualifiedName,
      metadata: node.metadata ?? {},
    }))
}

function nativeIdentity(hierarchy: NativeHierarchyResult, object: NativeHierarchyNode) {
  if (!object.nativeId) return null
  return {
    provider: hierarchy.databaseProduct,
    kind: object.kind,
    id: object.nativeId,
    immutable: true,
  }
}

function fieldReadFailureCount(warnings: string[]) {
  return warnings.filter(warning => /unable to read fields for/i.test(warning)).length
}

function buildPartition(hierarchy: NativeHierarchyResult, selection: NativeHierarchySelection, engine: string): PartitionResult {
  const objects = selectedObjectNodes(hierarchy, selection)
    .sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName))
  const assets: NativeDiscoveredAsset[] = []
  let fieldCount = 0

  for (const object of objects) {
    // Physical discovery always captures the full object definition. Field-level choices are
    // downstream governance intent and never create a deliberately incomplete physical fact.
    const columns = objectFields(hierarchy.nodes, object)
    fieldCount += columns.length
    const objectType = String(object.objectType ?? object.nativeType ?? 'OBJECT').toUpperCase()
    const namespace = assetNamespace(object)
    const identity = nativeIdentity(hierarchy, object)

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
        native_identity: identity,
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

  return {
    assets,
    objects,
    fieldCount,
    failedItemCount: fieldReadFailureCount(hierarchy.warnings),
    hierarchyNodeCount: hierarchy.nodes.length,
    warnings: hierarchy.warnings,
    truncated: hierarchy.truncated,
    hierarchy,
  }
}

function cachedPartition(value: { assets: NativeDiscoveredAsset[]; snapshot: Record<string, unknown> }, engine: string, selection: NativeHierarchySelection): PartitionResult {
  const snapshot = record(value.snapshot)
  const assets = value.assets
  const fieldCount = assets.reduce((total, asset) => total + asset.columns.length, 0)
  const warnings = Array.isArray(snapshot.hierarchy_warnings) ? snapshot.hierarchy_warnings.filter((item): item is string => typeof item === 'string') : []
  const product = stringField(snapshot, ['database_product']) ?? engine
  return {
    assets,
    objects: [],
    fieldCount,
    failedItemCount: Number(snapshot.failed_item_count ?? 0) || 0,
    hierarchyNodeCount: Number(snapshot.hierarchy_node_count ?? 0) || 0,
    warnings,
    truncated: snapshot.discovery_truncated === true,
    hierarchy: {
      databaseProduct: product,
      databaseVersion: stringField(snapshot, ['database_version']),
      terms: record(snapshot.native_terms) as NativeHierarchyResult['terms'],
      nodes: [],
      rootIds: [],
      warnings,
      truncated: snapshot.discovery_truncated === true,
      details: record(snapshot.hierarchy_details),
    },
  }
}

function partitionSnapshot(result: PartitionResult, partitionKey: string) {
  return {
    partition_key: partitionKey,
    database_product: result.hierarchy.databaseProduct,
    database_version: result.hierarchy.databaseVersion,
    native_terms: result.hierarchy.terms,
    hierarchy_node_count: result.hierarchyNodeCount,
    hierarchy_details: result.hierarchy.details,
    hierarchy_warnings: result.warnings,
    discovery_truncated: result.truncated,
    failed_item_count: result.failedItemCount,
    object_count: result.assets.length,
    field_count: result.fieldCount,
  }
}

export async function discoverJdbcFromNativeHierarchy(
  connectionMetadata: Record<string, unknown>,
  checkpoint?: NativeDiscoveryCheckpointAdapter,
): Promise<NativeJdbcDiscoveryResult> {
  const metadata = record(connectionMetadata)
  const jdbcUrl = stringField(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
  const credentialRef = stringField(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
  if (!jdbcUrl || !credentialRef) throw new Error('JDBC source discovery requires jdbc_url and credential_ref.')

  const engine = jdbcEngineFromUrl(jdbcUrl)
  const selection = hierarchySelection(metadata.hierarchy_selection)
  const partitionResults: PartitionResult[] = []
  const partitionKeys: string[] = []
  let rootHierarchy: NativeHierarchyResult

  if (engine === 'DATABRICKS') {
    rootHierarchy = await discoverNativeHierarchy({ jdbcUrl, credentialRef, rootsOnly: true })
    const catalogs = rootHierarchy.nodes
      .filter(node => node.kind === 'CATALOG' && nodeInSelection(node, selection))
      .sort((left, right) => left.qualifiedName.localeCompare(right.qualifiedName))

    for (const catalog of catalogs) {
      const partitionKey = `catalog:${catalog.qualifiedName}`
      partitionKeys.push(partitionKey)
      const cached = checkpoint ? await checkpoint.load(partitionKey) : null
      if (cached) {
        partitionResults.push(cachedPartition(cached, engine, selection))
        continue
      }
      const hierarchy = await discoverNativeHierarchy({ jdbcUrl, credentialRef, catalogs: [catalog.name] })
      const result = buildPartition(hierarchy, selection, engine)
      if (checkpoint) await checkpoint.save(partitionKey, result.assets, partitionSnapshot(result, partitionKey))
      partitionResults.push(result)
    }
  } else {
    const partitionKey = 'root'
    partitionKeys.push(partitionKey)
    const cached = checkpoint ? await checkpoint.load(partitionKey) : null
    if (cached) {
      const result = cachedPartition(cached, engine, selection)
      partitionResults.push(result)
      rootHierarchy = result.hierarchy
    } else {
      rootHierarchy = await discoverNativeHierarchy({ jdbcUrl, credentialRef })
      const result = buildPartition(rootHierarchy, selection, engine)
      if (checkpoint) await checkpoint.save(partitionKey, result.assets, partitionSnapshot(result, partitionKey))
      partitionResults.push(result)
    }
  }

  const assets = partitionResults.flatMap(result => result.assets)
  const fieldCount = assets.reduce((total, asset) => total + asset.columns.length, 0)
  const warnings = [...new Set([...rootHierarchy.warnings, ...partitionResults.flatMap(result => result.warnings)])]
  const failedItemCount = partitionResults.reduce((total, result) => total + result.failedItemCount, 0)
  const truncated = rootHierarchy.truncated || partitionResults.some(result => result.truncated)
  const catalogs = [...new Set(assets.map(asset => stringField(record(asset.metadata), ['catalog'])).filter((value): value is string => Boolean(value)))]
  const schemas = [...new Set(assets.map(asset => stringField(record(asset.metadata), ['schema'])).filter((value): value is string => Boolean(value)))]
  const hierarchyNodeCount = rootHierarchy.nodes.length + partitionResults.reduce((total, result) => total + result.hierarchyNodeCount, 0)
  const complete = !truncated && failedItemCount === 0
  const consistencyMode = 'BEST_EFFORT_RECONCILIATION'
  const capabilities = record(record(rootHierarchy.details).capabilities)
  const stableIdentityCount = assets.filter(asset => Boolean(record(asset.metadata).native_identity)).length
  const discoveryManifest = {
    expected_object_count: assets.length,
    expected_field_count: fieldCount,
    observed_object_count: assets.length,
    observed_field_count: fieldCount,
    failed_item_count: failedItemCount,
    truncated,
    complete,
    consistency_mode: consistencyMode,
    provider_hierarchy_node_count: hierarchyNodeCount,
    partition_count: partitionKeys.length,
  }

  return {
    assets,
    snapshot: {
      source_type: 'JDBC',
      jdbc_engine: engine,
      database_product: rootHierarchy.databaseProduct,
      database_version: rootHierarchy.databaseVersion,
      native_terms: rootHierarchy.terms,
      hierarchy_selection: selection,
      hierarchy_node_count: hierarchyNodeCount,
      scoped_object_count: assets.length,
      scoped_field_count: fieldCount,
      catalogs,
      schemas,
      asset_count: assets.length,
      hierarchy_details: rootHierarchy.details,
      hierarchy_warnings: warnings,
      discovery_truncated: truncated,
      discovery_manifest: discoveryManifest,
      consistency_mode: consistencyMode,
      partition_keys: partitionKeys,
      partition_count: partitionKeys.length,
      stable_native_identity_count: stableIdentityCount,
      connector_capabilities: capabilities,
      lineage_candidate_count: assets.filter(asset => String(asset.asset_type).includes('VIEW') || engine === 'DATABRICKS').length,
      lineage_enrichment_status: 'DEFERRED',
    },
    jdbc: {
      jdbcUrl,
      credentialRef,
      catalog: catalogs.length === 1 ? catalogs[0] : null,
      transformations: [],
    },
  }
}
