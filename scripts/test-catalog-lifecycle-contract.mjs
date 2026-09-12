import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const uiPath = new URL('../app/catalog/catalog-manager.tsx', import.meta.url)
const apiPath = new URL('../app/api/catalog/[datasetId]/route.ts', import.meta.url)
const [ui, api] = await Promise.all([
  readFile(uiPath, 'utf8'),
  readFile(apiPath, 'utf8'),
])

const selectMatch = ui.match(/<select name="lifecycleStatus"[\s\S]*?<\/select>/)
assert.ok(selectMatch, 'Catalog lifecycle select must exist.')
const uiStates = [...selectMatch[0].matchAll(/<option>([^<]+)<\/option>/g)].map(match => match[1])

const allowlistMatch = api.match(/const allowedLifecycleStatuses = new Set\(\[([^\]]+)\]\)/)
assert.ok(allowlistMatch, 'Catalog API lifecycle allowlist must exist.')
const apiStates = [...allowlistMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1])

assert.ok(uiStates.length > 0, 'Catalog lifecycle UI must expose at least one valid state.')
for (const state of uiStates) {
  assert.ok(apiStates.includes(state), `UI lifecycle state ${state} is not accepted by the catalog API.`)
}

assert.ok(uiStates.includes('RETIRED'), 'Catalog lifecycle UI must expose the API-supported RETIRED state.')
assert.ok(!uiStates.includes('ARCHIVED'), 'Catalog lifecycle UI must not advertise unsupported ARCHIVED state.')
assert.match(api, /if \(!allowedLifecycleStatuses\.has\(lifecycleStatus\)\)/, 'API must reject lifecycle states outside its allowlist.')
assert.match(api, /Invalid lifecycleStatus\./, 'API must return a deterministic validation error for unsupported lifecycle state.')

console.log('catalog lifecycle contract: PASS', { uiStates, apiStates })
