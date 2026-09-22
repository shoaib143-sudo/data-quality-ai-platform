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

function splitAsset(value) {
  const text = required(value, 'lineage asset')
  const parts = text.split('.').map(part => part.trim()).filter(Boolean)
  return {
    namespace: parts.length > 1 ? parts.slice(0, -1).join('.') : '',
    name: parts.at(-1),
    assetType: 'DATASET',
    metadata: {
      authoritative_source: 'pg_views.definition',
      full_name: text,
    },
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function safeErrorText(value) {
  return String(value ?? 'unknown error')
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, '[REDACTED_SECRET_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 1000)
}

async function connectorErrorMessage(error) {
  const fallback = error instanceof Error ? error.message : 'Edge Function request failed.'
  const context = error && typeof error === 'object' ? error.context : null
  if (context instanceof Response) {
    const status = context.status
    try {
      const payload = await context.clone().json()
      const message = payload && typeof payload.error === 'string' ? payload.error : fallback
      return `HTTP ${status}: ${safeErrorText(message)}`
    } catch {
      return `HTTP ${status}: ${safeErrorText(fallback)}`
    }
  }
  return safeErrorText(fallback)
}

async function authorizedActor(admin, projectId) {
  const candidates = []
  const seen = new Set()

  const add = (value) => {
    const id = typeof value === 'string' ? value.trim() : ''
    if (id && !seen.has(id)) {
      seen.add(id)
      candidates.push(id)
    }
  }

  const { data: auditRows } = await admin
    .schema('governance')
    .from('audit_events')
    .select('actor_user_id,created_at')
    .eq('project_id', projectId)
    .eq('event_type', 'LINEAGE_BATCH_INGESTED')
    .not('actor_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(25)
  for (const row of auditRows ?? []) add(row.actor_user_id)

  const { data: project } = await admin
    .schema('app')
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (project?.organization_id) {
    const { data: members } = await admin
      .schema('app')
      .from('organization_members')
      .select('user_id,role')
      .eq('organization_id', project.organization_id)
      .in('role', ['OWNER', 'ADMIN'])
    for (const row of members ?? []) add(row.user_id)
  }

  for (const userId of candidates) {
    const { data, error } = await admin
      .schema('governance')
      .rpc('has_project_capability', {
        p_project_id: projectId,
        p_user_id: userId,
        p_capability: 'lineage.manage',
      })
    if (!error && data === true) return userId
  }

  throw new Error('No currently authorized lineage.manage actor could be resolved from governed project evidence.')
}

async function main() {
  const url = required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = required(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
  const projectId = required(process.env.LINEAGE_PROJECT_ID, 'LINEAGE_PROJECT_ID')
  const sourceId = required(process.env.LINEAGE_SOURCE_ID, 'LINEAGE_SOURCE_ID')
  const targetSchema = required(process.env.LINEAGE_TARGET_SCHEMA || 'governance', 'LINEAGE_TARGET_SCHEMA')
  const targetView = required(process.env.LINEAGE_TARGET_VIEW || 'glossary_reference_concepts', 'LINEAGE_TARGET_VIEW')
  const evidencePath = process.env.LINEAGE_EVIDENCE_PATH?.trim() || ''

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: source, error: sourceError } = await admin
    .schema('catalog')
    .from('data_sources')
    .select('id,project_id,name,status,source_type,connection_metadata')
    .eq('id', sourceId)
    .maybeSingle()
  if (sourceError || !source) throw new Error(`Unable to resolve lineage source: ${sourceError?.message ?? 'not found'}`)
  if (source.project_id !== projectId) throw new Error('Lineage source does not belong to the requested project.')
  if (String(source.status).toUpperCase() !== 'ACTIVE') throw new Error('Lineage source must be ACTIVE.')
  if (String(source.source_type).toUpperCase() !== 'JDBC') throw new Error('Controlled revalidation requires a JDBC PostgreSQL source.')

  const metadata = record(source.connection_metadata)
  const jdbcUrl = required(metadata.jdbc_url ?? metadata.jdbcUrl ?? metadata.url, 'source jdbc_url')
  const credentialRef = required(metadata.credential_ref ?? metadata.credentialRef, 'source credential_ref')
  if (!jdbcUrl.toLowerCase().startsWith('jdbc:postgresql://')) throw new Error('Controlled revalidation requires PostgreSQL JDBC.')

  const { data: runRows, error: runError } = await admin
    .schema('catalog')
    .from('discovery_runs')
    .select('id,catalog_revision_id,status,completed_at')
    .eq('source_id', sourceId)
    .eq('status', 'COMPLETED')
    .not('catalog_revision_id', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
  if (runError || !runRows?.[0]?.catalog_revision_id) {
    throw new Error(`Unable to resolve a published discovery revision: ${runError?.message ?? 'not found'}`)
  }
  const discoveryRun = runRows[0]

  const { data: connectorPayload, error: connectorError } = await admin.functions.invoke('dgp-postgres-connector', {
    body: {
      action: 'lineage',
      jdbc_url: jdbcUrl,
      credential_ref: credentialRef,
      schema: targetSchema,
      table: targetView,
    },
  })
  if (connectorError) throw new Error(`PostgreSQL lineage connector failed: ${await connectorErrorMessage(connectorError)}`)
  const connector = record(connectorPayload)
  if (typeof connector.error === 'string' && connector.error.trim()) {
    throw new Error(`PostgreSQL lineage connector failed: ${connector.error.trim()}`)
  }

  const transformations = Array.isArray(connector.transformations) ? connector.transformations : []
  const transformation = transformations.find(item => record(item).name === targetView)
  if (!transformation) throw new Error(`PostgreSQL connector returned no transformation for ${targetSchema}.${targetView}.`)

  const tx = record(transformation)
  const mappings = Array.isArray(tx.columnMappings) ? tx.columnMappings.map(record) : []
  if (!mappings.length) {
    throw new Error(`No proven direct field mappings were derived for ${targetSchema}.${targetView}; refusing to fabricate lineage.`)
  }
  if (mappings.some(mapping => record(mapping.metadata).authoritative_source !== 'pg_views.definition')) {
    throw new Error('Connector returned a field mapping without pg_views.definition authority.')
  }

  const sourceAsset = required(tx.sourceAsset, 'transformation sourceAsset')
  const targetAsset = required(tx.targetAsset, 'transformation targetAsset')
  const logicHash = required(tx.logicHash, 'transformation logicHash')
  const actorUserId = await authorizedActor(admin, projectId)
  const externalId = `postgres-view:${sourceId}:${targetSchema}.${targetView}:${logicHash}`

  const governedMappings = mappings.map(mapping => ({
    sourceAsset: required(mapping.sourceAsset || sourceAsset, 'mapping sourceAsset'),
    sourceColumn: required(mapping.sourceColumn, 'mapping sourceColumn'),
    targetAsset: required(mapping.targetAsset || targetAsset, 'mapping targetAsset'),
    targetColumn: required(mapping.targetColumn, 'mapping targetColumn'),
    operation: mapping.operation || 'DIRECT_PROJECTION',
    expression: mapping.expression ?? null,
    metadata: {
      ...record(mapping.metadata),
      authoritative_source: 'pg_views.definition',
      authority_class: 'SOURCE_OBSERVED',
      data_source_id: sourceId,
      discovery_run_id: discoveryRun.id,
      catalog_revision_id: discoveryRun.catalog_revision_id,
    },
  }))

  const event = {
    externalEventId: `postgres-view-lineage:${sourceId}:${targetSchema}.${targetView}:${logicHash}`,
    eventType: 'COMPLETE',
    jobNamespace: 'postgres.pg_views',
    jobName: `${targetSchema}.${targetView}`,
    dataSourceId: sourceId,
    discoveryRunId: discoveryRun.id,
    catalogRevisionId: discoveryRun.catalog_revision_id,
    inputs: [{
      ...splitAsset(sourceAsset),
      metadata: {
        authoritative_source: 'pg_views.definition',
        authority_class: 'SOURCE_OBSERVED',
        data_source_id: sourceId,
        discovery_run_id: discoveryRun.id,
        catalog_revision_id: discoveryRun.catalog_revision_id,
      },
    }],
    outputs: [{
      ...splitAsset(targetAsset),
      metadata: {
        authoritative_source: 'pg_views.definition',
        authority_class: 'SOURCE_OBSERVED',
        data_source_id: sourceId,
        discovery_run_id: discoveryRun.id,
        catalog_revision_id: discoveryRun.catalog_revision_id,
      },
    }],
    transformation: {
      externalId,
      sourceSystem: 'PostgreSQL',
      name: targetView,
      operation: tx.operation || 'VIEW',
      logicLanguage: 'SQL',
      transformationLogic: required(tx.transformationLogic, 'transformation logic'),
      logicHash,
      metadata: {
        ...record(tx.metadata),
        authoritative_source: 'pg_views.definition',
        field_lineage_derivation: 'DIRECT_PROJECTION_ONLY',
        authority_class: 'SOURCE_OBSERVED',
        data_source_id: sourceId,
        discovery_run_id: discoveryRun.id,
        catalog_revision_id: discoveryRun.catalog_revision_id,
      },
      columnMappings: governedMappings,
    },
  }

  const eventWithHash = { ...event, payloadHash: sha256(JSON.stringify(event)) }
  const { data: ingestion, error: ingestionError } = await admin
    .schema('governance')
    .rpc('ingest_lineage_batch_atomic', {
      p_project_id: projectId,
      p_actor: actorUserId,
      p_source_key: `jdbc-source:${sourceId}`,
      p_source_name: `${source.name} PostgreSQL field lineage`,
      p_source_system: 'PostgreSQL',
      p_events: [eventWithHash],
    })
  if (ingestionError) throw new Error(`Governed lineage ingestion failed: ${ingestionError.message}`)
  if (!ingestion || ingestion.audit_atomic !== true || ingestion.database_capability_verified !== true) {
    throw new Error('Governed lineage ingestion did not confirm atomic audit and database authorization.')
  }

  const { data: persistedRows, error: txError } = await admin
    .schema('governance')
    .from('lineage_transformations')
    .select('id,external_id,logic_hash,source_system,operation,metadata,last_seen_at')
    .eq('project_id', projectId)
    .eq('external_id', externalId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
  if (txError || !persistedRows?.[0]) throw new Error(`Persisted transformation could not be resolved: ${txError?.message ?? 'not found'}`)
  const persisted = persistedRows[0]

  const [{ data: persistedMappings, error: mappingsError }, { data: persistedEdges, error: edgesError }] = await Promise.all([
    admin.schema('governance').from('lineage_column_mappings')
      .select('id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata')
      .eq('project_id', projectId)
      .eq('transformation_id', persisted.id),
    admin.schema('governance').from('lineage_edges')
      .select('id,source_type,source_id,target_type,target_id,relationship,transformation_id,authority_state,origin,metadata')
      .eq('project_id', projectId)
      .eq('transformation_id', persisted.id),
  ])
  if (mappingsError) throw new Error(`Unable to verify persisted field mappings: ${mappingsError.message}`)
  if (edgesError) throw new Error(`Unable to verify persisted transformation edges: ${edgesError.message}`)
  if ((persistedMappings ?? []).length !== governedMappings.length) {
    throw new Error(`Persisted mapping count mismatch: expected ${governedMappings.length}, found ${persistedMappings?.length ?? 0}.`)
  }
  if (!(persistedEdges ?? []).some(edge => edge.relationship === 'TRANSFORMS_TO')) {
    throw new Error('No TRANSFORMS_TO graph edge was persisted for the source-observed transformation.')
  }

  const [{ data: governanceVerification, error: governanceError }, { data: authorityPosture, error: authorityError }] = await Promise.all([
    admin.schema('governance').rpc('verify_ai_governance_intelligence', { p_project_id: projectId }),
    admin.schema('governance').rpc('verify_lineage_authority_posture', { p_project_id: projectId }),
  ])
  if (governanceError) throw new Error(`Governance verifier failed: ${governanceError.message}`)
  if (authorityError) throw new Error(`Lineage authority verifier failed: ${authorityError.message}`)

  const verification = record(governanceVerification)
  const fieldLineage = record(record(verification.checks).field_lineage_data)
  if (fieldLineage.status !== 'PASS') {
    throw new Error(`Formal governance verification still reports field lineage as ${fieldLineage.status ?? 'UNKNOWN'}.`)
  }
  if (record(authorityPosture).valid !== true) throw new Error('Lineage authority posture is not valid after ingestion.')

  const evidence = {
    status: 'PASS',
    projectId,
    sourceId,
    sourceName: source.name,
    discoveryRunId: discoveryRun.id,
    catalogRevisionId: discoveryRun.catalog_revision_id,
    target: `${targetSchema}.${targetView}`,
    connector: {
      databaseProduct: connector.databaseProduct ?? connector.database_product ?? null,
      databaseVersion: connector.databaseVersion ?? connector.database_version ?? null,
      authoritativeSource: 'pg_views.definition',
      derivedMappings: governedMappings.length,
    },
    ingestion: {
      eventId: event.externalEventId,
      transformationId: persisted.id,
      edgeCount: persistedEdges?.length ?? 0,
      fieldMappingCount: persistedMappings?.length ?? 0,
      auditAtomic: ingestion.audit_atomic === true,
      databaseCapabilityVerified: ingestion.database_capability_verified === true,
      reusedCount: Number(ingestion.reusedCount ?? 0),
    },
    verification: {
      overall: verification.status ?? null,
      fieldLineageStatus: fieldLineage.status ?? null,
      fieldLineageMappings: fieldLineage.column_mappings ?? null,
      authorityState: record(authorityPosture).state ?? null,
      authorityValid: record(authorityPosture).valid === true,
    },
    generatedAt: new Date().toISOString(),
  }

  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true })
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
  }
  console.log(JSON.stringify(evidence, null, 2))
}

main().catch(error => {
  const message = safeErrorText(error instanceof Error ? error.message : String(error))
  const evidencePath = process.env.LINEAGE_EVIDENCE_PATH?.trim() || ''
  if (evidencePath) {
    mkdirSync(dirname(evidencePath), { recursive: true })
    writeFileSync(evidencePath, JSON.stringify({
      status: 'FAIL',
      error: message,
      generatedAt: new Date().toISOString(),
    }, null, 2) + '\n', 'utf8')
  }
  console.error(message)
  process.exitCode = 1
})
