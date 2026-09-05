import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSchemaNames, readSchemaScope, resolveSchemaScope, SchemaScopeError } from '../lib/connectors/schema-scope.ts'

test('multiple schemas preserve their scope without a legacy single-schema override', () => {
  const scope = readSchemaScope({ schema_scope: 'selected', schemas: ['silver', 'bronze', 'BRONZE'], schema: 'PUB' })
  assert.deepEqual(resolveSchemaScope(scope, ['bronze', 'gold', 'silver']), ['bronze', 'silver'])
})

test('catalog-wide discovery excludes only the system metadata schema', () => {
  const scope = readSchemaScope({ schema_scope: 'all', schemas: ['PUB'], schema: 'PUB' })
  assert.deepEqual(resolveSchemaScope(scope, ['silver', 'information_schema', 'bronze']), ['bronze', 'silver'])
})

test('legacy connections remain scoped until the operator changes their selection', () => {
  assert.deepEqual(readSchemaScope({ schema: 'PUB' }), { schemaScope: 'selected', schemas: ['PUB'] })
  assert.throws(() => resolveSchemaScope(readSchemaScope({ schema: 'PUB' }), ['bronze', 'silver']), error => error instanceof SchemaScopeError && error.availableSchemas.join(',') === 'bronze,silver')
})

test('Databricks names resolve to authoritative casing and duplicate inputs collapse', () => {
  assert.deepEqual(resolveSchemaScope(readSchemaScope({ schemas: [' SILVER ', 'silver', 'BRONZE'] }), ['silver', 'bronze']), ['bronze', 'silver'])
})

test('invalid or empty explicit scope never silently expands to the entire catalog', () => {
  assert.throws(() => readSchemaScope({ schemaScope: 'selected', schemas: [] }))
  assert.throws(() => readSchemaScope({ schemaScope: 'unexpected' }))
  assert.throws(() => normalizeSchemaNames('bronze,silver'))
  assert.throws(() => normalizeSchemaNames(['bronze', '']))
})
