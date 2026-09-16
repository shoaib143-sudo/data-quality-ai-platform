import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []
const warnings = []

const requiredServerEnv = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_DATASETS',
]

for (const name of requiredServerEnv) {
  if (!process.env[name]) failures.push(`Missing server-only environment variable: ${name}`)
  if (name.startsWith('NEXT_PUBLIC_')) failures.push(`Secret must never be public: ${name}`)
}

const forbiddenPublicSecrets = [
  'NEXT_PUBLIC_R2_ACCESS_KEY_ID',
  'NEXT_PUBLIC_R2_SECRET_ACCESS_KEY',
  'NEXT_PUBLIC_R2_ACCOUNT_ID',
]
for (const name of forbiddenPublicSecrets) {
  if (process.env[name]) failures.push(`Public R2 credential/config exposure detected: ${name}`)
}

const uploadRoute = path.join(root, 'app/api/datasets/source/upload-file/route.ts')
if (!fs.existsSync(uploadRoute)) {
  failures.push('Dataset upload route was not found.')
} else {
  const source = fs.readFileSync(uploadRoute, 'utf8')
  if (!source.includes("const DATASET_BUCKET = 'dataset-files'")) {
    warnings.push('Current Supabase dataset bucket declaration was not found where expected; re-audit upload flow.')
  }
  if (!source.includes("admin.storage.from(DATASET_BUCKET).createSignedUploadUrl")) {
    warnings.push('Current Supabase signed-upload call was not found where expected; re-audit upload flow.')
  }
  if (!source.includes("authorizeProject(user.id, projectId, 'source.manage')")) {
    failures.push('Upload authorization no longer appears project-scoped.')
  }
}

const contractPath = path.join(root, 'lib/storage/contracts.ts')
if (!fs.existsSync(contractPath)) failures.push('Provider-neutral storage contract is missing.')

console.log('R2 prerequisite verification')
console.log(`Failures: ${failures.length}`)
console.log(`Warnings: ${warnings.length}`)
for (const warning of warnings) console.log(`WARN: ${warning}`)
for (const failure of failures) console.error(`FAIL: ${failure}`)

if (failures.length) process.exit(1)
console.log('Prerequisite code/config checks passed.')
