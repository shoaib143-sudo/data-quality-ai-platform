export type SchemaScope = { schemaScope: 'all' | 'selected'; schemas: string[] }

export function normalizeSchemaNames(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('Schemas must be an array of non-empty names.')
  }
  return [...new Map(value.map(name => [name.trim().toLowerCase(), name.trim()])).values()]
    .sort((left, right) => left.localeCompare(right))
}

export function readSchemaScope(metadata: Record<string, unknown>): SchemaScope {
  const mode = metadata.schemaScope ?? metadata.schema_scope
  if (mode !== undefined && mode !== 'all' && mode !== 'selected') throw new Error('Invalid schema scope.')
  if (mode === 'all') return { schemaScope: 'all', schemas: [] }
  const schemas = normalizeSchemaNames(metadata.schemas)
  if (schemas.length) return { schemaScope: 'selected', schemas }
  if (mode === 'selected') throw new Error('Select at least one schema or choose all data schemas.')
  const legacy = metadata.schema ?? metadata.schema_name ?? metadata.schemaName
  return typeof legacy === 'string' && legacy.trim()
    ? { schemaScope: 'selected', schemas: [legacy.trim()] }
    : { schemaScope: 'all', schemas: [] }
}

export class SchemaScopeError extends Error {
  availableSchemas: string[]
  constructor(message: string, availableSchemas: string[]) {
    super(message)
    this.name = 'SchemaScopeError'
    this.availableSchemas = availableSchemas
  }
}

export function resolveSchemaScope(scope: SchemaScope, availableSchemas: string[]): string[] {
  const available = normalizeSchemaNames(availableSchemas)
  if (scope.schemaScope === 'all') return available.filter(name => name.toLowerCase() !== 'information_schema')
  const byName = new Map(available.map(name => [name.toLowerCase(), name]))
  const missing = scope.schemas.filter(name => !byName.has(name.toLowerCase()))
  if (missing.length) throw new SchemaScopeError(`Selected schemas are unavailable: ${missing.join(', ')}. Choose from the discovered schemas.`, available)
  return scope.schemas.map(name => byName.get(name.toLowerCase())!)
}
