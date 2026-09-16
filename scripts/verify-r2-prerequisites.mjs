import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []

const requiredServerEnv = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PREFIX',
]

for (const name of requiredServerEnv) {
  const value = process.env[name]?.trim()
  if (!value) failures.push(`Missing server-only environment variable: ${name}`)
}

const forbiddenPublicSecrets = [
  'NEXT_PUBLIC_R2_ACCESS_KEY_ID',
  'NEXT_PUBLIC_R2_SECRET_ACCESS_KEY',
  'NEXT_PUBLIC_R2_ACCOUNT_ID',
  'NEXT_PUBLIC_R2_ENDPOINT',
]
for (const name of forbiddenPublicSecrets) {
  if (process.env[name]) failures.push(`Public R2 credential/config exposure detected: ${name}`)
}

const accountId = process.env.R2_ACCOUNT_ID?.trim()
const endpoint = process.env.R2_ENDPOINT?.trim()
if (accountId && endpoint) {
  try {
    const parsed = new URL(endpoint)
    const expectedHost = `${accountId}.r2.cloudflarestorage.com`
    if (parsed.protocol !== 'https:' || parsed.hostname !== expectedHost) {
      failures.push(`R2_ENDPOINT must be the exact account-scoped HTTPS endpoint: https://${expectedHost}`)
    }
  } catch {
    failures.push('R2_ENDPOINT is not a valid URL.')
  }
}

const bucket = process.env.R2_BUCKET?.trim()
if (bucket && bucket !== 'datanexus-r2') {
  warnings.push(`R2_BUCKET is '${bucket}', while the approved single-bucket architecture uses 'datanexus-r2'.`)
}

const prefix = process.env.R2_PREFIX?.trim()
if (prefix) {
  if (prefix.startsWith('/') || prefix.endsWith('/')) failures.push('R2_PREFIX must not start or end with a slash.')
  if (prefix.split('/').some(part => !part || part === '.' || part === '..')) failures.push('R2_PREFIX contains an invalid path segment.')
}

const uploadRoute = path.join(root, 'app/api/datasets/source/upload-file/route.ts')
if (!fs.existsSync(uploadRoute)) {
  failures.push('Dataset upload route was not found.')
} else {
  const source = fs.readFileSync(uploadRoute, 'utf8')
  if (source.includes('admin.storage.from(')) failures.push('Dataset upload route is directly coupled to Supabase Storage.')
  if (!source.includes('createObjectStorage')) failures.push('Dataset upload route is not using ObjectStorage abstraction.')
  if (!source.includes('defaultStorageProvider')) failures.push('Dataset upload route is not using the governed provider selector.')
  if (!source.includes("from('storage_objects')")) failures.push('Dataset upload route is not persisting provider-neutral registry metadata.')
  if (!source.includes("authorizeProject(user.id, projectId, 'source.manage')")) failures.push('Upload authorization no longer appears project-scoped.')
  if (!source.includes("state: 'PENDING'")) failures.push('Upload lifecycle no longer starts in PENDING state.')
}

const requiredFiles = [
  'lib/storage/contracts.ts',
  'lib/storage/factory.ts',
  'lib/storage/r2.ts',
  'lib/storage/supabase.ts',
  'app/api/datasets/source/upload-file/complete/route.ts',
]
for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Required storage implementation is missing: ${relative}`)
}

const factoryPath = path.join(root, 'lib/storage/factory.ts')
if (fs.existsSync(factoryPath)) {
  const source = fs.readFileSync(factoryPath, 'utf8')
  if (!source.includes("STORAGE_DEFAULT_PROVIDER ?? 'supabase'")) failures.push('Storage provider no longer defaults to Supabase before cutover.')
  if (!source.includes('STORAGE_R2_PRODUCTION_CUTOVER_APPROVED')) failures.push('Production R2 cutover approval guard is missing.')
}

const r2Path = path.join(root, 'lib/storage/r2.ts')
if (fs.existsSync(r2Path)) {
  const source = fs.readFileSync(r2Path, 'utf8')
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_PREFIX']) {
    if (!source.includes(name)) failures.push(`R2 adapter does not reference required configuration: ${name}`)
  }
  if (source.includes('NEXT_PUBLIC_R2_')) failures.push('R2 adapter references public R2 configuration.')
}

console.log('R2 prerequisite verification')
console.log(`Failures: ${failures.length}`)
console.log(`Warnings: ${warnings.length}`)
for (const warning of warnings) console.log(`WARN: ${warning}`)
for (const failure of failures) console.error(`FAIL: ${failure}`)

if (failures.length) process.exit(1)
console.log('Prerequisite code/config checks passed.')
