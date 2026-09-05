import { createAdminClient } from '@/lib/supabase/admin'
import { discoverJdbcCatalog, discoverJdbcTransformations, jdbcEngineFromUrl, validateJdbcConnection, type JdbcTransformation } from '@/lib/connectors/jdbc'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'

type Source = {
  id: string
  project_id: string
  name: string
  source_type: string
  status: string
  connection_metadata: Record<string, unknown> | null
}

type DiscoveredAsset = { asset_type:string; namespace:string|null; name:string; columns:unknown[]; metadata:Record<string,unknown> }
type PersistedLineageAsset = { id:string; dataset_id:string|null; namespace:string; name:string }

type JdbcDiscoveryResult = {
  assets: DiscoveredAsset[]
  snapshot: Record<string, unknown>
  jdbc?: { jdbcUrl:string; credentialRef:string; catalog:string|null; transformations:JdbcTransformation[] }
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
function inferType(value: unknown) {
  if (value === null || value === undefined) return 'unknown'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'datetime'
  return typeof value
}
function qualified(namespace:string|null,name:string){return namespace?`${namespace}.${name}`:name}

async function resolveSourceLocation(source: Source) {
  const admin = createAdminClient()
  const metadata = record(source.connection_metadata)
  const explicit = stringField(metadata, ['source_uri','sourceUri','url','path','file'])
  if (explicit && (/^https?:\/\//i.test(explicit) || explicit.includes('/'))) return { sourceUri: explicit, executionConfig: metadata }

  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,source_identifier').eq('data_source_id', source.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve FILE source dataset: ${datasetError.message}`)
  if (!dataset) return null
  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,source_uri').eq('dataset_id', dataset.id).order('version_number', { ascending: false }).limit(1).maybeSingle()
  if (versionError) throw new Error(`Unable to resolve FILE source version: ${versionError.message}`)
  if (version) {
    const { data: execution, error: executionError } = await admin.schema('profiling').from('dataset_execution_sources').select('source_uri,execution_config').eq('dataset_version_id', version.id).eq('active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (executionError) throw new Error(`Unable to resolve FILE execution source: ${executionError.message}`)
    if (execution?.source_uri) return { sourceUri: execution.source_uri, executionConfig: { ...metadata, ...record(execution.execution_config) } }
    if (version.source_uri) return { sourceUri: version.source_uri, executionConfig: metadata }
  }
  if (dataset.source_identifier) return { sourceUri: dataset.source_identifier, executionConfig: metadata }
  return null
}

async function discoverJdbc(source: Source):Promise<JdbcDiscoveryResult> {
  const metadata = record(source.connection_metadata)
  const jdbcUrl = stringField(metadata, ['jdbc_url','jdbcUrl','url'])
  const credentialRef = stringField(metadata, ['credential_ref','credentialRef','secret_ref','secretRef'])
  const configuredSchema = stringField(metadata, ['schema','schema_name','schemaName'])
  const configuredCatalog = stringField(metadata, ['catalog','catalog_name','catalogName','database','database_name','databaseName'])
  if (!jdbcUrl || !credentialRef) throw new Error('JDBC source discovery requires jdbc_url and credential_ref.')

  const engine=jdbcEngineFromUrl(jdbcUrl)
  const root = await discoverJdbcCatalog({ jdbcUrl, credentialRef, ...(configuredSchema ? { schema: configuredSchema } : {}), ...(configuredCatalog ? { catalog: configuredCatalog } : {}) })
  const schemas = configuredSchema ? [configuredSchema] : root.schemas
  const assets: DiscoveredAsset[] = []
  const transformations:JdbcTransformation[]=[]
  const lineageWarnings:string[]=[]

  const discoverSchema = async (schema: string) => {
    const catalog = configuredSchema === schema ? root : await discoverJdbcCatalog({ jdbcUrl, credentialRef, schema, ...(configuredCatalog ? { catalog: configuredCatalog } : {}) })
    return catalog.tables.map((table) => ({ schema: table.schema || schema, catalog: table.catalog || configuredCatalog, table }))
  }
  const namespaces = schemas.length ? schemas : [configuredSchema || 'public']
  const tableRefs = (await Promise.all(namespaces.map(discoverSchema))).flat()

  for (let index = 0; index < tableRefs.length; index += 5) {
    const batch = tableRefs.slice(index, index + 5)
    const results = await Promise.all(batch.map(async ({ schema, catalog, table }) => {
      const validation = await validateJdbcConnection({ jdbcUrl, credentialRef, schema, table: table.name, catalog })
      const tableType=String(table.type??'TABLE').toUpperCase()
      if(tableType.includes('VIEW')||engine==='DATABRICKS'){
        try{
          const lineage=await discoverJdbcTransformations({jdbcUrl,credentialRef,schema,table:table.name,catalog})
          transformations.push(...lineage.transformations)
          lineageWarnings.push(...lineage.warnings)
        }catch(error){lineageWarnings.push(`Transformation discovery failed for ${qualified(schema,table.name)}: ${error instanceof Error?error.message:'unknown error'}`)}
      }
      return {
        asset_type: tableType,
        namespace: [catalog,schema].filter(Boolean).join('.') || schema,
        name: table.name,
        columns: validation.columns,
        metadata: {
          source_type: 'JDBC',
          jdbc_engine: engine,
          catalog: catalog??null,
          schema,
          table_type: table.type ?? null,
          remarks: table.remarks??null,
          row_count: validation.rowCount,
          validation_errors: validation.errors,
          validation_warnings: validation.warnings,
          validation_details: validation.details,
        },
      }
    }))
    assets.push(...results)
  }

  const uniqueTransformations=[...new Map(transformations.map(item=>[`${item.sourceAsset??''}->${item.targetAsset??''}:${item.logicHash}`,item])).values()]
  const columnMappingCount=uniqueTransformations.reduce((total,item)=>total+(item.columnMappings?.length??0),0)
  return {
    assets,
    snapshot: {
      source_type: 'JDBC',
      jdbc_engine: engine,
      schemas: root.schemas,
      configured_schema: configuredSchema,
      configured_catalog: configuredCatalog,
      asset_count: assets.length,
      transformation_count: uniqueTransformations.length,
      column_mapping_count: columnMappingCount,
      catalog_details: root.details,
      lineage_warnings: [...new Set(lineageWarnings)],
      discovery_truncated: false,
    },
    jdbc:{jdbcUrl,credentialRef,catalog:configuredCatalog,transformations:uniqueTransformations},
  }
}

async function discoverFile(source: Source):Promise<JdbcDiscoveryResult> {
  const location = await resolveSourceLocation(source)
  if (!location) throw new Error('FILE source has no executable URL, Supabase Storage path, or registered dataset execution location.')
  const admin = createAdminClient()
  const loaded = await loadFileSource(admin, location, { maxRows: 100 })
  const columnNames = Array.from(loaded.rows.reduce<Set<string>>((names, row) => { Object.keys(row).forEach((name) => names.add(name)); return names }, new Set()))
  const columns = columnNames.map((name) => {
    const sample = loaded.rows.find((row) => row[name] !== null && row[name] !== undefined)?.[name]
    return { name, type: inferType(sample) }
  })
  const name = String(loaded.metadata.file_name ?? source.name)
  return {
    assets: [{ asset_type: loaded.format === 'binary' ? 'FILE_METADATA' : 'FILE', namespace: null, name, columns, metadata: { ...loaded.metadata, format: loaded.format, content_type: loaded.contentType, row_count: loaded.rowCount, sampled_rows: loaded.rows.length, warnings: loaded.warnings } }],
    snapshot: { source_type: source.source_type, source_uri: loaded.sourceUri, format: loaded.format, content_type: loaded.contentType, asset_count: 1, metadata: loaded.metadata, warnings: loaded.warnings },
  }
}

function sqlDependencies(logic:string){
  const result:string[]=[];const regex=/\b(?:from|join|using)\s+([`"\[]?[A-Za-z_][A-Za-z0-9_$#@-]*(?:\.[`"\[]?[A-Za-z_][A-Za-z0-9_$#@-]*){0,2}[`"\]]?)/gi;let match:RegExpExecArray|null
  while((match=regex.exec(logic)))result.push(match[1].replace(/[`"\[\]]/g,''))
  return [...new Set(result.map(value=>value.toLowerCase()))]
}

function splitLineageAsset(fullName:string){
  const parts=fullName.split('.').map(part=>part.trim()).filter(Boolean)
  return{namespace:parts.length>1?parts.slice(0,-1).join('.'):'',name:parts.at(-1)??fullName}
}

async function persistJdbcLineage(source:Source,runId:string,assets:DiscoveredAsset[],transformations:JdbcTransformation[]){
  if(!transformations.length)return{transformations:0,edges:0,columnMappings:0}
  const admin=createAdminClient()
  const engine=transformations[0]?.engine||'JDBC'
  const {data:integration,error:integrationError}=await admin.schema('governance').from('lineage_integrations').upsert({project_id:source.project_id,source_key:`jdbc-source:${source.id}`,name:`${source.name} JDBC metadata lineage`,integration_type:engine,enabled:true},{onConflict:'project_id,source_key'}).select('id').single()
  if(integrationError||!integration)throw new Error(`Unable to register JDBC lineage integration: ${integrationError?.message??'unknown error'}`)

  const assetByKey=new Map<string,PersistedLineageAsset>()
  const registeredDatasets=await admin.schema('catalog').from('datasets').select('id,name,source_identifier').eq('project_id',source.project_id).eq('data_source_id',source.id)
  if(registeredDatasets.error)throw new Error(`Unable to resolve registered JDBC datasets for lineage: ${registeredDatasets.error.message}`)

  for(const asset of assets){
    const namespace=asset.namespace??''
    const full=qualified(namespace,asset.name)
    const dataset=(registeredDatasets.data??[]).find(row=>[row.name,row.source_identifier].filter(Boolean).some(value=>String(value).toLowerCase()===asset.name.toLowerCase()||String(value).toLowerCase()===full.toLowerCase()))
    const {data,error}=await admin.schema('governance').from('lineage_assets').upsert({project_id:source.project_id,integration_id:integration.id,namespace,name:asset.name,asset_type:asset.asset_type,dataset_id:dataset?.id??null,metadata:{source_id:source.id,discovery_run_id:runId,auto_discovered:true},last_seen_at:new Date().toISOString()},{onConflict:'project_id,namespace,name,asset_type'}).select('id,dataset_id,namespace,name').single()
    if(error||!data)throw new Error(`Unable to register JDBC lineage asset ${full}: ${error?.message??'unknown error'}`)
    assetByKey.set(asset.name.toLowerCase(),data);assetByKey.set(full.toLowerCase(),data)
  }

  const resolveAsset=async(fullName:string,authoritative=false)=>{
    const key=fullName.toLowerCase()
    const existing=assetByKey.get(key)||assetByKey.get(key.split('.').at(-1)!)
    if(existing)return existing
    const parts=splitLineageAsset(fullName)
    const {data,error}=await admin.schema('governance').from('lineage_assets').upsert({project_id:source.project_id,integration_id:integration.id,namespace:parts.namespace,name:parts.name,asset_type:'DATASET',metadata:{source_id:source.id,discovery_run_id:runId,dependency_only:true,authoritative_lineage_source:authoritative?'DATABRICKS_SYSTEM_LINEAGE':undefined},last_seen_at:new Date().toISOString()},{onConflict:'project_id,namespace,name,asset_type'}).select('id,dataset_id,namespace,name').single()
    if(error||!data)throw new Error(`Unable to register JDBC lineage dependency ${fullName}: ${error?.message??'unknown error'}`)
    assetByKey.set(key,data);assetByKey.set(parts.name.toLowerCase(),data)
    return data as PersistedLineageAsset
  }

  let edges=0
  let columnMappings=0
  for(const transformation of transformations){
    const structured=Boolean(transformation.sourceAsset&&transformation.targetAsset)
    const externalId=structured?`databricks-lineage:${transformation.logicHash}`:[transformation.catalog,transformation.schema,transformation.name].filter(Boolean).join('.')
    const {data:t,error:tError}=await admin.schema('governance').from('lineage_transformations').upsert({project_id:source.project_id,integration_id:integration.id,external_id:externalId,source_system:transformation.engine||engine,name:transformation.name,operation:transformation.operation||'VIEW',logic_language:transformation.transformationLogic?'SQL':null,transformation_logic:transformation.transformationLogic||null,logic_hash:transformation.logicHash,metadata:{source_id:source.id,discovery_run_id:runId,catalog:transformation.catalog??null,schema:transformation.schema??null,...(transformation.metadata??{})},last_seen_at:new Date().toISOString()},{onConflict:'project_id,integration_id,external_id'}).select('id').single()
    if(tError||!t)throw new Error(`Unable to persist JDBC transformation ${externalId}: ${tError?.message??'unknown error'}`)

    if(structured){
      const sourceAsset=await resolveAsset(transformation.sourceAsset!,true)
      const targetAsset=await resolveAsset(transformation.targetAsset!,true)
      const {error:edgeError}=await admin.schema('governance').from('lineage_edges').upsert({project_id:source.project_id,source_type:sourceAsset.dataset_id?'DATASET':'EXTERNAL_ASSET',source_id:sourceAsset.dataset_id??sourceAsset.id,target_type:targetAsset.dataset_id?'DATASET':'EXTERNAL_ASSET',target_id:targetAsset.dataset_id??targetAsset.id,relationship:'TRANSFORMS_TO',transformation_id:t.id,metadata:{source_id:source.id,discovery_run_id:runId,operation:transformation.operation,logic_hash:transformation.logicHash,auto_discovered:true,authoritative_source:transformation.metadata?.authoritative_source??'DATABRICKS_SYSTEM_LINEAGE'}},{onConflict:'project_id,source_type,source_id,target_type,target_id,relationship,transformation_id'})
      if(!edgeError)edges+=1

      if(transformation.columnMappings?.length){
        const {error:deleteError}=await admin.schema('governance').from('lineage_column_mappings').delete().eq('transformation_id',t.id)
        if(deleteError)throw new Error(`Unable to refresh Databricks column mappings for ${externalId}: ${deleteError.message}`)
        const mappingRows=[]
        for(const mapping of transformation.columnMappings){
          const mappingSource=await resolveAsset(mapping.sourceAsset||transformation.sourceAsset!,true)
          const mappingTarget=await resolveAsset(mapping.targetAsset||transformation.targetAsset!,true)
          mappingRows.push({project_id:source.project_id,transformation_id:t.id,source_asset_id:mappingSource.id,source_column:mapping.sourceColumn,target_asset_id:mappingTarget.id,target_column:mapping.targetColumn,operation:mapping.operation??transformation.operation,expression:mapping.expression??null,metadata:{source_id:source.id,discovery_run_id:runId,auto_discovered:true,authoritative_source:'system.access.column_lineage',...(mapping.metadata??{})}})
        }
        if(mappingRows.length){
          const {error:mappingError}=await admin.schema('governance').from('lineage_column_mappings').insert(mappingRows)
          if(mappingError)throw new Error(`Unable to persist Databricks column mappings for ${externalId}: ${mappingError.message}`)
          columnMappings+=mappingRows.length
        }
      }
      continue
    }

    const targetKey=[transformation.catalog,transformation.schema,transformation.name].filter(Boolean).join('.').toLowerCase()
    const target=assetByKey.get(targetKey)||assetByKey.get([transformation.schema,transformation.name].filter(Boolean).join('.').toLowerCase())||assetByKey.get(transformation.name.toLowerCase())
    if(!target)continue
    for(const dependency of sqlDependencies(transformation.transformationLogic)){
      const sourceAsset=await resolveAsset(dependency)
      const {error}=await admin.schema('governance').from('lineage_edges').upsert({project_id:source.project_id,source_type:sourceAsset.dataset_id?'DATASET':'EXTERNAL_ASSET',source_id:sourceAsset.dataset_id??sourceAsset.id,target_type:target.dataset_id?'DATASET':'EXTERNAL_ASSET',target_id:target.dataset_id??target.id,relationship:'TRANSFORMS_TO',transformation_id:t.id,metadata:{source_id:source.id,discovery_run_id:runId,operation:transformation.operation,logic_hash:transformation.logicHash,auto_discovered:true}},{onConflict:'project_id,source_type,source_id,target_type,target_id,relationship,transformation_id'})
      if(!error)edges+=1
    }
  }
  return{transformations:transformations.length,edges,columnMappings}
}

export async function executeMetadataDiscovery(sourceId: string) {
  const admin = createAdminClient()
  const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status,connection_metadata').eq('id', sourceId).maybeSingle()
  if (sourceError || !source) throw new Error(`Unable to resolve discovery source: ${sourceError?.message ?? 'not found'}`)
  if (!['ACTIVE','CONFIGURED'].includes(String(source.status).toUpperCase())) throw new Error('Source must be ACTIVE or CONFIGURED before metadata discovery.')
  const typedSource = source as Source
  const { data: run, error: runError } = await admin.schema('catalog').from('discovery_runs').insert({ project_id: source.project_id, source_id: source.id, status: 'RUNNING' }).select('id').single()
  if (runError || !run) throw new Error(`Unable to create metadata discovery run: ${runError?.message ?? 'unknown error'}`)

  try {
    const sourceType = String(source.source_type).toUpperCase()
    const result = sourceType === 'JDBC' ? await discoverJdbc(typedSource) : ['FILE','CSV'].includes(sourceType) ? await discoverFile(typedSource) : { assets: [], snapshot: { source_type: sourceType, asset_count: 0, warning: 'No discovery adapter is registered for this source type.' } } as JdbcDiscoveryResult
    if (result.assets.length) {
      const { error: assetsError } = await admin.schema('catalog').from('discovered_assets').insert(result.assets.map((asset) => ({ discovery_run_id: run.id, source_id: source.id, asset_type: asset.asset_type, namespace: asset.namespace, name: asset.name, columns: asset.columns, metadata: asset.metadata })))
      if (assetsError) throw new Error(`Unable to persist discovered assets: ${assetsError.message}`)
    }

    let lineage={transformations:0,edges:0,columnMappings:0}
    if(sourceType==='JDBC'&&result.jdbc)lineage=await persistJdbcLineage(typedSource,run.id,result.assets,result.jdbc.transformations)
    const completedAt = new Date().toISOString()
    const finalSnapshot={...result.snapshot,lineage}
    const { error: completeError } = await admin.schema('catalog').from('discovery_runs').update({ status: 'COMPLETED', assets_discovered: result.assets.length, schema_snapshot: finalSnapshot, completed_at: completedAt }).eq('id', run.id)
    if (completeError) throw new Error(`Unable to complete discovery run: ${completeError.message}`)

    const { data: datasets, error: datasetsError } = await admin.schema('catalog').from('datasets').select('id').eq('data_source_id', source.id)
    if (datasetsError) throw new Error(`Unable to resolve discovery lineage datasets: ${datasetsError.message}`)
    for (const dataset of datasets ?? []) {
      const { error: lineageError } = await admin.schema('governance').from('lineage_edges').upsert({ project_id: source.project_id, source_type: 'DATA_SOURCE', source_id: source.id, target_type: 'DATASET', target_id: dataset.id, relationship: 'DISCOVERED_SOURCE', transformation_id: null, metadata: { discovery_run_id: run.id, assets_discovered: result.assets.length, discovered_at: completedAt } }, { onConflict: 'project_id,source_type,source_id,target_type,target_id,relationship,transformation_id' })
      if (lineageError) console.error('[metadata-discovery-lineage]', lineageError.message)
    }
    return { discoveryRunId: run.id, sourceId: source.id, assetsDiscovered: result.assets.length, transformationsDiscovered:lineage.transformations, lineageEdges:lineage.edges, lineageColumnMappings:lineage.columnMappings, snapshot: finalSnapshot }
  } catch (error) {
    await admin.schema('catalog').from('discovery_runs').update({ status: 'FAILED', error_message: error instanceof Error ? error.message : 'Metadata discovery failed.', completed_at: new Date().toISOString() }).eq('id', run.id)
    throw error
  }
}
