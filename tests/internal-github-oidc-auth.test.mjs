import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const helper = fs.readFileSync(new URL('../lib/security/internal-bearer.ts', import.meta.url), 'utf8')
const routes = [
  '../app/api/internal/storage/configure-r2-cors/route.ts',
  '../app/api/internal/storage/migrate-to-r2/route.ts',
  '../app/api/internal/storage/certify-r2/route.ts',
  '../app/api/internal/storage/reference-cutover/route.ts',
].map((path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8'))

test('GitHub OIDC automation is bound to issuer, audience, repository, environment, main ref, and exact workflow', () => {
  assert.match(helper, /https:\/\/token\.actions\.githubusercontent\.com/)
  assert.match(helper, /datanexus-r2-production/)
  assert.match(helper, /shoaib143-sudo\/data-quality-ai-platform/)
  assert.match(helper, /GITHUB_OIDC_ENVIRONMENT = 'production'/)
  assert.match(helper, /GITHUB_OIDC_REF = 'refs\/heads\/main'/)
  assert.match(helper, /storage-r2-assurance\.yml@refs\/heads\/main/)
  assert.match(helper, /claims\.event_name !== 'workflow_dispatch'/)
})

test('GitHub OIDC automation verifies RS256 signature and bounded token lifetime', () => {
  assert.match(helper, /header\.alg !== 'RS256'/)
  assert.match(helper, /crypto\.subtle\.importKey/)
  assert.match(helper, /crypto\.subtle\.verify/)
  assert.match(helper, /claims\.exp > now \+ 10 \* 60/)
  assert.match(helper, /claims\.nbf/)
  assert.match(helper, /claims\.iat/)
})

test('existing CRON_SECRET bearer remains a fallback while R2 automation accepts OIDC', () => {
  assert.match(helper, /if \(requireInternalBearer\(request\)\) return true/)
  assert.match(helper, /verifyGitHubActionsOidcBearer\(request\)/)
  for (const route of routes) {
    assert.match(route, /await requireInternalAutomation\(request\)/)
  }
})

test('OIDC helper fails closed when JWKS retrieval or signature import fails', () => {
  assert.match(helper, /if \(!response\.ok\) return \[\]/)
  assert.match(helper, /if \(!jwk\) return false/)
  assert.match(helper, /catch \{\s*return false\s*\}/)
})
