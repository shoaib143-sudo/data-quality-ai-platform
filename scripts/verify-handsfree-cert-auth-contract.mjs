import fs from 'node:fs'

const failures = []
const authPath = 'lib/auth/require-api-user.ts'
const auth = fs.readFileSync(authPath, 'utf8')

// Production authentication must remain session-backed. Certification automation must never
// gain authority through headers, query parameters, request bodies, or a production env bypass.
for (const forbidden of [
  'x-test-user',
  'x-e2e-user',
  'x-certification-user',
  'E2E_BYPASS_AUTH',
  'CERTIFICATION_BYPASS_AUTH',
  'DISABLE_AUTH',
]) {
  if (auth.includes(forbidden)) failures.push(`${authPath} contains forbidden certification auth bypass: ${forbidden}`)
}

for (const required of [
  'createClient()',
  'supabase.auth.getUser()',
  "throw new AuthorizationError('Authentication required.', 401)",
]) {
  if (!auth.includes(required)) failures.push(`${authPath} is missing production session-auth invariant: ${required}`)
}

if (!auth.includes("import { AuthorizationError } from '@/lib/auth/authorize'")) {
  failures.push(`${authPath} must use the shared fail-closed AuthorizationError for unauthenticated API requests.`)
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
if (!deps['@supabase/ssr']) failures.push('Supabase SSR auth dependency is required for cookie-backed certification sessions.')

if (failures.length) {
  console.error('Hands-free certification authentication contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Hands-free certification auth contract verified: production remains cookie/session-backed and bypass-free. Synthetic certification identities must obtain normal authenticated sessions rather than bypassing requireApiUser().')
