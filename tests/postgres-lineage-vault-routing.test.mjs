import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('lib/connectors/jdbc.ts', 'utf8')

test('PostgreSQL requests remain on the Vault-backed Edge connector', () => {
  const start = source.indexOf('async function connectorRequest')
  const end = source.indexOf('export async function discoverJdbcCatalog', start)
  assert.ok(start >= 0)
  assert.ok(end > start)
  const routing = source.slice(start, end)

  assert.match(routing, /if \(isPostgresJdbcUrl\(body\.jdbc_url\)\) \{[\s\S]*return postgresEdgeRequest<T>\(path, body\)/)
  const postgresBranch = routing.slice(
    routing.indexOf('if (isPostgresJdbcUrl(body.jdbc_url))'),
    routing.indexOf('if (isDatabricksJdbcUrl(body.jdbc_url))'),
  )
  assert.doesNotMatch(postgresBranch, /bridgeRequest/)
  assert.doesNotMatch(postgresBranch, /bridgeConfigured/)
})

test('generic JDBC and Databricks fallback behavior remains available', () => {
  const start = source.indexOf('async function connectorRequest')
  const end = source.indexOf('export async function discoverJdbcCatalog', start)
  const routing = source.slice(start, end)

  assert.match(routing, /if \(isDatabricksJdbcUrl\(body\.jdbc_url\)\)/)
  assert.match(routing, /if \(bridgeConfigured\(\)\) return bridgeRequest<T>\(path, body\)/)
})
