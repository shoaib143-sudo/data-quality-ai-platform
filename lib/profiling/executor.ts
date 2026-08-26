import { createHash } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TOOLS = new Set([
  'inspect_dataset',
  'infer_column_types',
  'profile_dataset',
  'detect_patterns',
  'infer_candidate_keys',
  'compare_profiles',
  'persist_profile_snapshot',
  'complete_profile_run',
  'detect_outliers',
  'detect_sensitive_columns',
  'get_profile_run',
  'detect_duplicates',
])

export type ProfilingToolRequest = {
  toolKey: string
  datasetVersionId: string
  profilingRunId?: string
  input?: Record<string, unknown>
}

export async function executeProfilingTool(
  request: ProfilingToolRequest,
) {
  const {
    toolKey,
    datasetVersionId,
    profilingRunId,
    input = {},
  } = request

  if (!ALLOWED_TOOLS.has(toolKey)) {
    throw new Error(`Unsupported profiling tool: ${toolKey}`)
  }

  if (!datasetVersionId) {
    throw new Error('datasetVersionId is required')
  }

  const supabase = createAdminClient()

  switch (toolKey) {
    case 'inspect_dataset':
      return inspectDataset(
        supabase,
        datasetVersionId,
      )

    case 'get_profile_run':
      return getProfileRun(
        supabase,
        profilingRunId,
      )

    case 'persist_profile_snapshot':
      return persistProfileSnapshot(
        supabase,
        input,
      )

    case 'complete_profile_run':
      return completeProfileRun(
        supabase,
        input,
      )

    case 'infer_column_types':
      return inferColumnTypes(
        supabase,
        datasetVersionId,
      )

    case 'profile_dataset':
      return profileDataset(
        supabase,
        datasetVersionId,
        profilingRunId,
      )

    case 'detect_patterns':
    case 'infer_candidate_keys':
    case 'compare_profiles':
    case 'detect_outliers':
    case 'detect_sensitive_columns':
    case 'detect_duplicates':
      return {
        tool: toolKey,
        status: 'accepted',
        dataset_version_id: datasetVersionId,
        profiling_run_id: profilingRunId ?? null,
        input,
        message:
          'Tool execution contract registered. Implementation pending.',
      }

    default:
      throw new Error(
        `Unhandled profiling tool: ${toolKey}`,
      )
  }
}


type InferredColumnType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'unknown'

type DatasetColumnMetadata = Record<string, unknown>

type DatasetProfileColumn = {
  name: string | null
  ordinal_position: number
  source_type: string | null
  inferred_type: InferredColumnType
  total_count: number | null
  non_null_count: number | null
  null_count: number | null
  blank_count: number | null
  zero_count: number | null
  distinct_count: number | null
  distinct_percentage: number | null
  metadata: DatasetColumnMetadata
}

type DatasetProfileSummary = {
  row_count: number | null
  column_count: number
  schema_hash: string
  columns: DatasetProfileColumn[]
  source_access: SourceAccessSummary
}

type DatasetVersionRecord = {
  metadata: unknown
  row_count?: number | null
  column_count?: number | null
  source_uri?: string | null
  datasets?: DatasetRecord | DatasetRecord[] | null
}

type DatasetRecord = {
  source_identifier?: string | null
  metadata?: unknown
  data_sources?: DataSourceRecord | DataSourceRecord[] | null
}

type DataSourceRecord = {
  source_type?: string | null
  connection_metadata?: unknown
}

type SourceConnector = {
  kind: 'supabase_table'
  schema: string
  table: string
}

type SourceAccessSummary = {
  mode: 'source_rows' | 'metadata_only'
  connector: SourceConnector | null
  sampled_rows: number
  warnings: string[]
}

const DECLARED_TYPE_FIELDS = [
  'data_type',
  'physical_type',
  'logical_type',
  'type',
] as const

const SAMPLE_VALUE_FIELDS = [
  'sample_values',
  'sampleValues',
  'samples',
  'values',
] as const

const COLUMN_NAME_FIELDS = [
  'name',
  'column_name',
  'columnName',
] as const

const ROW_COUNT_FIELDS = [
  'row_count',
  'rowCount',
  'record_count',
  'recordCount',
  'total_rows',
  'totalRows',
] as const

const COUNT_FIELDS = {
  total_count: [
    'total_count',
    'totalCount',
    'count',
  ],
  non_null_count: [
    'non_null_count',
    'nonNullCount',
  ],
  null_count: [
    'null_count',
    'nullCount',
    'missing_count',
    'missingCount',
  ],
  blank_count: [
    'blank_count',
    'blankCount',
    'empty_count',
    'emptyCount',
  ],
  zero_count: [
    'zero_count',
    'zeroCount',
  ],
  distinct_count: [
    'distinct_count',
    'distinctCount',
    'unique_count',
    'uniqueCount',
  ],
  distinct_percentage: [
    'distinct_percentage',
    'distinctPercentage',
    'unique_percentage',
    'uniquePercentage',
  ],
} as const

const MAX_PROFILE_SAMPLE_ROWS = 1000

async function inferColumnTypes(
  supabase: ReturnType<typeof createAdminClient>,
  datasetVersionId: string,
) {
  const { data, error } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select(`
      metadata,
      row_count,
      column_count,
      source_uri,
      datasets (
        source_identifier,
        metadata,
        data_sources (
          source_type,
          connection_metadata
        )
      )
    `)
    .eq('id', datasetVersionId)
    .single()

  if (error) {
    throw new Error(
      `Unable to infer column types: ${error.message}`,
    )
  }

  const metadata = asRecord(data.metadata)
  const columns = Array.isArray(metadata?.columns)
    ? metadata.columns
    : []

  return {
    tool: 'infer_column_types',
    dataset_version_id: datasetVersionId,
    columns: columns.map((column, index) => ({
      name: getColumnName(column),
      type: inferColumnType(column),
      ordinal_position: index + 1,
    })),
  }
}

async function profileDataset(
  supabase: ReturnType<typeof createAdminClient>,
  datasetVersionId: string,
  profilingRunId?: string,
) {
  if (!profilingRunId) {
    throw new Error(
      'profilingRunId is required for profile_dataset',
    )
  }

  const { data, error } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('metadata')
    .eq('id', datasetVersionId)
    .single()

  if (error) {
    throw new Error(
      `Unable to profile dataset version: ${error.message}`,
    )
  }

  const datasetVersion = data as DatasetVersionRecord
  const connector = resolveSourceConnector(
    datasetVersion,
  )
  const sourceRows = connector
    ? await loadSourceRows(
      supabase,
      connector,
      MAX_PROFILE_SAMPLE_ROWS,
    )
    : null

  const summary = sourceRows && connector
    ? buildSourceBackedDatasetProfileSummary(
      datasetVersion,
      connector,
      sourceRows.rows,
      sourceRows.rowCount,
    )
    : buildDatasetProfileSummary(
      datasetVersion,
      connector
        ? [
          `Source connector ${connector.schema}.${connector.table} returned no rows; used metadata-only profile.`,
        ]
        : [
          'No supported source-row connector was defined; used metadata-only profile.',
        ],
    )

  const schema = buildSchemaSnapshot(summary)

  await persistProfileColumns(
    supabase,
    profilingRunId,
    summary.columns,
  )

  await persistProfileDatasetMetrics(
    supabase,
    profilingRunId,
    summary,
  )

  await upsertProfileSchemaSnapshot(
    supabase,
    profilingRunId,
    datasetVersionId,
    summary.schema_hash,
    schema,
  )

  const profileRun = await updateProfileRunSummary(
    supabase,
    profilingRunId,
    summary,
  )

  return {
    tool: 'profile_dataset',
    profiling_run_id: profilingRunId,
    dataset_version_id: datasetVersionId,
    status: 'COMPLETED',
    row_count: summary.row_count,
    column_count: summary.column_count,
    anomalies_found: 0,
    schema_hash: summary.schema_hash,
    source_access: summary.source_access,
    profile_run: profileRun,
  }
}

function buildDatasetProfileSummary(
  datasetVersion: DatasetVersionRecord | unknown,
  warnings: string[] = [],
): DatasetProfileSummary {
  const versionRecord = asRecord(datasetVersion)
  const rawMetadata =
    versionRecord && 'metadata' in versionRecord
      ? versionRecord.metadata
      : datasetVersion
  const metadata = asRecord(rawMetadata)
  const rawColumns = Array.isArray(metadata?.columns)
    ? metadata.columns
    : []

  const columns = rawColumns.map(
    (column, index): DatasetProfileColumn => {
      const columnMetadata = asRecord(column) ?? {}
      const inferredType = inferColumnType(column)
      const sourceType = getDeclaredColumnType(columnMetadata)

      return {
        name: getColumnName(column),
        ordinal_position: index + 1,
        source_type: sourceType,
        inferred_type: inferredType,
        total_count: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.total_count,
        ),
        non_null_count: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.non_null_count,
        ),
        null_count: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.null_count,
        ),
        blank_count: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.blank_count,
        ),
        zero_count: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.zero_count,
        ),
        distinct_count: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.distinct_count,
        ),
        distinct_percentage: getNumericMetadataValue(
          columnMetadata,
          COUNT_FIELDS.distinct_percentage,
        ),
        metadata: columnMetadata,
      }
    },
  )

  const rowCount =
    getNumericMetadataValue(
      versionRecord ?? {},
      ['row_count', 'rowCount'],
    ) ??
    getNumericMetadataValue(
      metadata ?? {},
      ROW_COUNT_FIELDS,
    )
  const schema = columns.map((column) => ({
    name: column.name,
    ordinal_position: column.ordinal_position,
    source_type: column.source_type,
    inferred_type: column.inferred_type,
  }))
  const schemaHash = createStableHash(schema)

  return {
    row_count: rowCount,
    column_count: columns.length,
    schema_hash: schemaHash,
    columns,
    source_access: {
      mode: 'metadata_only',
      connector: null,
      sampled_rows: 0,
      warnings,
    },
  }
}


function inferColumnTypeFromValues(
  metadata: DatasetColumnMetadata,
  values: unknown[],
): InferredColumnType {
  const declaredType = getDeclaredColumnType(metadata)

  if (declaredType) {
    const declared = inferDeclaredColumnType(declaredType)

    if (declared !== 'unknown') {
      return declared
    }
  }

  return inferSampleValueType(values)
}

function buildSampleColumnStats(values: unknown[]) {
  const totalCount = values.length
  const nullCount = values.filter(
    (value) => value === null || value === undefined,
  ).length
  const blankCount = values.filter(
    (value) =>
      typeof value === 'string' &&
      value.trim() === '',
  ).length
  const zeroCount = values.filter(
    (value) =>
      value === 0 ||
      value === '0',
  ).length
  const nonNullCount = totalCount - nullCount

  const distinctValues = new Set(
    values
      .filter(
        (value) =>
          value !== null &&
          value !== undefined,
      )
      .map((value) =>
        typeof value === 'string'
          ? value.trim()
          : JSON.stringify(value),
      ),
  )

  return {
    total_count: totalCount,
    non_null_count: nonNullCount,
    null_count: nullCount,
    blank_count: blankCount,
    zero_count: zeroCount,
    distinct_count: distinctValues.size,
    distinct_percentage:
      totalCount === 0
        ? 0
        : (distinctValues.size / totalCount) * 100,
  }
}

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  fields: readonly string[],
): string | null {
  for (const field of fields) {
    const value = metadata[field]

    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim()
    }
  }

  return null
}

function buildSourceBackedDatasetProfileSummary(
  datasetVersion: DatasetVersionRecord,
  connector: SourceConnector,
  rows: Record<string, unknown>[],
  rowCount: number | null,
): DatasetProfileSummary {
  const metadata = asRecord(datasetVersion.metadata)
  const metadataColumns = Array.isArray(metadata?.columns)
    ? metadata.columns
    : []
  const metadataColumnsByName = new Map(
    metadataColumns
      .map((column) => [
        getColumnName(column),
        column,
      ] as const)
      .filter(([name]) => Boolean(name)),
  )
  const rowColumnNames = Array.from(
    rows.reduce<Set<string>>((names, row) => {
      Object.keys(row).forEach((name) => {
        names.add(name)
      })

      return names
    }, new Set()),
  )
  const metadataColumnNames = metadataColumns
    .map(getColumnName)
    .filter((name): name is string => Boolean(name))
  const columnNames = Array.from(
    new Set([
      ...metadataColumnNames,
      ...rowColumnNames,
    ]),
  )

  const columns = columnNames.map(
    (name, index): DatasetProfileColumn => {
      const columnMetadata = asRecord(
        metadataColumnsByName.get(name),
      ) ?? {}
      const values = rows.map((row) => row[name])
      const inferredType = inferColumnTypeFromValues(
        columnMetadata,
        values,
      )
      const sampleStats = buildSampleColumnStats(values)

      return {
        name,
        ordinal_position: index + 1,
        source_type: getDeclaredColumnType(columnMetadata),
        inferred_type: inferredType,
        total_count: sampleStats.total_count,
        non_null_count: sampleStats.non_null_count,
        null_count: sampleStats.null_count,
        blank_count: sampleStats.blank_count,
        zero_count: sampleStats.zero_count,
        distinct_count: sampleStats.distinct_count,
        distinct_percentage: sampleStats.distinct_percentage,
        metadata: {
          ...columnMetadata,
          profiling_sampled: true,
          profiling_sample_size: rows.length,
          profiling_row_count: rowCount,
        },
      }
    },
  )
  const schema = columns.map((column) => ({
    name: column.name,
    ordinal_position: column.ordinal_position,
    source_type: column.source_type,
    inferred_type: column.inferred_type,
  }))

  return {
    row_count: rowCount,
    column_count: columns.length,
    schema_hash: createStableHash(schema),
    columns,
    source_access: {
      mode: 'source_rows',
      connector,
      sampled_rows: rows.length,
      warnings:
        rows.length === MAX_PROFILE_SAMPLE_ROWS
          ? [
            `Profile statistics are based on the first ${MAX_PROFILE_SAMPLE_ROWS} rows.`,
          ]
          : [],
    },
  }
}

function buildSchemaSnapshot(
  summary: DatasetProfileSummary,
) {
  return {
    row_count: summary.row_count,
    column_count: summary.column_count,
    source_access: summary.source_access,
    columns: summary.columns.map((column) => ({
      name: column.name,
      ordinal_position: column.ordinal_position,
      source_type: column.source_type,
      inferred_type: column.inferred_type,
      total_count: column.total_count,
      non_null_count: column.non_null_count,
      null_count: column.null_count,
      blank_count: column.blank_count,
      zero_count: column.zero_count,
      distinct_count: column.distinct_count,
      distinct_percentage: column.distinct_percentage,
    })),
  }
}

async function persistProfileColumns(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
  columns: DatasetProfileColumn[],
) {
  const { error: deleteError } = await supabase
    .schema('profiling')
    .from('profile_columns')
    .delete()
    .eq('profile_run_id', profilingRunId)

  if (deleteError) {
    throw new Error(
      `Unable to reset profile columns: ${deleteError.message}`,
    )
  }

  if (columns.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_columns')
    .insert(
      columns.map((column) => ({
        profile_run_id: profilingRunId,
        column_name:
          column.name ??
          `column_${column.ordinal_position}`,
        ordinal_position: column.ordinal_position,
        source_type: column.source_type,
        inferred_type: column.inferred_type,
        total_count: column.total_count,
        non_null_count: column.non_null_count,
        null_count: column.null_count,
        blank_count: column.blank_count,
        zero_count: column.zero_count,
        distinct_count: column.distinct_count,
        distinct_percentage: column.distinct_percentage,
        metadata: column.metadata,
      })),
    )
    .select()

  if (error) {
    throw new Error(
      `Unable to persist profile columns: ${error.message}`,
    )
  }

  return data
}

async function persistProfileDatasetMetrics(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
  summary: DatasetProfileSummary,
) {
  const metricDefinitions = await getMetricDefinitions(
    supabase,
    [
      'schema_hash',
    ],
  )
  const schemaHashMetric = metricDefinitions.get('schema_hash')

  if (!schemaHashMetric) {
    return []
  }

  const { error: deleteError } = await supabase
    .schema('profiling')
    .from('profile_metrics')
    .delete()
    .eq('profile_run_id', profilingRunId)
    .eq('metric_key', 'schema_hash')

  if (deleteError) {
    throw new Error(
      `Unable to reset profile metrics: ${deleteError.message}`,
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_metrics')
    .insert({
      profile_run_id: profilingRunId,
      metric_definition_id: schemaHashMetric.id,
      metric_key: 'schema_hash',
      text_value: summary.schema_hash,
    })
    .select()

  if (error) {
    throw new Error(
      `Unable to persist profile metrics: ${error.message}`,
    )
  }

  return data
}

async function getMetricDefinitions(
  supabase: ReturnType<typeof createAdminClient>,
  metricKeys: string[],
) {
  const { data, error } = await supabase
    .schema('profiling')
    .from('metric_definitions')
    .select('id, metric_key')
    .in('metric_key', metricKeys)

  if (error) {
    throw new Error(
      `Unable to load metric definitions: ${error.message}`,
    )
  }

  return new Map(
    (data ?? []).map((definition) => [
      definition.metric_key,
      definition,
    ]),
  )
}

async function upsertProfileSchemaSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
  datasetVersionId: string,
  schemaHash: string,
  schema: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .schema('profiling')
    .from('schema_snapshots')
    .upsert(
      {
        profile_run_id: profilingRunId,
        dataset_version_id: datasetVersionId,
        schema_hash: schemaHash,
        schema,
      },
      {
        onConflict: 'profile_run_id',
      },
    )
    .select()
    .single()

  if (error) {
    throw new Error(
      `Unable to persist schema snapshot: ${error.message}`,
    )
  }

  return data
}

async function updateProfileRunSummary(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId: string,
  summary: DatasetProfileSummary,
) {
  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .update({
      status: 'COMPLETED',
      row_count: summary.row_count,
      column_count: summary.column_count,
      schema_hash: summary.schema_hash,
      summary: {
        row_count: summary.row_count,
        column_count: summary.column_count,
        schema_hash: summary.schema_hash,
        source_access: summary.source_access,
        columns: summary.columns.map((column) => ({
          name: column.name,
          type: column.inferred_type,
        })),
      },
      completed_at: new Date().toISOString(),
    })
    .eq('id', profilingRunId)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Unable to update profile run summary: ${error.message}`,
    )
  }

  return data
}

async function loadSourceRows(
  supabase: ReturnType<typeof createAdminClient>,
  connector: SourceConnector,
  maxRows: number,
) {
  const query = supabase
    .schema(connector.schema)
    .from(connector.table)

  const { count, error: countError } = await query
    .select('*', {
      count: 'exact',
      head: true,
    })

  if (countError) {
    throw new Error(
      `Unable to count source rows: ${countError.message}`,
    )
  }

  const { data, error } = await supabase
    .schema(connector.schema)
    .from(connector.table)
    .select('*')
    .range(0, maxRows - 1)

  if (error) {
    throw new Error(
      `Unable to load source rows: ${error.message}`,
    )
  }

  return {
    rowCount: count,
    rows: ((data ?? []) as Record<string, unknown>[]),
  }
}

function resolveSourceConnector(
  datasetVersion: DatasetVersionRecord,
): SourceConnector | null {
  const dataset = firstRecord(datasetVersion.datasets)
  const dataSource = firstRecord(dataset?.data_sources)
  const sourceType = normalizeConnectorType(
    dataSource?.source_type,
  )

  if (!sourceType) {
    return null
  }

  const connectionMetadata = asRecord(
    dataSource?.connection_metadata,
  ) ?? {}
  const datasetMetadata = asRecord(dataset?.metadata) ?? {}
  const versionMetadata = asRecord(datasetVersion.metadata) ?? {}
  const tableReference =
    getTableReference(connectionMetadata) ??
    getTableReference(datasetMetadata) ??
    getTableReference(versionMetadata) ??
    parseTableReference(dataset?.source_identifier) ??
    parseTableReference(datasetVersion.source_uri)

  if (!tableReference) {
    return null
  }

  return {
    kind: 'supabase_table',
    schema: tableReference.schema,
    table: tableReference.table,
  }
}

function normalizeConnectorType(
  sourceType: string | null | undefined,
) {
  const normalizedType =
    sourceType?.trim().toLowerCase()

  if (
    normalizedType === 'supabase' ||
    normalizedType === 'supabase_table' ||
    normalizedType === 'postgres' ||
    normalizedType === 'postgres_table' ||
    normalizedType === 'table'
  ) {
    return 'supabase_table'
  }

  return null
}

function firstRecord<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function getTableReference(
  metadata: Record<string, unknown>,
) {
  const schema =
    getStringMetadataValue(metadata, [
      'schema',
      'schema_name',
      'schemaName',
    ]) ?? 'public'
  const table =
    getStringMetadataValue(metadata, [
      'table',
      'table_name',
      'tableName',
    ])

  if (!table) {
    return null
  }

  return validateTableReference(schema, table)
}

function parseTableReference(
  value: string | null | undefined,
) {
  const reference = value?.trim()

  if (!reference) {
    return null
  }

  const withoutProtocol = reference
    .replace(/^supabase:\/\//i, '')
    .replace(/^postgres:\/\//i, '')
  const parts = withoutProtocol
    .split(/[./]/)
    .filter(Boolean)

  if (parts.length < 2) {
    return validateTableReference(
      'public',
      parts[0],
    )
  }

  return validateTableReference(
    parts[parts.length - 2],
    parts[parts.length - 1],
  )
}

function validateTableReference(
  schema: string | undefined,
  table: string | undefined,
) {
  if (
    !schema ||
    !table ||
    !isSafeSqlIdentifier(schema) ||
    !isSafeSqlIdentifier(table)
  ) {
    return null
  }

  return {
    schema,
    table,
  }
}

function isSafeSqlIdentifier(value: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null
  }

  return value as Record<string, unknown>
}

function getColumnName(column: unknown): string | null {
  if (typeof column === 'string' && column.trim()) {
    return column
  }

  const metadata = asRecord(column)

  if (!metadata) {
    return null
  }

  for (const field of COLUMN_NAME_FIELDS) {
    const value = metadata[field]

    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return null
}

function inferColumnType(
  column: unknown,
): InferredColumnType {
  const metadata = asRecord(column)

  if (!metadata) {
    return 'unknown'
  }

  const declaredType = getDeclaredColumnType(metadata)

  if (declaredType) {
    const inferredType = inferDeclaredColumnType(declaredType)

    if (inferredType !== 'unknown') {
      return inferredType
    }
  }

  return inferSampleValueType(getSampleValues(metadata))
}

function getDeclaredColumnType(
  metadata: DatasetColumnMetadata,
): string | null {
  for (const field of DECLARED_TYPE_FIELDS) {
    const value = metadata[field]

    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return null
}

function getNumericMetadataValue(
  metadata: DatasetColumnMetadata,
  fields: readonly string[],
): number | null {
  for (const field of fields) {
    const value = metadata[field]
    const numericValue = toFiniteNumber(value)

    if (numericValue !== null) {
      return numericValue
    }
  }

  return null
}

function toFiniteNumber(value: unknown): number | null {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()

  if (!normalizedValue) {
    return null
  }

  const numericValue = Number(normalizedValue)

  return Number.isFinite(numericValue)
    ? numericValue
    : null
}

function createStableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stabilizeJson(value)))
    .digest('hex')
}

function stabilizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stabilizeJson)
  }

  if (
    typeof value !== 'object' ||
    value === null
  ) {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>(
      (result, key) => {
        result[key] = stabilizeJson(
          (value as Record<string, unknown>)[key],
        )

        return result
      },
      {},
    )
}

function inferDeclaredColumnType(
  declaredType: string,
): InferredColumnType {
  const normalizedType = declaredType.trim().toLowerCase()

  if (/^(bool|boolean)\b/.test(normalizedType)) {
    return 'boolean'
  }

  if (/^(date|datetime|timestamp|timestamptz|time|timetz)\b/.test(normalizedType)) {
    return 'date'
  }

  if (
    /^(smallint|integer|bigint|int|decimal|numeric|real|double|float|number|money)\b/.test(
      normalizedType,
    )
  ) {
    return 'number'
  }

  if (
    /^(char|character|varchar|text|string|uuid|json|jsonb|xml|enum)\b/.test(
      normalizedType,
    )
  ) {
    return 'string'
  }

  return 'unknown'
}

function getSampleValues(
  metadata: DatasetColumnMetadata,
): unknown[] {
  for (const field of SAMPLE_VALUE_FIELDS) {
    const value = metadata[field]

    if (Array.isArray(value)) {
      return value
    }
  }

  return []
}

function inferSampleValueType(
  sampleValues: unknown[],
): InferredColumnType {
  const inferredTypes = new Set(
    sampleValues
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map(classifySampleValue),
  )

  if (inferredTypes.size === 0) {
    return 'unknown'
  }

  if (inferredTypes.size === 1) {
    return inferredTypes.values().next().value ?? 'unknown'
  }

  return inferredTypes.has('string')
    ? 'string'
    : 'unknown'
}

function classifySampleValue(
  value: unknown,
): InferredColumnType {
  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? 'number' : 'unknown'
  }

  if (typeof value !== 'string') {
    return 'unknown'
  }

  const normalizedValue = value.trim()

  if (/^(true|false)$/i.test(normalizedValue)) {
    return 'boolean'
  }

  if (
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(
      normalizedValue,
    )
  ) {
    return 'number'
  }

  if (
    /^\d{4}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?$/i.test(
      normalizedValue,
    ) &&
    !Number.isNaN(Date.parse(normalizedValue))
  ) {
    return 'date'
  }

  return 'string'
}


async function inspectDataset(
  supabase: ReturnType<typeof createAdminClient>,
  datasetVersionId: string,
) {
  const { data, error } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('*')
    .eq('id', datasetVersionId)
    .single()

  if (error) {
    throw new Error(
      `Unable to inspect dataset version: ${error.message}`,
    )
  }

  return {
    tool: 'inspect_dataset',
    dataset_version_id: datasetVersionId,
    dataset_version: data,
  }
}


async function getProfileRun(
  supabase: ReturnType<typeof createAdminClient>,
  profilingRunId?: string,
) {
  if (!profilingRunId) {
    throw new Error(
      'profilingRunId is required for get_profile_run',
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('*')
    .eq('id', profilingRunId)
    .single()

  if (error) {
    throw new Error(
      `Unable to get profile run: ${error.message}`,
    )
  }

  return {
    tool: 'get_profile_run',
    profiling_run_id: profilingRunId,
    profile_run: data,
  }
}


async function persistProfileSnapshot(
  supabase: ReturnType<typeof createAdminClient>,
  input: Record<string, unknown>,
) {
  const {
    profile_run_id,
    dataset_version_id,
    schema_hash,
    schema,
  } = input

  if (
    !profile_run_id ||
    !dataset_version_id ||
    !schema_hash ||
    !schema
  ) {
    throw new Error(
      'profile_run_id, dataset_version_id, schema_hash and schema are required',
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('schema_snapshots')
    .insert({
      profile_run_id,
      dataset_version_id,
      schema_hash,
      schema,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `Unable to persist schema snapshot: ${error.message}`,
    )
  }

  return {
    tool: 'persist_profile_snapshot',
    snapshot: data,
  }
}


async function completeProfileRun(
  supabase: ReturnType<typeof createAdminClient>,
  input: Record<string, unknown>,
) {
  const {
    profile_run_id,
    status = 'COMPLETED',
  } = input

  if (!profile_run_id) {
    throw new Error(
      'profile_run_id is required for complete_profile_run',
    )
  }

  const { data, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .update({
      status,
    })
    .eq('id', profile_run_id)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Unable to complete profile run: ${error.message}`,
    )
  }

  return {
    tool: 'complete_profile_run',
    profile_run: data,
  }
}