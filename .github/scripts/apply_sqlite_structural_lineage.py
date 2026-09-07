from pathlib import Path

p = Path('lib/catalog/lineage-enrichment.ts')
text = p.read_text()

def replace(old: str, new: str, count: int = -1) -> None:
    global text
    if old not in text:
        raise SystemExit(f'Expected lineage patch anchor missing: {old[:140]!r}')
    text = text.replace(old, new, count)

replace(
    "  if (!inputTransformations.length) return { transformations: 0, edges: 0, columnMappings: 0 }\n  const engine = String(inputTransformations[0]?.engine || 'JDBC').toUpperCase()\n",
    "  const sourceJdbcUrl = stringField(record(source.connection_metadata), ['jdbc_url', 'jdbcUrl', 'url']) ?? ''\n  const engine = String(inputTransformations[0]?.engine || jdbcEngineFromUrl(sourceJdbcUrl) || 'JDBC').toUpperCase()\n",
)
replace(
    "  if (!transformations.length) return governed\n\n  const admin = createAdminClient()\n",
    "  const admin = createAdminClient()\n",
)
replace(
    "  let edges = 0\n  let columnMappings = 0\n  for (const transformation of transformations) {\n",
    '''  let edges = 0
  let columnMappings = 0
  let structuralEdges = 0

  for (const asset of assets) {
    const nativeMetadata = record(record(asset.metadata).native_metadata)
    const foreignKeys = Array.isArray(nativeMetadata.foreign_keys) ? nativeMetadata.foreign_keys.map(record) : []
    const sourceAsset = assetByKey.get(qualified(asset.namespace, asset.name).toLowerCase()) ?? assetByKey.get(asset.name.toLowerCase())
    if (!sourceAsset) continue
    for (const foreignKey of foreignKeys) {
      const targetTable = stringField(foreignKey, ['target_table'])
      if (!targetTable) continue
      const targetNamespace = uniqueStrings([
        stringField(foreignKey, ['target_catalog']),
        stringField(foreignKey, ['target_schema']),
      ]).join('.')
      const targetFull = qualified(targetNamespace || null, targetTable)
      const targetAsset = assetByKey.get(targetFull.toLowerCase()) ?? assetByKey.get(targetTable.toLowerCase())
      if (!targetAsset) continue
      const { error: edgeError } = await admin.schema('governance').from('lineage_edges').upsert({
        project_id: source.project_id,
        source_type: sourceAsset.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        source_id: sourceAsset.dataset_id ?? sourceAsset.id,
        target_type: targetAsset.dataset_id ? 'DATASET' : 'EXTERNAL_ASSET',
        target_id: targetAsset.dataset_id ?? targetAsset.id,
        relationship: 'REFERENCES',
        transformation_id: null,
        metadata: {
          source_id: source.id,
          discovery_run_id: discoveryRunId,
          catalog_revision_id: catalogRevisionId,
          authoritative_source: 'JDBC_DATABASE_METADATA_IMPORTED_KEYS',
          authority_class: 'SOURCE_OBSERVED_RELATIONSHIP',
          source_observed: true,
          foreign_key_name: stringField(foreignKey, ['name']),
          source_column: stringField(foreignKey, ['source_column']),
          target_column: stringField(foreignKey, ['target_column']),
          key_sequence: foreignKey.key_sequence ?? null,
          auto_discovered: true,
        },
      }, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship,transformation_id' })
      if (edgeError) throw new Error(`Unable to persist source-observed JDBC foreign key ${asset.name} -> ${targetTable}: ${edgeError.message}`)
      structuralEdges += 1
    }
  }

  for (const transformation of transformations) {
''',
)
replace(
    "  return { transformations: governed.transformations + transformations.length, edges: governed.edges + edges, columnMappings: governed.columnMappings + columnMappings }\n",
    "  return { transformations: governed.transformations + transformations.length, edges: governed.edges + structuralEdges + edges, columnMappings: governed.columnMappings + columnMappings }\n",
)
replace(
    "  const authoritativeSources = engine === 'DATABRICKS' ? ['system.access.column_lineage', 'system.access.table_lineage'] : []\n",
    "  const authoritativeSources = engine === 'DATABRICKS'\n    ? ['system.access.column_lineage', 'system.access.table_lineage']\n    : engine === 'SQLITE'\n      ? ['JDBC_DATABASE_METADATA_IMPORTED_KEYS']\n      : []\n",
)

p.write_text(text)
