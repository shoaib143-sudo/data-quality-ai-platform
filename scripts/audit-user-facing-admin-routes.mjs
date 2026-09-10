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
  'requireScimDirectory(',
  'DATA_PLANE',
  'dataPlaneToken',
  'Bearer ',
  'timingSafeEqual',
]

const approvedPrivilegedExceptions = new Map([
  ['app/api/health/ready/route.ts', {
    classification: 'PUBLIC_HEALTH_PROBE',
    requiredMarkers: ['verify_database_api_security_posture', "headers: { 'Cache-Control': 'no-store' }"],
  }],
  ['app/api/scim/v2/Users/route.ts', {
    classification: 'SCIM_DIRECTORY_AUTH',
    requiredMarkers: ['requireScimDirectory('],
  }],
  ['app/api/scim/v2/Users/[userId]/route.ts', {
    classification: 'SCIM_DIRECTORY_AUTH',
    requiredMarkers: ['requireScimDirectory('],
  }],
])

const pinnedInteractiveBoundaries = new Map([
  ['app/api/admin/members/route.ts', ['requireApiUser(', 'authorizeOrganizationAdmin(']],
  ['app/api/agents/runs/[runId]/logs/route.ts', ['requireApiUser(', "'agent.execute'"]],
  ['app/api/agents/runs/[runId]/terminate/route.ts', ['requireApiUser(', "'agent.execute'"]],
  ['app/api/classification/policies/route.ts', ['requireApiUser(', "'classification.review'"]],
  ['app/api/datasets/[datasetId]/route.ts', ['requireApiUser(', "'catalog.update'", "'source.manage'"]],
  ['app/api/datasets/create-project/route.ts', ['requireApiUser(', 'authorizeOrganizationAdmin(']],
  ['app/api/datasets/register/route.ts', ['requireApiUser(', "'catalog.update'"]],
  ['app/api/datasets/source/[sourceId]/route.ts', ['requireApiUser(', "'source.manage'"]],
  ['app/api/datasets/source/credentials/route.ts', ['requireApiUser(', "'source.manage'"]],
  ['app/api/lineage/suggestions/route.ts', ['requireApiUser(', "'lineage.read'", "'lineage.manage'"]],
  ['app/api/profiling/compare/route.ts', ['requireApiUser(', "'profiling.read'"]],
  ['app/api/reports/governance/route.ts', ['requireApiUser(', "'report.export'"]],
  ['app/api/schedules/[scheduleId]/route.ts', ['requireApiUser(', "'schedule.manage'"]],
])

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
const invalidExceptions = []
const invalidPinnedBoundaries = []

for (const absolute of routes) {
  const source = await readFile(absolute, 'utf8')
  if (!source.includes('createAdminClient')) continue

  const relative = path.relative(process.cwd(), absolute).replaceAll(path.sep, '/')
  const interactiveMarkers = interactiveAuthMarkers.filter(marker => source.includes(marker))
  const machineMarkers = specializedMachineAuthMarkers.filter(marker => source.includes(marker))
  const hasRequireUser = source.includes('requireUser(')
  const hasProjectCapability = source.includes('authorizeProject(') || source.includes('authorizeDataset(') || source.includes('authorizeDatasetVersion(')
  const exception = approvedPrivilegedExceptions.get(relative)
  const pinnedMarkers = pinnedInteractiveBoundaries.get(relative)

  if (pinnedMarkers) {
    const missingMarkers = pinnedMarkers.filter(marker => !source.includes(marker))
    if (missingMarkers.length > 0) invalidPinnedBoundaries.push({ relative, missingMarkers })
  }

  let classification
  if (interactiveMarkers.length > 0) {
    classification = 'INTERACTIVE_AUTH'
  } else if (exception) {
    const missingMarkers = exception.requiredMarkers.filter(marker => !source.includes(marker))
    if (missingMarkers.length > 0) invalidExceptions.push({ relative, missingMarkers })
    classification = missingMarkers.length > 0 ? 'INVALID_APPROVED_EXCEPTION_REVIEW' : exception.classification
  } else if (machineMarkers.length > 0) {
    classification = 'SPECIALIZED_AUTH_REVIEW'
  } else if (hasRequireUser) {
    classification = 'LEGACY_INTERACTIVE_AUTH_REVIEW'
  } else {
    classification = 'UNCLASSIFIED_PRIVILEGED_REVIEW'
  }

  privileged.push({ relative, classification, interactiveMarkers, machineMarkers, hasRequireUser, hasProjectCapability })
}

console.log(`Privileged API routes using createAdminClient: ${privileged.length}`)
for (const route of privileged.sort((a, b) => a.relative.localeCompare(b.relative))) {
  console.log(JSON.stringify(route))
}

const review = privileged.filter(route => route.classification.endsWith('_REVIEW'))
console.log(`Routes requiring authorization review: ${review.length}`)
console.log(`Pinned interactive boundaries verified: ${pinnedInteractiveBoundaries.size - invalidPinnedBoundaries.length}/${pinnedInteractiveBoundaries.size}`)

if (invalidExceptions.length > 0) {
  for (const invalid of invalidExceptions) console.error(`Invalid privileged-route exception ${invalid.relative}; missing: ${invalid.missingMarkers.join(', ')}`)
}
if (invalidPinnedBoundaries.length > 0) {
  for (const invalid of invalidPinnedBoundaries) console.error(`Pinned privileged-route authorization regressed ${invalid.relative}; missing: ${invalid.missingMarkers.join(', ')}`)
}
if (review.length > 0) {
  for (const route of review) console.error(`Privileged route lacks an approved authorization boundary: ${route.relative}`)
}

if (invalidExceptions.length > 0 || invalidPinnedBoundaries.length > 0 || review.length > 0) process.exitCode = 1
