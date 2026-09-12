import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const uiPath = new URL('../app/catalog/catalog-manager.tsx', import.meta.url)
const apiPath = new URL('../app/api/catalog/[datasetId]/route.ts', import.meta.url)
const [ui, api] = await Promise.all([
  readFile(uiPath, 'utf8'),
  readFile(apiPath, 'utf8'),
])

const selectMatch = ui.match(/<select name="lifecycleStatus"[\s\S]*?<\/select>/)
assert.ok(selectMatch, 'Lifecycle selector missing.')
const uiStates = new Set([...selectMatch[0].matchAll(/<option>([^<]+)<\/option>/g)].map(match => match[1]))

const allowlistMatch = api.match(/const allowedLifecycleStatuses = new Set\(\[([^\]]+)\]\)/)
assert.ok(allowlistMatch, 'Lifecycle allowlist missing.')
const apiStates = new Set([...allowlistMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]))

for (const candidate of ['ARCHIVED', 'UNKNOWN', 'PROPOSED', 'PENDING', 'FUTURE_STATE']) {
  if (!apiStates.has(candidate)) {
    assert.ok(!uiStates.has(candidate), `Unsupported/future lifecycle state ${candidate} became executable from the UI.`)
  }
}

const authorizationIndex = api.indexOf("authorizeDataset(user.id, datasetId, 'catalog.update')")
const validationIndex = api.indexOf('allowedLifecycleStatuses.has(lifecycleStatus)')
const adminClientIndex = api.indexOf('createAdminClient()')
const mutationIndex = api.indexOf(".from('dataset_catalog')")

assert.ok(authorizationIndex >= 0, 'Dataset authorization boundary is missing.')
assert.ok(validationIndex > authorizationIndex, 'Lifecycle validation must occur after authenticated dataset authorization context is established.')
assert.ok(adminClientIndex > validationIndex, 'Privileged admin client must not be created before lifecycle validation.')
assert.ok(mutationIndex > adminClientIndex, 'Governance mutation must remain behind authorization and validation.')
assert.match(api, /Certification state is managed through the certification workflow\./, 'Catalog API must not allow certification state to be mutated through general metadata editing.')

console.log('catalog lifecycle adversarial audit: PASS', {
  uiStates: [...uiStates],
  apiStates: [...apiStates],
  unknownStatesFailClosed: true,
  authorizationPrecedesMutation: true,
})
