import type { SupabaseClient } from '@supabase/supabase-js'
import { validateJdbcConnection } from '@/lib/connectors/jdbc'
import { loadFileSource } from '@/lib/profiling/file-source-adapter'

export type SourceValidationResult = {
  valid: boolean
  source_type: string
  execution_type: 'FILE' | 'TABLE' | 'JDBC'
  source_uri: string
  checks: { configuration: boolean; connectivity: boolean; schema_available: boolean }
  details: Record<string, unknown>
  errors: string[]
  warnings: string[]
}

type DataSource = { id: string; project_id: string; source_type: string | null; connection_metadata: unknown }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function stringValue(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function firstString(source: Record<string, unknown>, keys: string[]) { for (const key of keys) { const value = stringValue(source[key]); if (value) return value } return null }
function validIdentifier(value: string) { return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value) }

export async function validateDataSourceForProfiling(supabase: SupabaseClient, source: DataSource, sourceIdentifier: string): Promise<SourceValidationResult> {
  const sourceType = String(source.source_type ?? '').trim().toLowerCase()
  const metadata = record(source.connection_metadata)
  const sourceUri = sourceIdentifier.trim()
  const errors: string[] = []
  const warnings: string[] = []
  if (!sourceUri) errors.push('A source identifier is required.')

  if (sourceType === 'jdbc') {
    const schema = firstString(metadata, ['schema', 'schema_name', 'schemaName']) ?? 'public'
    const table = firstString(metadata, ['table', 'table_name', 'tableName'])
    const jdbcUrl = firstString(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
    const credentialRef = firstString(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
    const rawCredentialKeys = ['password', 'passwd', 'secret', 'client_secret', 'private_key']
    const suppliedBridgeKeys = ['bridge_url', 'bridgeUrl']
    if (rawCredentialKeys.some((key) => Object.prototype.hasOwnProperty.call(metadata, key))) errors.push('JDBC source configuration cannot contain raw credentials; use credential_ref.')
    if (suppliedBridgeKeys.some((key) => Object.prototype.hasOwnProperty.call(metadata, key))) errors.push('JDBC source configuration cannot override the server-managed bridge destination.')
    if (!jdbcUrl) errors.push('JDBC sources require jdbc_url in connection metadata.')
    if (!credentialRef) errors.push('JDBC sources require credential_ref; raw database passwords are not accepted.')
    if (!table) errors.push('JDBC sources require a table name in connection metadata.')
    if (!validIdentifier(schema)) errors.push('JDBC source schema contains invalid identifier characters.')
    if (table && !validIdentifier(table)) errors.push('JDBC source table contains invalid identifier characters.')
    if (errors.length === 0) {
      const validation = await validateJdbcConnection({ jdbcUrl: jdbcUrl!, credentialRef: credentialRef!, schema, table: table! })
      errors.push(...validation.errors); warnings.push(...validation.warnings)
      if (validation.rowCount === 0) warnings.push('JDBC source table is reachable but currently contains no rows.')
      return {
        valid: errors.length === 0, source_type: 'JDBC', execution_type: 'JDBC', source_uri: `jdbc-table://${schema}.${table}`,
        checks: { configuration: true, connectivity: validation.valid, schema_available: validation.valid && validation.columns.length > 0 },
        details: { jdbc_url: jdbcUrl, credential_ref: credentialRef, schema, table, row_count: validation.rowCount, columns: validation.columns, bridge: validation.details }, errors, warnings,
      }
    }
    return { valid: false, source_type: 'JDBC', execution_type: 'JDBC', source_uri: `jdbc-table://${schema}.${table ?? ''}`, checks: { configuration: false, connectivity: false, schema_available: false }, details: { jdbc_url: jdbcUrl, credential_ref: credentialRef, schema, table }, errors, warnings }
  }

  if (['file', 'csv'].includes(sourceType)) {
    const url = firstString(metadata, ['url', 'source_url', 'sourceUrl']) ?? (/^https?:\/\//i.test(sourceUri) ? sourceUri : null)
    const bucket = firstString(metadata, ['bucket', 'bucket_id', 'bucketId', 'storage_bucket', 'storageBucket'])
    const path = firstString(metadata, ['path', 'storage_path', 'storagePath', 'object_path', 'objectPath']) ?? sourceUri
    if (!url && (!bucket || !path)) errors.push('FILE sources require an HTTPS URL or a Supabase Storage bucket and object path.')
    if (url) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.push('FILE source URL must use HTTP or HTTPS.')
      } catch {
        errors.push('FILE source URL is not valid.')
      }
    }

    if (errors.length === 0) {
      try {
        const executionConfig = url ? { ...metadata, url } : { ...metadata, bucket, path }
        const loaded = await loadFileSource(supabase, { sourceUri, executionConfig }, { maxRows: 25 })
        warnings.push(...loaded.warnings)
        if (loaded.rowCount === 0) warnings.push('FILE source is reachable but contains no profileable records.')
        return {
          valid: true,
          source_type: sourceType.toUpperCase(),
          execution_type: 'FILE',
          source_uri: loaded.sourceUri,
          checks: { configuration: true, connectivity: true, schema_available: loaded.rows.length > 0 },
          details: {
            url,
            bucket,
            path,
            format: loaded.format,
            content_type: loaded.contentType,
            row_count: loaded.rowCount,
            sampled_rows: loaded.rows.length,
            columns: Array.from(loaded.rows.reduce<Set<string>>((names, row) => {
              Object.keys(row).forEach((name) => names.add(name))
              return names
            }, new Set())),
            metadata: loaded.metadata,
          },
          errors,
          warnings,
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'FILE source connectivity/content scan failed.')
      }
    }

    return {
      valid: false,
      source_type: sourceType.toUpperCase(),
      execution_type: 'FILE',
      source_uri: url ?? `storage://${bucket ?? ''}/${path ?? ''}`,
      checks: { configuration: !errors.some((error) => error.includes('require') || error.includes('valid')), connectivity: false, schema_available: false },
      details: { url, bucket, path },
      errors,
      warnings,
    }
  }

  const schema = firstString(metadata, ['schema', 'schema_name', 'schemaName']) ?? 'public'
  const table = firstString(metadata, ['table', 'table_name', 'tableName'])
  if (!table) errors.push('TABLE sources require a table name in connection metadata.')
  if (!validIdentifier(schema)) errors.push('Source schema contains invalid identifier characters.')
  if (table && !validIdentifier(table)) errors.push('Source table contains invalid identifier characters.')
  let schemaAvailable = false, connectivity = false, rowCount: number | null = null
  if (errors.length === 0 && table) { const { count, error: countError } = await supabase.schema(schema).from(table).select('*', { count: 'exact', head: true }); if (countError) errors.push(`Source connectivity/schema check failed: ${countError.message}`); else { schemaAvailable = true; connectivity = true; rowCount = count ?? 0; if (rowCount === 0) warnings.push('Source table is reachable but currently contains no rows.') } }
  return { valid: errors.length === 0, source_type: sourceType.toUpperCase(), execution_type: 'TABLE', source_uri: `${schema}.${table ?? ''}`, checks: { configuration: !errors.some((error) => error.includes('require') || error.includes('invalid identifier')), connectivity, schema_available: schemaAvailable }, details: { schema, table, row_count: rowCount }, errors, warnings }
}
