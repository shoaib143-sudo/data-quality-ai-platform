import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const exists = (path) => fs.existsSync(path)

const v6 = read('.github/workflows/v6-operational-certification.yml')
const codeql = read('.github/workflows/codeql-security.yml')
const dependency = read('.github/workflows/dependency-review.yml')
const packageJson = JSON.parse(read('package.json'))
const requiredJourneys = [
  'scripts/verify-v0-trusted-governance-baseline.mjs',
  'scripts/verify-journey-sensitive-governance.mjs',
  'scripts/verify-journey-dq-incident.mjs',
  'scripts/verify-journey-change-governance.mjs',
  'scripts/verify-journey-governed-investigation.mjs',
  'scripts/verify-journey-governed-outcome-learning.mjs',
]

const checks = [
  ['V0 through V5 journey authorities exist', requiredJourneys.every(exists)],
  ['V6 reruns cumulative journeys', requiredJourneys.every((path) => v6.includes(path))],
  ['V6 verifies migration version uniqueness', v6.includes('verify-migration-version-uniqueness.mjs')],
  ['V6 performs clean Supabase reconstruction', v6.includes('supabase@2.117.0') && v6.includes('db reset --local') && v6.includes('supabase/migrations')],
  ['V6 requires live database credentials', v6.includes('Require live governance database credentials') && v6.includes('SUPABASE_SERVICE_ROLE_KEY') && !v6.includes("if: ${{ env.NEXT_PUBLIC_SUPABASE_URL"))],
  ['V6 executes authenticated live database contracts', v6.includes('pnpm run verify:database')],
  ['V6 exercises provider failure/fallback behavior', v6.includes('pnpm run verify:provider-fallback')],
  ['V6 exercises worker isolation and capacity', v6.includes('pnpm run verify:worker-runtime')],
  ['V6 exercises privileged API authorization audit', v6.includes('audit-user-facing-admin-routes.mjs')],
  ['V6 exercises governed AI execution controls', v6.includes('pnpm run verify:execution-controller') && v6.includes('pnpm run verify:model-gateway')],
  ['V6 exercises retrieval grounding/evaluation', v6.includes('pnpm run verify:retrieval-provider') && v6.includes('pnpm run verify:evaluation-engine')],
  ['CodeQL is pinned to an immutable commit', codeql.includes('github/codeql-action/init@b96794f015dfd88f77b49b1c93e0fa7110f94c63') && codeql.includes('github/codeql-action/analyze@b96794f015dfd88f77b49b1c93e0fa7110f94c63')],
  ['dependency audit is lockfile-exact and blocks high severity vulnerabilities', dependency.includes('pnpm install --frozen-lockfile') && dependency.includes('pnpm audit --prod --audit-level high')],
  ['OpenSearch remains optional rather than a release dependency', Boolean(packageJson.scripts?.['bootstrap:opensearch']) && !Object.keys(packageJson.dependencies ?? {}).some((name) => name.toLowerCase().includes('opensearch'))],
  ['ClickHouse is not introduced without measured need', !Object.keys(packageJson.dependencies ?? {}).some((name) => name.toLowerCase().includes('clickhouse'))],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`V6 operational certification verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`V6 operational certification contract passed (${checks.length} checks).`)
