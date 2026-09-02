const DEFAULT_TIMEOUT_MS = 10_000

export type JdbcConnectionConfig = {
  jdbcUrl: string
  credentialRef: string
  schema: string
  table: string
}

export type JdbcValidationResult = {
  valid: boolean
  columns: Array<{ name: string; type?: string | null }>
  rowCount: number | null
  details: Record<string, unknown>
  errors: string[]
  warnings: string[]
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`)
  }
  return value.trim()
}

function validateBridgeUrl(value: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('JDBC bridge URL must be a valid absolute URL.')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('JDBC bridge URL must use HTTPS.')
  }
  const hostname = parsed.hostname.toLowerCase()
  const blockedHosts = new Set([
    'localhost',
    'localhost.localdomain',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    '169.254.169.254',
  ])
  if (blockedHosts.has(hostname)) {
    throw new Error('JDBC bridge URL cannot target a local or cloud metadata host.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('JDBC bridge URL must not contain embedded credentials.')
  }
  return value.replace(/\/$/, '')
}

function bridgeBaseUrl() {
  const value = process.env.JDBC_BRIDGE_URL?.trim()
  if (!value) {
    throw new Error('JDBC connector requires JDBC_BRIDGE_URL in server-side configuration.')
  }
  return validateBridgeUrl(value)
}

function bridgeHeaders() {
  const token = process.env.JDBC_BRIDGE_TOKEN?.trim()
  if (!token) {
    throw new Error('JDBC connector requires JDBC_BRIDGE_TOKEN for the connector bridge.')
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
  }
}

function safeIdentifier(value: string, field: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${field} contains invalid identifier characters.`)
  }
  return value
}

function rejectEmbeddedCredentials(jdbcUrl: string) {
  // JDBC URLs can embed user/password material in URI-style authority sections.
  // Credentials must always be resolved from credential_ref by the bridge.
  if (/jdbc:[^:]+:\/\/[^/\s:@]+:[^/\s@]+@/i.test(jdbcUrl) || /jdbc:[^:]+:\/\/[^/\s@]+@/i.test(jdbcUrl)) {
    throw new Error('JDBC URL must not contain embedded credentials; use credentialRef.')
  }
}

function normalizeConfig(input: JdbcConnectionConfig): JdbcConnectionConfig {
  const jdbcUrl = requiredString(input.jdbcUrl, 'jdbcUrl')
  const credentialRef = requiredString(input.credentialRef, 'credentialRef')
  const schema = safeIdentifier(requiredString(input.schema, 'schema'), 'schema')
  const table = safeIdentifier(requiredString(input.table, 'table'), 'table')
  rejectEmbeddedCredentials(jdbcUrl)
  return { ...input, jdbcUrl, credentialRef, schema, table }
}

async function bridgeRequest<T>(path: string, config: JdbcConnectionConfig, body: Record<string, unknown>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${bridgeBaseUrl()}${path}`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body: JSON.stringify(body),
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
  } finally {
    clearTimeout(timeout)
  }
}

export async function validateJdbcConnection(input: JdbcConnectionConfig): Promise<JdbcValidationResult> {
  const config = normalizeConfig(input)
  try {
    const result = await bridgeRequest<{
      columns?: Array<{ name: string; type?: string | null }>
      row_count?: number | null
      warnings?: string[]
      details?: Record<string, unknown>
    }>('/v1/validate', config, {
      jdbc_url: config.jdbcUrl,
      credential_ref: config.credentialRef,
      schema: config.schema,
      table: config.table,
    })
    return {
      valid: true,
      columns: Array.isArray(result.columns) ? result.columns : [],
      rowCount: typeof result.row_count === 'number' ? result.row_count : null,
      details: result.details ?? {},
      errors: [],
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    }
  } catch (error) {
    return {
      valid: false,
      columns: [],
      rowCount: null,
      details: {},
      errors: [error instanceof Error ? error.message : 'JDBC validation failed.'],
      warnings: [],
    }
  }
}

export async function loadJdbcRows(input: JdbcConnectionConfig, limit: number) {
  const config = normalizeConfig(input)
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error('JDBC row limit must be between 1 and 10000.')
  const result = await bridgeRequest<{
    rows?: Record<string, unknown>[]
    row_count?: number | null
    columns?: Array<{ name: string; type?: string | null }>
  }>('/v1/query', config, {
    jdbc_url: config.jdbcUrl,
    credential_ref: config.credentialRef,
    schema: config.schema,
    table: config.table,
    limit,
  })
  return {
    rows: Array.isArray(result.rows) ? result.rows : [],
    rowCount: typeof result.row_count === 'number' ? result.row_count : null,
    columns: Array.isArray(result.columns) ? result.columns : [],
  }
}

export function parseJdbcTableReference(value: string | null | undefined) {
  const reference = value?.trim()
  if (!reference) return null
  const normalized = reference.replace(/^jdbc-table:\/\//i, '')
  const parts = normalized.split('.').filter(Boolean)
  if (parts.length === 1) return { schema: 'public', table: parts[0] }
  return { schema: parts[parts.length - 2], table: parts[parts.length - 1] }
}
