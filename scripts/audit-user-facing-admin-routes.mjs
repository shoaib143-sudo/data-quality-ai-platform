import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const apiRoot = path.resolve('app/api')

const interactiveAuthMarkers = [
  'requireApiUser(',
  'authorizeProject(',
  'authorizeDataset(',
  'authorizeDatasetVersion(',
  'authorizeOrganizationAdmin(',
]

const specializedMachineAuthMarkers = [
  'verifyAgentCallbackSecret',
  'verifyWebhook',
  'webhookSecret',
  'CRON_SECRET',
  'SCIM_TOKEN',
  'scimToken',
  'DATA_PLANE',
  'dataPlaneToken',
  'Bearer ',
  'timingSafeEqual',
]

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(absolute))
    else if (entry.isFile() && entry.name === 'route.ts') files.push(absolute)
  }
  return files
}

const routes = await walk(apiRoot)
const privileged = []

for (const absolute of routes) {
  const source = await readFile(absolute, 'utf8')
  if (!source.includes('createAdminClient')) continue

  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, '/')
  const interactiveMarkers = interactiveAuthMarkers.filter(marker => source.includes(marker))
  const machineMarkers = specializedMachineAuthMarkers.filter(marker => source.includes(marker))
  const hasRequireUser = source.includes('requireUser(')
  const hasProjectCapability = source.includes('authorizeProject(') || source.includes('authorizeDataset(') || source.includes('authorizeDatasetVersion(')
  const classification = interactiveMarkers.length > 0
    ? 'INTERACTIVE_AUTH'
    : machineMarkers.length > 0
      ? 'SPECIALIZED_AUTH_REVIEW'
      : hasRequireUser
        ? 'LEGACY_INTERACTIVE_AUTH_REVIEW'
        : 'UNCLASSIFIED_PRIVILEGED_REVIEW'

  privileged.push({ relative, classification, interactiveMarkers, machineMarkers, hasRequireUser, hasProjectCapability })
}

console.log(`Privileged API routes using createAdminClient: ${privileged.length}`)
for (const route of privileged.sort((a, b) => a.relative.localeCompare(b.relative))) {
  console.log(JSON.stringify(route))
}

const review = privileged.filter(route => route.classification.endsWith('_REVIEW'))
console.log(`Routes requiring authorization review: ${review.length}`)

// Inventory mode is intentionally non-blocking until every privileged route has been
// classified and the legitimate machine-to-machine exceptions are captured explicitly.
process.exitCode = 0
