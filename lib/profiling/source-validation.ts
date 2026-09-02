import type { SupabaseClient } from '@supabase/supabase-js'

export type SourceValidationResult = {
  valid: boolean
  source_type: string
  execution_type: 'FILE' | 'TABLE'
  source_uri: string
  checks: {
    configuration: boolean
    connectivity: boolean
    schema_available: boolean
  }
  details: Record<string, unknown>
  errors: string[]
  warnings: string[]
}

type DataSource = {
  id: string
  project_id: string
  source_type: string | null
  connection_metadata: unknown
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(source[key])
    if (value) return value
  }
  return null
}

function validIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)
}

export async function validateDataSourceForProfiling(
  supabase: SupabaseClient,
  source: DataSource,
  sourceIdentifier: string,
): Promise<SourceValidationResult> {
  const sourceType = String(source.source_type ?? '').trim().toLowerCase()
  const metadata = record(source.connection_metadata)
  const sourceUri = sourceIdentifier.trim()
  const errors: string[] = []
  const warnings: string[] = []

  if (!sourceUri) errors.push('A source identifier is required.')

  if (['file', 'csv'].includes(sourceType)) {
    const url = firstString(metadata, ['url', 'source_url', 'sourceUrl'])
      ?? (/^https?:\/\//i.test(sourceUri) ? sourceUri : null)
    const bucket = firstString(metadata, ['bucket', 'bucket_id', 'bucketId', 'storage_bucket', 'storageBucket'])
    const path = firstString(metadata, ['path', 'storage_path', 'storagePath', 'object_path', 'objectPath']) ?? sourceUri

    if (!url && (!bucket || !path)) {
      errors.push('FILE sources require an HTTPS URL or a Supabase Storage bucket and object path.')
    }

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
        if (url) {
          const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
          if (!response.ok) errors.push(`FILE source connectivity check returned HTTP ${response.status}.`)
        } else {
          const directory = path!.split('/').slice(0, -1).join('/')
          const filename = path!.split('/').pop() ?? path!
          const storageResult = await supabase.storage.from(bucket!).list(directory, {
            search: filename,
            limit: 1,
          })
          if (storageResult.error) {
            errors.push(`Unable to access Supabase Storage object: ${storageResult.error.message}`)
          } else if (!storageResult.data.some((item) => item.name === filename)) {
            errors.push(`Supabase Storage object ${bucket}/${path} was not found.`)
          }
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'FILE source connectivity check failed.')
      }
    }

    return {
      valid: errors.length === 0,
      source_type: sourceType.toUpperCase(),
      execution_type: 'FILE',
      source_uri: url ?? `storage://${bucket}/${path}`,
      checks: {
        configuration: !errors.some((error) => error.includes('require') || error.includes('valid')),
        connectivity: errors.length === 0,
        schema_available: false,
      },
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

  let schemaAvailable = false
  let connectivity = false
  let rowCount: number | null = null
  const tableName = table

  if (errors.length === 0 && tableName) {
    const { count, error: countError } = await supabase
      .schema(schema)
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (countError) {
      errors.push(`Source connectivity/schema check failed: ${countError.message}`)
    } else {
      schemaAvailable = true
      connectivity = true
      rowCount = count ?? 0
      if (rowCount === 0) warnings.push('Source table is reachable but currently contains no rows.')
    }
  }

  return {
    valid: errors.length === 0,
    source_type: sourceType.toUpperCase(),
    execution_type: 'TABLE',
    source_uri: `${schema}.${tableName ?? ''}`,
    checks: {
      configuration: !errors.some((error) => error.includes('require') || error.includes('invalid identifier')),
      connectivity,
      schema_available: schemaAvailable,
    },
    details: { schema, table: tableName, row_count: rowCount },
    errors,
    warnings,
  }
}
