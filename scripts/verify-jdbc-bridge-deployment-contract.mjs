import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const blueprintPaths = [
  'render.yaml',
  'services/jdbc-bridge/render.yaml',
  'services/jdbc-bridge/render-environment.yaml',
]

const failures = []
for (const relativePath of blueprintPaths) {
  const content = readFileSync(resolve(repositoryRoot, relativePath), 'utf8')
  if (!/^\s*plan:\s*starter\s*$/m.test(content)) {
    failures.push(`${relativePath}: JDBC bridge must use an always-on starter plan for production readiness.`)
  }
  if (!/^\s*healthCheckPath:\s*\/health\s*$/m.test(content)) {
    failures.push(`${relativePath}: JDBC bridge must expose /health as the Render health-check path.`)
  }
  if (!/^\s*rootDir:\s*services\/jdbc-bridge\s*$/m.test(content)) {
    failures.push(`${relativePath}: JDBC bridge rootDir must remain services/jdbc-bridge.`)
  }
}

if (failures.length > 0) {
  console.error('JDBC bridge deployment contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('JDBC bridge deployment contract passed: every Render blueprint is always-on and health-checked.')
