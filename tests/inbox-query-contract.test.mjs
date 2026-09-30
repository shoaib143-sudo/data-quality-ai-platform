import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = read('app/inbox/page.tsx')
const workflowMigration = read('supabase/migrations/20260904040000_enterprise_governance_hardening_foundation.sql')
const agentMigration = read('supabase/migrations/20260823000000_foundation_app_catalog_agent.sql')

function tableColumns(sql, table) {
  const body = sql.split(` ${table} (`)[1]?.split('\n);')[0]
    ?? sql.split(` ${table}\n(`)[1]?.split('\n);')[0]
  assert.ok(body, `Missing authoritative table definition for ${table}`)
  return new Set([...body.matchAll(/^\s*(\w+)\s+(?:uuid|text|integer|timestamptz|jsonb|agent\.run_status)\b/gm)].map(match => match[1]))
}

function exerciseQuery(table, columns, statuses) {
  const query = page.split('\n').find(line => line.includes(`.from('${table}')`))
  assert.ok(query, `Missing inbox query for ${table}`)
  const filters = []
  const builder = {
    select(fields) {
      for (const field of fields.split(',')) assert.ok(columns.has(field.trim()), `${table}.${field} does not exist`)
      return this
    },
    eq(field, value) { return this.in(field, [value]) },
    in(field, values) {
      assert.ok(columns.has(field), `Unknown filter column ${field}`)
      for (const value of values) assert.ok(statuses.has(value), `${table} does not accept status ${value}`)
      filters.push(...values)
      return this
    },
    order(field) { assert.ok(columns.has(field), `Unknown ordering column ${field}`); return this },
    limit() { return this },
  }
  const supabase = { schema() { return { from(name) { assert.equal(name, table); return builder } } } }
  vm.runInNewContext(query.trim().replace(/,$/, ''), { supabase, canWorkflows: true, canMonitoring: true, Promise })
  return filters
}

test('inbox workflow query matches persisted workflow fields and active lifecycle state', () => {
  const statuses = new Set(workflowMigration.match(/check\(status in \(('RUNNING'[^)]*)\)\)/)[1].match(/'[^']+'/g).map(value => value.slice(1, -1)))
  const filters = exerciseQuery('workflow_instances', tableColumns(workflowMigration, 'governance.workflow_instances'), statuses)
  assert.deepEqual(filters, ['RUNNING'], 'Only active workflow instances require continued governance action')
})

test('inbox execution query accepts canonical queued, active, and failed agent states', () => {
  const enumBody = agentMigration.split('CREATE TYPE agent.run_status AS ENUM')[1].split(');')[0]
  const statuses = new Set(enumBody.match(/'[^']+'/g).map(value => value.slice(1, -1)))
  const filters = exerciseQuery('agent_runs', tableColumns(agentMigration, 'agent.agent_runs'), statuses)
  assert.deepEqual(new Set(filters), new Set(['CREATED', 'QUEUED', 'RUNNING', 'WAITING', 'FAILED']))
})
