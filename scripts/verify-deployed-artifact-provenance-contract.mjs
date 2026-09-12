import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const contract = JSON.parse(await readFile('infra/release-provenance/deployed-artifact-contract.json', 'utf8'))
const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const workflow = await readFile('.github/workflows/release-provenance.yml', 'utf8')

assert.equal(contract.schemaVersion, 1)
assert.equal(contract.evidenceKind, 'VERCEL_DEPLOYED_ARTIFACT')
assert.equal(contract.provider, 'vercel')
assert.equal(contract.artifactClass, 'PRODUCTION_DEPLOYMENT')
assert.equal(contract.manifestPath, '/.well-known/deployed-artifact-provenance.json')
assert.equal(contract.digestAlgorithm, 'sha256')

const requiredBindings = new Set(contract.requiredProductionBindings)
for (const binding of [
  'VERCEL_DEPLOYMENT_ID',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_ENV=production',
  'VERCEL_PROJECT_PRODUCTION_URL',
]) assert.ok(requiredBindings.has(binding), `missing production binding ${binding}`)

const scopes = new Set(contract.digestScopes)
for (const scope of ['.next/server', '.next/static', '.next/BUILD_ID', 'package.json', 'pnpm-lock.yaml', 'public']) {
  assert.ok(scopes.has(scope), `missing digest scope ${scope}`)
}
assert.ok(contract.excludedPaths.includes('public/.well-known/deployed-artifact-provenance.json'))
assert.equal(contract.rules.productionBuildMustFailClosedOnMissingIdentity, true)
assert.equal(contract.rules.previewEvidenceMaySatisfyProduction, false)
assert.equal(contract.rules.artifactDigestMustBeSha256, true)
assert.equal(contract.rules.digestOrderingMustBeDeterministic, true)
assert.equal(contract.rules.symbolicLinksAllowedInDigestScope, false)
assert.equal(contract.rules.secretEnvironmentValuesMayBeSerialized, false)
assert.equal(contract.rules.manifestMustBindDeploymentId, true)
assert.equal(contract.rules.manifestMustBindSourceCommitSha, true)

assert.match(packageJson.scripts.build, /^next build\s*&&\s*node scripts\/generate-deployed-artifact-provenance\.mjs$/)
for (const expected of [
  'Verify deployed artifact provenance contract',
  'Deployed artifact unit and negative/failure tests',
  'Independent automated adversarial deployed-artifact audit',
]) assert.ok(workflow.includes(expected), `release provenance workflow is missing step: ${expected}`)

console.log(JSON.stringify({ status: 'PASS', contract: 'deployed-artifact-provenance', schemaVersion: contract.schemaVersion }))
