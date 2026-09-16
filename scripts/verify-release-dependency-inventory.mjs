import crypto from 'node:crypto'
import fs from 'node:fs'

const inventoryPath = process.env.DATANEXUS_DEPENDENCY_INVENTORY_PATH || process.argv[2] || 'release-evidence/dependency-inventory.json'
if (!fs.existsSync(inventoryPath)) throw new Error(`Release dependency inventory not found: ${inventoryPath}`)
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
const fail = message => { throw new Error(message) }

if (inventory.schemaVersion !== 1) fail('Dependency inventory schemaVersion must be 1.')
if (inventory.kind !== 'DATANEXUS_RELEASE_DEPENDENCY_INVENTORY') fail('Dependency inventory kind is invalid.')
if (!/^[0-9a-f]{40}$/i.test(String(inventory.sourceCommit || ''))) fail('Dependency inventory requires a full sourceCommit.')

const expectedCommit = String(process.env.GITHUB_SHA || process.env.DATANEXUS_SOURCE_COMMIT || '').trim().toLowerCase()
if (expectedCommit && inventory.sourceCommit.toLowerCase() !== expectedCommit) {
  fail(`Dependency inventory source commit ${inventory.sourceCommit} does not match expected exact head ${expectedCommit}.`)
}

if (!fs.existsSync('pnpm-lock.yaml')) fail('pnpm-lock.yaml is required to verify the dependency inventory.')
const actualLockfileSha = `sha256:${crypto.createHash('sha256').update(fs.readFileSync('pnpm-lock.yaml')).digest('hex')}`
if (inventory.lockfileSha256 !== actualLockfileSha) fail('Dependency inventory lockfile digest does not match the current repository lockfile.')

if (!Array.isArray(inventory.directProductionDependencies)) fail('Dependency inventory must include directProductionDependencies.')
if (!Array.isArray(inventory.dependencyComponents)) fail('Dependency inventory must include dependencyComponents.')
const componentKeys = inventory.dependencyComponents.map(component => component?.packageKey)
if (componentKeys.some(key => typeof key !== 'string' || !key.includes('@'))) fail('Dependency inventory contains a component without packageKey.')
if (new Set(componentKeys).size !== componentKeys.length) fail('Dependency inventory contains duplicate packageKey entries.')
for (const direct of inventory.directProductionDependencies) {
  if (!direct || typeof direct.name !== 'string' || !direct.name) fail('Direct production dependency name is invalid.')
  if (!inventory.dependencyComponents.some(component => component?.name === direct.name)) {
    fail(`Direct production dependency ${direct.name} is absent from dependencyComponents.`)
  }
}

const material = {
  schemaVersion: inventory.schemaVersion,
  kind: inventory.kind,
  sourceCommit: inventory.sourceCommit,
  lockfileSha256: inventory.lockfileSha256,
  packageManager: inventory.packageManager,
  directProductionDependencies: inventory.directProductionDependencies,
  dependencyComponents: inventory.dependencyComponents,
}
const actualInventorySha = `sha256:${crypto.createHash('sha256').update(JSON.stringify(material)).digest('hex')}`
if (inventory.inventorySha256 !== actualInventorySha) fail('Dependency inventory integrity digest is invalid.')
if (!Number.isFinite(Date.parse(String(inventory.generatedAt || '')))) fail('Dependency inventory generatedAt is invalid.')
if (inventory.generator !== 'scripts/generate-release-dependency-inventory.mjs') fail('Dependency inventory generator identity is invalid.')

console.log(`Release dependency inventory verified for ${inventory.sourceCommit}: ${inventory.dependencyComponents.length} production components.`)
