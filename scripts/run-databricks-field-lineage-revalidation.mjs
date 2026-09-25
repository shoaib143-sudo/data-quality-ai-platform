import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function required(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function jwtShaped(value) {
  return value.split('.').length === 3
}

function tableParts(fullName) {
  const parts = required(fullName, 'Databricks table').split('.').map(part => part.trim()).filter(Boolean)
  if (parts.length !== 3) throw new Error(`Expected catalog.schema.table, received ${fullName}.`)
  return { catalog: parts[0], schema: parts[1], table: parts[2] }
}

function lineageAsset(fullName, metadata) {
  const parts = tableParts(fullName)
  return {
    namespace: `${parts.catalog}.${parts.schema}`,
    name: parts.table,
    assetType: 'DATASET',
    metadata,
  }
}

async function invokeConnector({ url, serviceRoleKey, jdbcUrl, credentialRef, qualifiedName }) {
  const parts = tableParts(qualifiedName)
  const headers = { 'content-type': 'application/json', apikey: serviceRoleKey }
  if (jwtShaped(serviceRoleKey)) headers.authorization = `Bearer ${serviceRoleKey}`
  const response = await fetch(`${url.replace(/\/$/, '')}/functions/v1/dgp-databricks-connector`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'lineage',
      jdbc_url: jdbcUrl,
      credential_ref: credentialRef,
      catalog: parts.catalog,
      schema: parts.schema,
      table: parts.table,
    }),
  })
  const raw = await response.text()
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
  if (!response.ok) {
    const safeError = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'Connector request failed.'
    throw new Error(`Databricks lineage connector failed for ${qualifiedName}: HTTP ${response.status}: ${safeError}`)
  }
  return record(payload)
}

async function authorizedActor(admin, projectId) {
  const candidates = []
  const seen = new Set()
  const add = value => {
    const id = typeof value === 'string' ? value.trim() : ''
    if (id && !seen.has(id)) {
      seen.add(id)
      candidates.push(id)
    }
  }

  const { data: priorActors } = await admin
    .schema('governance')
    .from('audit_events')
    .select('actor_user_id,created_at')
    .eq('project_id', projectId)
    .eq('event_type', 'LINEAGE_BATCH_INGESTED')
    .not('actor_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(25)
  for (const row of priorActors ?? []) add(row.actor_user_id)

  const { data: project } = await admin.schema('app').from('projects')
    .select('organization_id').eq('id', projectId).maybeSingle()
  if (project?.organization_id) {
    const { data: members } = await admin.schema('app').from('organization_members')
      .select('user_id,role').eq('organization_id', project.organization_id).in('role', ['OWNER', 'ADMIN'])
    for (const row of members ?? []) add(row.user_id)
  }

  for (const userId of candidates) {
    const { data, error } = await admin.schema('governance').rpc('has_project_capability', {
      p_project_id: projectId,
      p_user_id: userId,
      p_capability: 'lineage.manage',
    })
    if (!error && data === true) return userId
  }
  throw new Error('No currently authorized lineage.manage actor could be resolved from governed project evidence.')
}

function normalizedTransformation(value) {
  const tx = record(value)
  const sourceAsset = required(tx.sourceAsset, 'transformation sourceAsset')
  const targetAsset = required(tx.targetAsset, 'transformation targetAsset')
  const metadata = record(tx.metadata)
  const authoritativeSource = required(metadata.authoritative_source, 'transformation authoritative source')
  if (!['system.access.table_lineage', 'system.access.column_lineage'].includes(authoritativeSource)) {
    throw new Error(`Untrusted Databricks lineage authority: ${authoritativeSource}`)
  }
  const mappings = list(tx.columnMappings).map(mappingValue => {
    const mapping = record(mappingValue)
    const mappingMetadata = record(mapping.metadata)
    if (mappingMetadata.authoritative_source !== 'system.access.column_lineage') {
      throw new Error('Databricks field mapping is missing system.access.column_lineage authority.')
    }
    return {
      sourceAsset: required(mapping.sourceAsset || sourceAsset, 'mapping sourceAsset'),
      sourceColumn: required(mapping.sourceColumn, 'mapping sourceColumn'),
      targetAsset: required(mapping.targetAsset || targetAsset, 'mapping targetAsset'),
      targetColumn: required(mapping.targetColumn, 'mapping targetColumn'),
      operation: typeof mapping.operation === 'string' && mapping.operation.trim() ? mapping.operation : 'DATABRICKS_COLUMN_LINEAGE',
      expression: mapping.expression ?? null,
      metadata: mappingMetadata,
    }
  })
  return {
    sourceAsset,
    targetAsset,
    operation: typeof tx.operation === 'string' && tx.operation.trim() ? tx.operation : 'DATABRICKS_LINEAGE_EVENT',
    logicHash: required(tx.logicHash, 'transformation logicHash'),
    metadata,
    mappings,
  }
}

async function main() {
  const url = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  const projectId = required(process.env.LINEAGE_PROJECT_ID, 'LINEAGE_PROJECT_ID')
  const sourceId = required(process.env.LINEAGE_SOURCE_ID, 'LINEAGE_SOURCE_ID')
  const evidencePath = process.env.LINEAGE_EVIDENCE_PATH?.trim() || ''
  const apply = String(process.env.LINEAGE_APPLY ?? 'false').toLowerCase() === 'true'

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: source, error: sourceError } = await admin.schema('catalog').from('data_sources')
    .select('id,project_id,name,status,source_type,connection_metadata')
    .eq('id', sourceId).maybeSingle()
  if (sourceError || !source) throw new Error(`Unable to resolve Databricks lineage source: ${sourceError?.message ?? 'not found'}`)
  if (source.project_id !== projectId) throw new Error('Lineage source does not belong to the requested project.')
  if (String(source.status).toUpperCase() !== 'ACTIVE') throw new Error('Lineage source must be ACTIVE.')

  const sourceMetadata = record(source.connection_metadata)
  if (String(sourceMetadata.connection_kind ?? '').toLowerCase() !== 'databricks') {
    throw new Error('Controlled Databricks revalidation requires connection_kind=databricks.')
  }
  const jdbcUrl = required(sourceMetadata.jdbc_url ?? sourceMetadata.jdbcUrl, 'source jdbc_url')
  if (!jdbcUrl.toLowerCase().startsWith('jdbc:databricks://')) throw new Error('Controlled revalidation requires a Databricks JDBC URL.')
  const credentialRef = required(sourceMetadata.credential_ref ?? sourceMetadata.credentialRef, 'source credential_ref')

  const { data: scope, error: scopeError } = await admin.schema('catalog').from('source_scopes')
    .select('id,current_version_id,status')
    .eq('project_id', projectId).eq('source_id', sourceId).eq('status', 'ACTIVE')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (scopeError || !scope?.current_version_id) throw new Error('No active current source scope is available for Databricks lineage revalidation.')

  const { data: scopeVersion, error: scopeVersionError } = await admin.schema('catalog').from('source_scope_versions')
    .select('id,version_number,native_selection,scope_hash')
    .eq('id', scope.current_version_id).eq('source_id', sourceId).maybeSingle()
  if (scopeVersionError || !scopeVersion) throw new Error('Current Databricks source scope version could not be resolved.')
  const selection = record(scopeVersion.native_selection)
  if (selection.mode !== 'SELECTED') throw new Error('Databricks live lineage revalidation requires an explicit SELECTED source scope.')
  const qualifiedNames = [...new Set(list(selection.qualifiedNames)
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()))]
  if (!qualifiedNames.length) throw new Error('Selected Databricks source scope contains no qualified tables.')

  const { data: discoveryRuns, error: discoveryError } = await admin.schema('catalog').from('discovery_runs')
    .select('id,scope_version_id,catalog_revision_id,status,completed_at,error_message,objects_observed,objects_missing')
    .eq('project_id', projectId).eq('source_id', sourceId).eq('scope_version_id', scopeVersion.id)
    .eq('status', 'COMPLETED').not('catalog_revision_id', 'is', null)
    .order('completed_at', { ascending: false }).limit(1)
  if (discoveryError || !discoveryRuns?.[0]) {
    throw new Error('Current-scope Databricks discovery evidence is required before live lineage revalidation.')
  }
  const discoveryRun = discoveryRuns[0]
  if (discoveryRun.error_message) throw new Error('Current-scope Databricks discovery evidence contains an error.')
  if (Number(discoveryRun.objects_missing ?? 0) !== 0) throw new Error('Current-scope Databricks discovery reports missing selected objects.')
  if (Number(discoveryRun.objects_observed ?? 0) < qualifiedNames.length) {
    throw new Error('Current-scope Databricks discovery did not observe every selected table.')
  }

  const reports = []
  const normalized = []
  for (const qualifiedName of qualifiedNames) {
    const payload = await invokeConnector({ url, serviceRoleKey, jdbcUrl, credentialRef, qualifiedName })
    const details = record(payload.details)
    const warnings = list(payload.warnings).map(value => String(value))
    const transformations = list(payload.transformations).map(normalizedTransformation)
    const touchesRequestedTable = transformations.filter(tx =>
      tx.sourceAsset.toLowerCase() === qualifiedName.toLowerCase()
      || tx.targetAsset.toLowerCase() === qualifiedName.toLowerCase()
    )
    reports.push({
      qualifiedName,
      complete: details.complete === true,
      truncated: details.truncated === true,
      authoritativeSources: list(details.authoritative_sources),
      warnings,
      transformationCount: touchesRequestedTable.length,
      fieldMappingCount: touchesRequestedTable.reduce((sum, tx) => sum + tx.mappings.length, 0),
    })
    normalized.push(...touchesRequestedTable)
  }

  const deduped = [...new Map(normalized.map(tx => [
    [tx.sourceAsset.toLowerCase(), tx.targetAsset.toLowerCase(), tx.logicHash].join('|'),
    tx,
  ])).values()]
  const uncovered = reports.filter(report => report.transformationCount === 0).map(report => report.qualifiedName)
  const truncated = reports.filter(report => report.truncated).map(report => report.qualifiedName)
  const incomplete = reports.filter(report => !report.complete).map(report => report.qualifiedName)
  const fieldMappingsObserved = deduped.reduce((sum, tx) => sum + tx.mappings.length, 0)

  let ingestion = null
  if (apply && deduped.length) {
    const actorUserId = await authorizedActor(admin, projectId)
    const events = deduped.map(tx => {
      const sourceMetadata = {
        ...tx.metadata,
        authority_class: 'SOURCE_OBSERVED',
        data_source_id: sourceId,
        discovery_run_id: discoveryRun.id,
        catalog_revision_id: discoveryRun.catalog_revision_id,
      }
      const mappings = tx.mappings.map(mapping => ({
        ...mapping,
        metadata: {
          ...mapping.metadata,
          authority_class: 'SOURCE_OBSERVED',
          data_source_id: sourceId,
          discovery_run_id: discoveryRun.id,
          catalog_revision_id: discoveryRun.catalog_revision_id,
        },
      }))
      const event = {
        externalEventId: `databricks-lineage:${sourceId}:${tx.logicHash}`,
        eventType: 'COMPLETE',
        jobNamespace: 'databricks.system.access',
        jobName: tx.targetAsset,
        dataSourceId: sourceId,
        discoveryRunId: discoveryRun.id,
        catalogRevisionId: discoveryRun.catalog_revision_id,
        inputs: [lineageAsset(tx.sourceAsset, sourceMetadata)],
        outputs: [lineageAsset(tx.targetAsset, sourceMetadata)],
        transformation: {
          externalId: `databricks-system-lineage:${sourceId}:${tx.logicHash}`,
          sourceSystem: 'Databricks',
          name: tableParts(tx.targetAsset).table,
          operation: tx.operation,
          logicLanguage: 'DATABRICKS_SYSTEM_LINEAGE',
          transformationLogic: '',
          logicHash: tx.logicHash,
          metadata: sourceMetadata,
          columnMappings: mappings,
        },
      }
      return { ...event, payloadHash: sha256(JSON.stringify(event)) }
    })

    const { data, error } = await admin.schema('governance').rpc('ingest_lineage_batch_atomic', {
      p_project_id: projectId,
      p_actor: actorUserId,
      p_source_key: `databricks-source:${sourceId}`,
      p_source_name: `${source.name} Databricks system lineage`,
      p_source_system: 'Databricks',
      p_events: events,
    })
    if (error) throw new Error(`Governed Databricks lineage ingestion failed: ${error.message}`)
    if (!data || data.audit_atomic !== true || data.database_capability_verified !== true) {
      throw new Error('Governed Databricks lineage ingestion did not confirm atomic audit and database authorization.')
    }
    ingestion = {
      eventCount: Number(data.eventCount ?? 0),
      reusedCount: Number(data.reusedCount ?? 0),
      edgeCount: Number(data.edgeCount ?? 0),
      transformationCount: Number(data.transformationCount ?? 0),
      auditAtomic: data.audit_atomic === true,
      databaseCapabilityVerified: data.database_capability_verified === true,
    }
  }

  const evidence = {
    status: uncovered.length || truncated.length || incomplete.length ? 'BLOCKED' : 'PASS',
    mode: apply ? 'APPLY' : 'PREVIEW',
    projectId,
    sourceId,
    sourceName: source.name,
    scopeVersionId: scopeVersion.id,
    scopeVersionNumber: Number(scopeVersion.version_number),
    scopeHash: scopeVersion.scope_hash ?? null,
    discoveryRunId: discoveryRun.id,
    catalogRevisionId: discoveryRun.catalog_revision_id,
    selectedTables: qualifiedNames,
    reports,
    summary: {
      selectedTableCount: qualifiedNames.length,
      coveredTableCount: qualifiedNames.length - uncovered.length,
      uncoveredTables: uncovered,
      incompleteTables: incomplete,
      truncatedTables: truncated,
      transformationCount: deduped.length,
      fieldMappingCount: fieldMappingsObserved,
    },
    ingestion,
    authoritativeSources: ['system.access.table_lineage', 'system.access.column_lineage'],
    generatedAt: new Date().toISOString(),
  }

  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true })
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
  }
  console.log(JSON.stringify(evidence, null, 2))
  if (evidence.status !== 'PASS') process.exitCode = 2
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
