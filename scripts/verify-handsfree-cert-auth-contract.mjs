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
  "throw new ApiAuthError('Unauthorized', 401)",
]) {
  if (!auth.includes(required)) failures.push(`${authPath} is missing production session-auth invariant: ${required}`)
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
if (!deps['@supabase/ssr']) failures.push('Supabase SSR auth dependency is required for cookie-backed certification sessions.')

const testing = fs.existsSync('Testing/AUTOMATION_ARCHITECTURE.md')
  ? fs.readFileSync('Testing/AUTOMATION_ARCHITECTURE.md', 'utf8')
  : ''
for (const required of ['synthetic', 'auth']) {
  if (!testing.toLowerCase().includes(required)) failures.push(`Testing/AUTOMATION_ARCHITECTURE.md must document ${required} for unattended certification.`)
}

if (failures.length) {
  console.error('Hands-free certification authentication contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Hands-free certification auth contract verified: production remains cookie/session-backed and bypass-free; unattended certification requires synthetic auth provisioning.')
