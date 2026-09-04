import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_TIMEOUT_MS = 30_000
const POSTGRES_EDGE_FUNCTION = 'dgp-postgres-connector'

export type JdbcConnectionConfig = {
  jdbcUrl: string
  credentialRef: string
  schema: string
  table: string
  catalog?: string | null
}

export type JdbcCatalogResult = {
  schemas: string[]
  tables: Array<{ name: string; type?: string | null; catalog?: string | null; schema?: string | null; remarks?: string | null }>
  details: Record<string, unknown>
}

export type JdbcValidationResult = {
  valid: boolean
  columns: Array<{ name: string; type?: string | null; size?: number | null; scale?: number | null; nullable?: boolean | null; defaultValue?: string | null }>
  rowCount: number | null
  details: Record<string, unknown>
  errors: string[]
  warnings: string[]
}

export type JdbcTransformation = {
  catalog?: string | null
  schema?: string | null
  name: string
  operation: string
  transformationLogic: string
  logicHash: string
  engine: string
}

export type JdbcLineageResult = {
  databaseProduct: string | null
  databaseVersion: string | null
  catalog: string | null
  schema: string | null
  transformations: JdbcTransformation[]
  warnings: string[]
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value.trim()
}

function connectorTimeoutMs() {
  const configured = Number(process.env.JDBC_CONNECTOR_TIMEOUT_MS)
  return Number.isFinite(configured) && configured >= 1_000 ? Math.min(configured, 180_000) : DEFAULT_TIMEOUT_MS
}

function validateBridgeUrl(value: string) {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('JDBC bridge URL must be a valid absolute URL.') }
  if (parsed.protocol !== 'https:') throw new Error('JDBC bridge URL must use HTTPS.')
  const hostname = parsed.hostname.toLowerCase()
  const blockedHosts = new Set(['localhost', 'localhost.localdomain', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'])
  if (blockedHosts.has(hostname)) throw new Error('JDBC bridge URL cannot target a local or cloud metadata host.')
  if (parsed.username || parsed.password) throw new Error('JDBC bridge URL must not contain embedded credentials.')
  return value.replace(/\/$/, '')
}

function bridgeBaseUrl() {
  const value = process.env.JDBC_BRIDGE_URL?.trim()
  if (!value) throw new Error('JDBC connector requires JDBC_BRIDGE_URL in server-side configuration.')
  return validateBridgeUrl(value)
}

function bridgeHeaders() {
  const token = process.env.JDBC_BRIDGE_TOKEN?.trim()
  if (!token) throw new Error('JDBC connector requires JDBC_BRIDGE_TOKEN for the connector bridge.')
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` }
}

function bridgeConfigured() {
  return Boolean(process.env.JDBC_BRIDGE_URL?.trim() && process.env.JDBC_BRIDGE_TOKEN?.trim())
}

function isPostgresJdbcUrl(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('jdbc:postgresql://')
}

export function jdbcEngineFromUrl(value: string | null | undefined) {
  const url = value?.trim().toLowerCase() ?? ''
  if (url.startsWith('jdbc:postgresql:')) return 'POSTGRESQL'
  if (url.startsWith('jdbc:sqlserver:')) return 'SQL_SERVER'
  if (url.startsWith('jdbc:mysql:')) return 'MYSQL'
  if (url.startsWith('jdbc:mariadb:')) return 'MARIADB'
  if (url.startsWith('jdbc:databricks:')) return 'DATABRICKS'
  if (url.startsWith('jdbc:snowflake:')) return 'SNOWFLAKE'
  if (url.startsWith('jdbc:redshift:')) return 'REDSHIFT'
  if (url.startsWith('jdbc:oracle:')) return 'ORACLE'
  return 'GENERIC_JDBC'
}

function safeIdentifier(value: string, field: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_$#@-]*$/.test(value)) throw new Error(`${field} contains invalid identifier characters.`)
  return value
}

function rejectEmbeddedCredentials(jdbcUrl: string) {
  const authorityCredentials = /jdbc:[^:]+:\/\/[^/\s@]+@/i
  const credentialProperty = /(?:[?&;])(?:user(?:name)?|uid|password|passwd|pwd|pass|token|access_token|accesstoken|secret|client_secret)=/i
  const oracleThinCredentials = /^jdbc:oracle:thin:[^:@/\s]+(?:\/[^@\s]+)?@/i
  if (authorityCredentials.test(jdbcUrl) || credentialProperty.test(jdbcUrl) || oracleThinCredentials.test(jdbcUrl)) {
    throw new Error('JDBC URL must not contain embedded credentials; use credentialRef.')
  }
}

function normalizeConfig(input: JdbcConnectionConfig): JdbcConnectionConfig {
  const jdbcUrl = requiredString(input.jdbcUrl, 'jdbcUrl')
  const credentialRef = requiredString(input.credentialRef, 'credentialRef')
  const schema = safeIdentifier(requiredString(input.schema, 'schema'), 'schema')
  const table = safeIdentifier(requiredString(input.table, 'table'), 'table')
  const catalog = input.catalog?.trim() ? safeIdentifier(input.catalog.trim(), 'catalog') : null
  rejectEmbeddedCredentials(jdbcUrl)
  return { ...input, jdbcUrl, credentialRef, schema, table, catalog }
}

function normalizeDiscoveryConfig(input: { jdbcUrl: string; credentialRef: string; schema?: string; catalog?: string }) {
  const jdbcUrl = requiredString(input.jdbcUrl, 'jdbcUrl')
  const credentialRef = requiredString(input.credentialRef, 'credentialRef')
  const schema = input.schema?.trim() || undefined
  const catalog = input.catalog?.trim() || undefined
  if (schema) safeIdentifier(schema, 'schema')
  if (catalog) safeIdentifier(catalog, 'catalog')
  rejectEmbeddedCredentials(jdbcUrl)
  return { jdbcUrl, credentialRef, schema, catalog }
}

function bridgeBody(body: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...body }
  if ('jdbc_url' in normalized) { normalized.jdbcUrl = normalized.jdbc_url; delete normalized.jdbc_url }
  if ('credential_ref' in normalized) { normalized.credentialRef = normalized.credential_ref; delete normalized.credential_ref }
  return normalized
}

async function bridgeRequest<T>(path: string, body: Record<string, unknown>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), connectorTimeoutMs())
  try {
    const response = await fetch(`${bridgeBaseUrl()}${path}`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body: JSON.stringify(bridgeBody(body)),
      cache: 'no-store',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const message = payload && typeof payload.error === 'string' ? payload.error : `JDBC bridge returned HTTP ${response.status}.`
      throw new Error(message)
    }
    return payload as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('JDBC bridge request timed out.')
    throw error
  } finally { clearTimeout(timeout) }
}

function edgeAction(path: string) {
  if (path === '/v1/catalog') return 'catalog'
  if (path === '/v1/validate') return 'validate'
  if (path === '/v1/query') return 'query'
  if (path === '/v1/lineage') return 'lineage'
  throw new Error('Unsupported PostgreSQL connector operation.')
}

async function postgresEdgeRequest<T>(path: string, body: Record<string, unknown>) {
  if (!isPostgresJdbcUrl(body.jdbc_url)) throw new Error('The built-in connector supports PostgreSQL JDBC URLs only.')
  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke(POSTGRES_EDGE_FUNCTION, {
    body: { action: edgeAction(path), ...body },
  })
  if (error) {
    let message = error.message || 'PostgreSQL connector request failed.'
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown }
        if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error.trim()
      } catch {
        try {
          const detail = await context.clone().text()
          if (detail.trim()) message = detail.trim()
        } catch {}
      }
    }
    throw new Error(message)
  }
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  if (typeof payload.error === 'string') throw new Error(payload.error)
  return payload as T
}

async function connectorRequest<T>(path: string, body: Record<string, unknown>) {
  if (isPostgresJdbcUrl(body.jdbc_url)) {
    try { return await postgresEdgeRequest<T>(path, body) }
    catch (error) {
      if (!bridgeConfigured() || path !== '/v1/lineage') throw error
      return bridgeRequest<T>(path, body)
    }
  }
  if (bridgeConfigured()) return bridgeRequest<T>(path, body)
  throw new Error(`The JDBC bridge is not configured for ${jdbcEngineFromUrl(String(body.jdbc_url ?? ''))}.`)
}

export async function discoverJdbcCatalog(input: { jdbcUrl: string; credentialRef: string; schema?: string; catalog?: string }): Promise<JdbcCatalogResult> {
  const config = normalizeDiscoveryConfig(input)
  const result = await connectorRequest<{ schemas?: string[]; tables?: JdbcCatalogResult['tables']; details?: Record<string, unknown> }>('/v1/catalog', {
    jdbc_url: config.jdbcUrl,
    credential_ref: config.credentialRef,
    ...(config.schema ? { schema: config.schema } : {}),
    ...(config.catalog ? { catalog: config.catalog } : {}),
  })
  return { schemas: Array.isArray(result.schemas) ? result.schemas : [], tables: Array.isArray(result.tables) ? result.tables : [], details: result.details ?? {} }
}

export async function validateJdbcConnection(input: JdbcConnectionConfig): Promise<JdbcValidationResult> {
  const config = normalizeConfig(input)
  try {
    const result = await connectorRequest<{
      columns?: JdbcValidationResult['columns']
      row_count?: number | null
      rowCount?: number | null
      warnings?: string[]
      details?: Record<string, unknown>
    }>('/v1/validate', {
      jdbc_url: config.jdbcUrl,
      credential_ref: config.credentialRef,
      schema: config.schema,
      table: config.table,
      ...(config.catalog ? { catalog: config.catalog } : {}),
    })
    const rowCount = typeof result.row_count === 'number' ? result.row_count : typeof result.rowCount === 'number' ? result.rowCount : null
    return { valid: true, columns: Array.isArray(result.columns) ? result.columns : [], rowCount, details: result.details ?? {}, errors: [], warnings: Array.isArray(result.warnings) ? result.warnings : [] }
  } catch (error) {
    return { valid: false, columns: [], rowCount: null, details: { engine: jdbcEngineFromUrl(config.jdbcUrl) }, errors: [error instanceof Error ? error.message : 'JDBC validation failed.'], warnings: [] }
  }
}

export async function loadJdbcRows(input: JdbcConnectionConfig, limit: number) {
  const config = normalizeConfig(input)
  if (!Number.isInteger(limit) || limit < 1) throw new Error('JDBC row limit must be a positive integer.')
  const result = await connectorRequest<{
    rows?: Record<string, unknown>[]
    row_count?: number | null
    rowCount?: number | null
    columns?: JdbcValidationResult['columns']
    warnings?: string[]
  }>('/v1/query', {
    jdbc_url: config.jdbcUrl,
    credential_ref: config.credentialRef,
    schema: config.schema,
    table: config.table,
    limit,
    ...(config.catalog ? { catalog: config.catalog } : {}),
  })
  const rowCount = typeof result.row_count === 'number' ? result.row_count : typeof result.rowCount === 'number' ? result.rowCount : null
  return {
    rows: Array.isArray(result.rows) ? result.rows : [],
    rowCount,
    columns: Array.isArray(result.columns) ? result.columns : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  }
}

export async function discoverJdbcTransformations(input: JdbcConnectionConfig): Promise<JdbcLineageResult> {
  const config = normalizeConfig(input)
  const result = await connectorRequest<{
    databaseProduct?: string | null
    database_product?: string | null
    databaseVersion?: string | null
    database_version?: string | null
    catalog?: string | null
    schema?: string | null
    transformations?: JdbcTransformation[]
    warnings?: string[]
  }>('/v1/lineage', {
    jdbc_url: config.jdbcUrl,
    credential_ref: config.credentialRef,
    schema: config.schema,
    table: config.table,
    ...(config.catalog ? { catalog: config.catalog } : {}),
  })
  return {
    databaseProduct: result.databaseProduct ?? result.database_product ?? null,
    databaseVersion: result.databaseVersion ?? result.database_version ?? null,
    catalog: result.catalog ?? config.catalog ?? null,
    schema: result.schema ?? config.schema,
    transformations: Array.isArray(result.transformations) ? result.transformations : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  }
}

export function parseJdbcTableReference(value: string | null | undefined) {
  const reference = value?.trim()
  if (!reference) return null
  const normalized = reference.replace(/^jdbc-table:\/\//i, '')
  const parts = normalized.split('.').filter(Boolean)
  if (parts.length === 1) return { catalog: null, schema: 'public', table: parts[0] }
  if (parts.length === 2) return { catalog: null, schema: parts[0], table: parts[1] }
  return { catalog: parts[parts.length - 3], schema: parts[parts.length - 2], table: parts[parts.length - 1] }
}