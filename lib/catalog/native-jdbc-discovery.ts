import { discoverJdbcTransformations, jdbcEngineFromUrl, type JdbcTransformation } from '@/lib/connectors/jdbc'
import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'
import { hierarchySelection, selectedFieldNamesForObject, selectedObjectNodes, type NativeHierarchyNode } from '@/lib/connectors/native-hierarchy'

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

function objectFields(nodes: NativeHierarchyNode[], object: NativeHierarchyNode, selectedNames: Set<string> | null) {
  return nodes
    .filter(node => node.kind === 'FIELD' && node.parentId === object.id && (!selectedNames || selectedNames.has(node.name)))
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

function dedupeTransformations(transformations: JdbcTransformation[]) {
  return [...new Map(transformations.map(item => [
    `${item.sourceAsset ?? ''}->${item.targetAsset ?? ''}:${item.logicHash}:${item.catalog ?? ''}:${item.schema ?? ''}:${item.name}`,
    item,
  ])).values()]
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
  const transformations: JdbcTransformation[] = []
  const lineageWarnings: string[] = [...hierarchy.warnings]
  let selectedFieldCount = 0

  for (const object of objects) {
    const selectedFields = selectedFieldNamesForObject(hierarchy, selection, object)
    const columns = objectFields(hierarchy.nodes, object, selectedFields)
    selectedFieldCount += columns.length
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
        field_selection: selectedFields ? 'SELECTED' : 'ALL',
        native_metadata: object.metadata ?? {},
      },
    })

    if (objectType.includes('VIEW') || engine === 'DATABRICKS') {
      if (!object.schema && !object.catalog) {
        lineageWarnings.push(`Transformation discovery skipped for ${object.qualifiedName}: the source did not report a catalog/database or schema namespace.`)
        continue
      }
      try {
        const lineage = await discoverJdbcTransformations({
          jdbcUrl,
          credentialRef,
          catalog: object.catalog ?? null,
          schema: object.schema ?? null,
          table: object.name,
        })
        transformations.push(...lineage.transformations)
        lineageWarnings.push(...lineage.warnings)
      } catch (error) {
        lineageWarnings.push(`Transformation discovery failed for ${object.qualifiedName}: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
    }
  }

  const uniqueTransformations = dedupeTransformations(transformations)
  const columnMappingCount = uniqueTransformations.reduce((total, item) => total + (item.columnMappings?.length ?? 0), 0)
  const catalogs = [...new Set(objects.map(node => node.catalog).filter((value): value is string => Boolean(value)))]
  const schemas = [...new Set(objects.map(node => node.schema).filter((value): value is string => Boolean(value)))]

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
      scoped_field_count: selectedFieldCount,
      catalogs,
      schemas,
      asset_count: assets.length,
      transformation_count: uniqueTransformations.length,
      column_mapping_count: columnMappingCount,
      hierarchy_details: hierarchy.details,
      hierarchy_warnings: hierarchy.warnings,
      lineage_warnings: [...new Set(lineageWarnings)],
      discovery_truncated: hierarchy.truncated,
    },
    jdbc: {
      jdbcUrl,
      credentialRef,
      catalog: catalogs.length === 1 ? catalogs[0] : null,
      transformations: uniqueTransformations,
    },
  }
}
