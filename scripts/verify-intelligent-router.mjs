import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const router = fs.readFileSync(path.join(root, 'lib', 'ai', 'intelligent-router.ts'), 'utf8')
const adapter = fs.readFileSync(path.join(root, 'lib', 'ai', 'governance-intelligent-router.ts'), 'utf8')
const failures = []

for (const token of [
  'EvaluationAwareIntelligentRouter',
  "routingEligibleOnly: true",
  'evaluationScorecard',
  "source: 'GOVERNED_REGISTRY'",
  "source: 'ENVIRONMENT_FALLBACK'",
  "reason: 'REGISTRY_UNAVAILABLE'",
  "reason: 'GOVERNED_CANDIDATES_NOT_EXECUTABLE'",
  'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
  'NO_ACTIVE_GOVERNED_CANDIDATES',
]) {
  if (!router.includes(token)) failures.push(`missing router contract token: ${token}`)
}

if (!adapter.includes('createGovernanceModelRegistry()')) failures.push('governed registry not composed into router')
if (!adapter.includes('new EnvironmentModelGateway()')) failures.push('environment fallback gateway not composed')

for (const forbidden of [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
  /lifecycleStatus\s*=\s*['"]ACTIVE['"]/,
]) {
  if (forbidden.test(router) || forbidden.test(adapter)) failures.push(`forbidden authority mutation pattern: ${forbidden}`)
}

if (failures.length) {
  console.error('ADR-006 Intelligent Router contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}

console.log('ADR-006 Intelligent Router contract passed.')
