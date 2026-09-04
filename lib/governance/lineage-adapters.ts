import { createHash } from 'node:crypto'

export type NormalizedLineageAsset = {
  namespace: string
  name: string
  assetType: string
  datasetId?: string | null
  metadata?: Record<string, unknown>
  facets?: Record<string, unknown>
}

export type NormalizedColumnMapping = {
  sourceAsset?: string | null
  sourceColumn?: string | null
  targetAsset?: string | null
  targetColumn?: string | null
  operation?: string | null
  expression?: string | null
  metadata?: Record<string, unknown>
}

export type NormalizedTransformation = {
  externalId: string
  sourceSystem: string
  name: string | null
  operation: string
  logicLanguage: string | null
  transformationLogic: string | null
  logicHash: string | null
  metadata: Record<string, unknown>
  columnMappings: NormalizedColumnMapping[]
}

export type NormalizedLineageEvent = {
  externalEventId: string
  eventType: string
  jobNamespace: string | null
  jobName: string | null
  inputs: NormalizedLineageAsset[]
  outputs: NormalizedLineageAsset[]
  transformation: NormalizedTransformation | null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function array(value: unknown) { return Array.isArray(value) ? value : [] }

function safeMetadata(value: unknown) {
  return Object.fromEntries(Object.entries(object(value)).filter(([key]) => !/(password|secret|token|credential|authorization|api.?key|private.?key)/i.test(key)).slice(0, 100))
}

function redactLogic(value: unknown) {
  const input = text(value)
  if (!input) return null
  return input
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key)\s*=\s*(['"])[\s\S]*?\2/gi, '$1=[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, '$1[REDACTED]@')
    .slice(0, 1_000_000)
}

function logicHash(logic: string | null) {
  return logic ? createHash('sha256').update(logic).digest('hex') : null
}

function normalizeName(value: string) {
  return value.replace(/^[`"\[]|[`"\]]$/g, '').replace(/[;,]$/, '').trim()
}

function assetFrom(value: unknown, assetType = 'DATASET'): NormalizedLineageAsset | null {
  if (typeof value === 'string') {
    const cleaned = normalizeName(value)
    if (!cleaned) return null
    const parts = cleaned.split('.').filter(Boolean)
    return { namespace: parts.length > 1 ? parts.slice(0, -1).join('.') : '', name: parts.at(-1)!, assetType }
  }
  const row = object(value)
  const qualified = text(row.fullyQualifiedName ?? row.fqn ?? row.relation_name ?? row.relationName ?? row.identifier)
  const name = text(row.name ?? row.table ?? row.dataset ?? row.asset ?? row.path) || (qualified ? qualified.split('.').at(-1)! : '')
  if (!name) return null
  const namespace = text(row.namespace ?? row.schema ?? row.dataset_schema ?? row.database_schema)
    || (qualified.includes('.') ? qualified.split('.').slice(0, -1).join('.') : '')
  return {
    namespace,
    name,
    assetType: text(row.assetType ?? row.asset_type ?? row.type) || assetType,
    datasetId: text(row.datasetId ?? row.dataset_id) || null,
    metadata: safeMetadata(row.metadata ?? row),
    facets: safeMetadata(row.facets),
  }
}

function uniqueAssets(values: Array<NormalizedLineageAsset | null>) {
  const seen = new Set<string>()
  return values.filter((item): item is NormalizedLineageAsset => {
    if (!item) return false
    const key = `${item.assetType}:${item.namespace}:${item.name}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sqlSources(sql: string | null) {
  if (!sql) return []
  const matches: NormalizedLineageAsset[] = []
  const regex = /\b(?:from|join|using)\s+([`"\[]?[A-Za-z_][A-Za-z0-9_$#@-]*(?:\.[`"\[]?[A-Za-z_][A-Za-z0-9_$#@-]*){0,2}[`"\]]?)/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(sql))) {
    const asset = assetFrom(match[1])
    if (asset) matches.push(asset)
  }
  return uniqueAssets(matches)
}

function sqlTarget(sql: string | null) {
  if (!sql) return null
  const patterns = [
    /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+([^\s(]+)/i,
    /\binsert\s+into\s+([^\s(]+)/i,
    /\bmerge\s+into\s+([^\s(]+)/i,
    /\bupdate\s+([^\s(]+)/i,
    /\bcreate\s+table\s+([^\s(]+)/i,
  ]
  for (const pattern of patterns) {
    const match = sql.match(pattern)
    if (match?.[1]) return assetFrom(match[1])
  }
  return null
}

function sqlOperation(sql: string | null, fallback = 'TRANSFORM') {
  if (!sql) return fallback
  const normalized = sql.trim().toUpperCase()
  if (/^CREATE\s+(OR\s+REPLACE\s+)?MATERIALIZED\s+VIEW/.test(normalized)) return 'MATERIALIZED_VIEW'
  if (/^CREATE\s+(OR\s+REPLACE\s+)?VIEW/.test(normalized)) return 'VIEW'
  if (/^MERGE\b/.test(normalized)) return 'MERGE'
  if (/^INSERT\b/.test(normalized)) return 'INSERT'
  if (/^UPDATE\b/.test(normalized)) return 'UPDATE'
  if (/^DELETE\b/.test(normalized)) return 'DELETE'
  if (/^CREATE\s+TABLE/.test(normalized)) return 'CREATE_TABLE'
  if (/^SELECT\b|^WITH\b/.test(normalized)) return 'SELECT'
  return fallback
}

function mappings(value: unknown): NormalizedColumnMapping[] {
  return array(value).flatMap((item) => {
    const row = object(item)
    const sourceColumn = text(row.sourceColumn ?? row.source_column ?? row.from)
    const targetColumn = text(row.targetColumn ?? row.target_column ?? row.to)
    const expression = redactLogic(row.expression ?? row.logic ?? row.transformation)
    if (!sourceColumn && !targetColumn && !expression) return []
    return [{
      sourceAsset: text(row.sourceAsset ?? row.source_asset) || null,
      sourceColumn: sourceColumn || null,
      targetAsset: text(row.targetAsset ?? row.target_asset) || null,
      targetColumn: targetColumn || null,
      operation: text(row.operation) || null,
      expression,
      metadata: safeMetadata(row.metadata),
    }]
  })
}

function transformation(input: {
  sourceSystem: string
  externalId: string
  name?: unknown
  operation?: unknown
  logicLanguage?: unknown
  logic?: unknown
  metadata?: unknown
  columnMappings?: unknown
}): NormalizedTransformation {
  const logic = redactLogic(input.logic)
  return {
    externalId: input.externalId,
    sourceSystem: input.sourceSystem,
    name: text(input.name) || null,
    operation: text(input.operation).toUpperCase() || sqlOperation(logic),
    logicLanguage: text(input.logicLanguage).toUpperCase() || (logic ? 'SQL' : null),
    transformationLogic: logic,
    logicHash: logicHash(logic),
    metadata: safeMetadata(input.metadata),
    columnMappings: mappings(input.columnMappings),
  }
}

function genericEvent(body: Record<string, unknown>, sourceSystem: string): NormalizedLineageEvent {
  const run = object(body.run)
  const job = object(body.job)
  const logic = body.transformationLogic ?? body.transformation_logic ?? body.sql ?? body.query ?? object(body.transformation).logic
  const externalEventId = text(body.eventId ?? body.event_id ?? run.runId ?? run.run_id) || createHash('sha256').update(JSON.stringify(body)).digest('hex')
  let inputs = uniqueAssets(array(body.inputs).map((item) => assetFrom(item)))
  let outputs = uniqueAssets(array(body.outputs).map((item) => assetFrom(item)))
  const cleanedLogic = redactLogic(logic)
  if (!inputs.length) inputs = sqlSources(cleanedLogic)
  if (!outputs.length) {
    const target = sqlTarget(cleanedLogic)
    if (target) outputs = [target]
  }
  return {
    externalEventId,
    eventType: text(body.eventType ?? body.event_type) || 'COMPLETE',
    jobNamespace: text(job.namespace ?? body.jobNamespace ?? body.job_namespace) || null,
    jobName: text(job.name ?? body.jobName ?? body.job_name) || null,
    inputs,
    outputs,
    transformation: transformation({
      sourceSystem,
      externalId: text(object(body.transformation).externalId ?? object(body.transformation).external_id) || `transformation:${externalEventId}`,
      name: object(body.transformation).name ?? job.name,
      operation: object(body.transformation).operation ?? body.operation ?? sqlOperation(cleanedLogic),
      logicLanguage: object(body.transformation).logicLanguage ?? object(body.transformation).logic_language ?? (cleanedLogic ? 'SQL' : null),
      logic: cleanedLogic,
      metadata: object(body.transformation).metadata ?? body.metadata,
      columnMappings: object(body.transformation).columnMappings ?? object(body.transformation).column_mappings ?? body.columnMappings ?? body.column_mappings,
    }),
  }
}

function dbtEvents(body: Record<string, unknown>) {
  const manifest = object(body.manifest ?? body.payload ?? body)
  const nodes = object(manifest.nodes)
  const sources = object(manifest.sources)
  const lookup = { ...sources, ...nodes }
  const generated = text(object(manifest.metadata).generated_at) || 'manifest'
  const events: NormalizedLineageEvent[] = []
  for (const [uniqueId, rawNode] of Object.entries(nodes)) {
    const node = object(rawNode)
    const resourceType = text(node.resource_type).toLowerCase()
    if (!['model', 'snapshot', 'seed', 'test'].includes(resourceType)) continue
    const relation = text(node.relation_name ?? node.relationName) || [text(node.database), text(node.schema), text(node.alias ?? node.name)].filter(Boolean).join('.')
    const output = assetFrom(relation || text(node.name), resourceType === 'test' ? 'QUALITY_TEST' : 'DATASET')
    const dependsOn = array(object(node.depends_on).nodes).map(String)
    const inputs = uniqueAssets(dependsOn.map((dependency) => {
      const dep = object(lookup[dependency])
      const depRelation = text(dep.relation_name ?? dep.relationName) || [text(dep.database), text(dep.schema), text(dep.identifier ?? dep.alias ?? dep.name)].filter(Boolean).join('.')
      return assetFrom(depRelation || dependency)
    }))
    const logic = node.compiled_code ?? node.compiled_sql ?? node.raw_code ?? node.raw_sql
    if (!output) continue
    events.push({
      externalEventId: `dbt:${generated}:${uniqueId}`,
      eventType: 'COMPLETE',
      jobNamespace: text(node.package_name) || 'dbt',
      jobName: uniqueId,
      inputs,
      outputs: [output],
      transformation: transformation({
        sourceSystem: 'DBT', externalId: uniqueId, name: node.name, operation: resourceType.toUpperCase(), logicLanguage: 'SQL', logic,
        metadata: { resource_type: resourceType, package_name: node.package_name, path: node.path, original_file_path: node.original_file_path, materialized: object(node.config).materialized },
        columnMappings: node.column_mappings,
      }),
    })
  }
  return events
}

function airflowEvents(body: Record<string, unknown>) {
  const dag = object(body.dag ?? body.payload ?? body)
  const dagId = text(dag.dag_id ?? dag.dagId ?? body.dag_id) || 'airflow'
  return array(dag.tasks ?? body.tasks).flatMap((rawTask) => {
    const task = object(rawTask)
    const taskId = text(task.task_id ?? task.taskId ?? task.id)
    if (!taskId) return []
    let inputs = uniqueAssets(array(task.inlets ?? task.inputs).map((item) => assetFrom(item)))
    let outputs = uniqueAssets(array(task.outlets ?? task.outputs).map((item) => assetFrom(item)))
    const logic = redactLogic(task.sql ?? task.query ?? task.bash_command ?? task.command)
    if (!inputs.length) inputs = sqlSources(logic)
    if (!outputs.length) {
      const target = sqlTarget(logic)
      if (target) outputs = [target]
    }
    if (!outputs.length) outputs = [{ namespace: dagId, name: taskId, assetType: 'AIRFLOW_TASK' }]
    if (!inputs.length) inputs = array(task.upstream_task_ids ?? task.upstreamTasks).map((id) => ({ namespace: dagId, name: String(id), assetType: 'AIRFLOW_TASK' }))
    return [{
      externalEventId: `airflow:${dagId}:${taskId}:${text(body.run_id ?? body.runId) || 'definition'}`,
      eventType: 'COMPLETE',
      jobNamespace: dagId,
      jobName: taskId,
      inputs,
      outputs,
      transformation: transformation({ sourceSystem: 'AIRFLOW', externalId: `${dagId}:${taskId}`, name: taskId, operation: task.operator ?? 'DAG_TASK', logicLanguage: logic?.trim().toLowerCase().startsWith('select') ? 'SQL' : null, logic, metadata: { dag_id: dagId, operator: task.operator }, columnMappings: task.column_mappings }),
    }]
  })
}

function relationshipEvents(body: Record<string, unknown>, sourceSystem: string) {
  const records = array(body.relationships ?? body.lineage ?? body.edges ?? body.records ?? body.queries ?? body.files)
  return records.flatMap((raw, index) => {
    const row = object(raw)
    const logic = redactLogic(row.sql_text ?? row.query_text ?? row.sql ?? row.expression ?? row.m_expression ?? row.dax ?? row.custom_sql ?? row.logic ?? row.content)
    let inputs = uniqueAssets(array(row.inputs ?? row.sources ?? row.objects_accessed ?? row.upstream).map((item) => assetFrom(item)))
    let outputs = uniqueAssets(array(row.outputs ?? row.targets ?? row.objects_modified ?? row.downstream).map((item) => assetFrom(item)))
    const directSource = assetFrom(row.source ?? row.source_table ?? row.from)
    const directTarget = assetFrom(row.target ?? row.target_table ?? row.to)
    if (directSource) inputs = uniqueAssets([...inputs, directSource])
    if (directTarget) outputs = uniqueAssets([...outputs, directTarget])
    if (!inputs.length) inputs = sqlSources(logic)
    if (!outputs.length) {
      const target = sqlTarget(logic)
      if (target) outputs = [target]
    }
    if (!inputs.length && !outputs.length) return []
    const externalId = text(row.id ?? row.query_id ?? row.statement_id ?? row.path ?? row.name) || `${sourceSystem.toLowerCase()}:${index}:${createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 16)}`
    return [{
      externalEventId: `${sourceSystem.toLowerCase()}:${externalId}`,
      eventType: text(row.event_type) || 'COMPLETE',
      jobNamespace: text(row.namespace ?? row.workspace ?? row.project ?? row.repository ?? row.workbook) || sourceSystem.toLowerCase(),
      jobName: text(row.job_name ?? row.name ?? row.path ?? row.statement_id ?? row.query_id) || externalId,
      inputs,
      outputs,
      transformation: transformation({
        sourceSystem,
        externalId,
        name: row.name ?? row.path,
        operation: row.operation ?? row.operator ?? sqlOperation(logic),
        logicLanguage: row.logic_language ?? (sourceSystem === 'POWER_BI' && row.dax ? 'DAX' : sourceSystem === 'POWER_BI' && row.m_expression ? 'M' : logic ? 'SQL' : null),
        logic,
        metadata: row,
        columnMappings: row.column_mappings ?? row.columnMappings,
      }),
    }]
  })
}

export function normalizeLineagePayload(body: Record<string, unknown>): { sourceSystem: string; events: NormalizedLineageEvent[] } {
  const integrationType = text(body.integrationType ?? body.integration_type ?? body.sourceSystem ?? body.source_system).toUpperCase().replace(/[ -]+/g, '_') || 'OPENLINEAGE'
  let events: NormalizedLineageEvent[]
  if (integrationType === 'DBT') events = dbtEvents(body)
  else if (integrationType === 'AIRFLOW') events = airflowEvents(body)
  else if (['DATABRICKS', 'SNOWFLAKE', 'POWER_BI', 'POWERBI', 'TABLEAU', 'GITHUB_SQL', 'JDBC', 'SQL_SERVER', 'MYSQL', 'MARIADB', 'POSTGRESQL', 'REDSHIFT', 'ORACLE'].includes(integrationType)) {
    const normalizedSystem = integrationType === 'POWERBI' ? 'POWER_BI' : integrationType
    events = relationshipEvents(body, normalizedSystem)
    if (!events.length) events = [genericEvent(body, normalizedSystem)]
  } else events = [genericEvent(body, integrationType)]

  return {
    sourceSystem: integrationType === 'POWERBI' ? 'POWER_BI' : integrationType,
    events: events.filter((event) => event.inputs.length || event.outputs.length),
  }
}
