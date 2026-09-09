import fs from 'node:fs'
import path from 'node:path'

import { dynamicPageExclusions, resourceRouteContracts } from '../lib/platform/resource-route-contracts.mjs'

const routes = fs.readFileSync('lib/platform/canonical-routes.ts', 'utf8')
const checks = []

function check(name, passed) {
  checks.push([name, Boolean(passed)])
}

function dynamicPages(root = 'app') {
  const pages = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) {
      pages.push(...dynamicPages(absolute))
      continue
    }
    const normalized = absolute.split(path.sep).join('/')
    if (entry.isFile() && entry.name === 'page.tsx' && /\[[^/]+\]/.test(normalized)) pages.push(normalized)
  }
  return pages.sort()
}

function paramsFromRouteFile(routeFile) {
  return [...routeFile.matchAll(/\[([^/\]]+)\]/g)].map((match) => match[1].replace(/^\.\.\./, ''))
}

check('canonical route builder exists', routes.includes('export function canonicalResourcePath'))
check('canonical route segments are encoded', routes.includes('encodeURIComponent(normalized)'))
check('blank identities fail closed', routes.includes("throw new Error('Canonical route segments must be non-empty.')"))
check('malformed base paths fail closed', routes.includes("throw new Error('Canonical route base paths must start with /.')"))

const contractFiles = new Set()
for (const contract of resourceRouteContracts) {
  const label = `resource contract ${contract.id}`
  check(`${label} has unique route file`, !contractFiles.has(contract.routeFile))
  contractFiles.add(contract.routeFile)
  check(`${label} detail page exists`, fs.existsSync(contract.routeFile))
  check(`${label} route builder exists`, new RegExp(`\\b${contract.routeBuilder}\\s*\\(`).test(routes))
  check(`${label} has a canonical source consumer`, (contract.sourceConsumers ?? []).length > 0)

  const discoveredParams = paramsFromRouteFile(contract.routeFile)
  check(
    `${label} identity matches dynamic path`,
    JSON.stringify(discoveredParams) === JSON.stringify(contract.identityParams),
  )

  if (!fs.existsSync(contract.routeFile)) continue
  const detail = fs.readFileSync(contract.routeFile, 'utf8')
  check(
    `${label} authenticates before resource projection`,
    (contract.authenticationEvidence ?? []).length > 0 && contract.authenticationEvidence.every((evidence) => detail.includes(evidence)),
  )
  for (const evidence of contract.resolverEvidence ?? []) {
    check(`${label} resolves exact identity/scope: ${evidence}`, detail.includes(evidence))
  }
  check(
    `${label} fails closed when identity or scope is unavailable`,
    (contract.missingEvidence ?? []).length > 0 && contract.missingEvidence.every((evidence) => detail.includes(evidence)),
  )
  if (contract.readOnly) {
    check(`${label} remains read-only`, !/\.(insert|update|delete|upsert)\s*\(/.test(detail))
  }

  for (const consumer of contract.sourceConsumers ?? []) {
    check(`${label} consumer exists: ${consumer.file}`, fs.existsSync(consumer.file))
    if (!fs.existsSync(consumer.file)) continue
    const source = fs.readFileSync(consumer.file, 'utf8')
    for (const evidence of consumer.evidence ?? []) {
      check(`${label} consumer uses canonical route: ${consumer.file}`, source.includes(evidence))
    }
  }
}

const exclusionFiles = new Set()
for (const exclusion of dynamicPageExclusions) {
  check(`dynamic exclusion has reason: ${exclusion.routeFile}`, typeof exclusion.reason === 'string' && exclusion.reason.trim().length >= 20)
  check(`dynamic exclusion is unique: ${exclusion.routeFile}`, !exclusionFiles.has(exclusion.routeFile))
  exclusionFiles.add(exclusion.routeFile)
  check(`dynamic exclusion exists: ${exclusion.routeFile}`, fs.existsSync(exclusion.routeFile))
  check(`dynamic exclusion does not shadow resource contract: ${exclusion.routeFile}`, !contractFiles.has(exclusion.routeFile))
}

const registered = new Set([...contractFiles, ...exclusionFiles])
for (const routeFile of dynamicPages()) {
  check(`dynamic page is registered or explicitly excluded: ${routeFile}`, registered.has(routeFile))
}
for (const routeFile of registered) {
  check(`registered dynamic page is still dynamic: ${routeFile}`, /\[[^/]+\]/.test(routeFile))
}

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)

if (failures.length) {
  console.error(`Navigation integrity verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log(`PASS platform navigation integrity contract (${resourceRouteContracts.length} resources, ${dynamicPageExclusions.length} explicit exclusions)`)
