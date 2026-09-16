import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const outputPath = process.argv[2] || 'release-evidence/dependency-inventory.json'
const sourceCommit = String(process.env.GITHUB_SHA || process.env.DATANEXUS_SOURCE_COMMIT || '').trim()
if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
  throw new Error('A full 40-character source commit is required through GITHUB_SHA or DATANEXUS_SOURCE_COMMIT.')
}

const lockfilePath = path.resolve('pnpm-lock.yaml')
if (!fs.existsSync(lockfilePath)) throw new Error('pnpm-lock.yaml is required for release dependency inventory.')
const lockfileSha256 = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(lockfilePath)).digest('hex')}`

const listed = spawnSync('pnpm', ['list', '--prod', '--json', '--depth', 'Infinity'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
})
if (listed.status !== 0) {
  throw new Error(`Unable to enumerate production dependencies: ${listed.stderr || listed.stdout || `exit ${listed.status}`}`)
}

let roots
try {
  roots = JSON.parse(listed.stdout)
} catch (error) {
  throw new Error(`pnpm dependency inventory was not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
}
if (!Array.isArray(roots) || roots.length === 0) throw new Error('pnpm dependency inventory returned no workspace roots.')

const components = new Map()
const visitDependencies = (dependencies, ancestry = []) => {
  if (!dependencies || typeof dependencies !== 'object') return
  for (const [name, node] of Object.entries(dependencies)) {
    if (!node || typeof node !== 'object') continue
    const version = String(node.version || '').trim()
    if (!name || !version) throw new Error(`Dependency ${name || '<unknown>'} is missing an exact installed version.`)
    const key = `${name}@${version}`
    if (!components.has(key)) {
      components.set(key, {
        name,
        version,
        packageKey: key,
        path: typeof node.path === 'string' ? node.path : null,
        ancestry: ancestry.slice(0, 12),
      })
    }
    visitDependencies(node.dependencies, [...ancestry, key])
  }
}
for (const root of roots) visitDependencies(root.dependencies)

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const directProductionDependencies = Object.entries(packageJson.dependencies || {})
  .map(([name, declaredRange]) => ({ name, declaredRange: String(declaredRange) }))
  .sort((a, b) => a.name.localeCompare(b.name))

const dependencyComponents = [...components.values()].sort((a, b) => a.packageKey.localeCompare(b.packageKey))
if (dependencyComponents.length === 0 && directProductionDependencies.length > 0) {
  throw new Error('Production dependencies are declared but the installed production dependency inventory is empty.')
}
for (const direct of directProductionDependencies) {
  if (!dependencyComponents.some(component => component.name === direct.name)) {
    throw new Error(`Declared production dependency ${direct.name} is missing from the installed dependency inventory.`)
  }
}

const inventoryMaterial = {
  schemaVersion: 1,
  kind: 'DATANEXUS_RELEASE_DEPENDENCY_INVENTORY',
  sourceCommit: sourceCommit.toLowerCase(),
  lockfileSha256,
  packageManager: `pnpm@${String(process.env.npm_config_user_agent || '').match(/pnpm\/([^\s]+)/)?.[1] || 'unknown'}`,
  directProductionDependencies,
  dependencyComponents,
}
const inventorySha256 = `sha256:${crypto.createHash('sha256').update(JSON.stringify(inventoryMaterial)).digest('hex')}`
const inventory = {
  ...inventoryMaterial,
  inventorySha256,
  generatedAt: new Date().toISOString(),
  generator: 'scripts/generate-release-dependency-inventory.mjs',
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`)
console.log(`Release dependency inventory generated: ${dependencyComponents.length} production components, ${directProductionDependencies.length} direct dependencies, ${inventorySha256}.`)
