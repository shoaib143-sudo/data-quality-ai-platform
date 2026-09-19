import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflowPath = new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url)
const workflow = await readFile(workflowPath, 'utf8')
const certification = workflow.slice(workflow.indexOf('  live-production-certification:'))

test('R2 production preparation is manual-only and production gated', () => {
  assert.match(certification, /if: github\.event_name == 'workflow_dispatch'/)
  assert.match(certification, /environment: production/)
  assert.doesNotMatch(certification, /pull_request_target|schedule:/)
})

test('R2 preparation uses fixed internal routes and never applies cutover or deletes sources', () => {
  assert.match(certification, /\/api\/internal\/storage\/configure-r2-cors/)
  assert.match(certification, /\/api\/internal\/storage\/migrate-to-r2/)
  assert.match(certification, /\/api\/internal\/storage\/certify-r2/)
  assert.doesNotMatch(certification, /STORAGE_DEFAULT_PROVIDER|STORAGE_R2_PRODUCTION_CUTOVER_APPROVED|STORAGE_R2_REFERENCE_CUTOVER_APPROVED/)
  assert.doesNotMatch(certification, /"mode":"apply"/)
  assert.match(certification, /sourceObjectsDeleted !== 0/)
  assert.match(certification, /datasetVersionReferencesChanged !== 0/)
})

test('R2 preparation remains bounded and secret-safe', () => {
  assert.match(certification, /--connect-timeout 10 --max-time 300/)
  assert.match(certification, /Authorization: Bearer \$OIDC_TOKEN/)
  assert.doesNotMatch(certification, /GITHUB_ENV|GITHUB_OUTPUT|upload-artifact|actions\/cache|set -x|printenv/)
})


test('R2 production preparation proves reference cutover eligibility without changing references', () => {
  assert.match(certification, /\/api\/internal\/storage\/reference-cutover/)
  assert.match(certification, /--data '\{"mode":"dry-run"\}'/)
  assert.match(certification, /eligibleReferences \?\? 0\) < 1/)
  assert.match(certification, /changedReferences !== 0/)
  assert.match(certification, /destructiveActions !== 0/)
  assert.match(certification, /SKIPPED_INTEGRITY_MISMATCH/)
  assert.doesNotMatch(certification, /"mode":"apply"/)
})


test('R2 production preparation uses a protected provider-neutral certification target', () => {
  assert.match(certification, /DATANEXUS_CERTIFICATION_TARGET_URL: \$\{\{ vars\.DATANEXUS_CERTIFICATION_TARGET_URL \}\}/)
  assert.match(certification, /test -n "\$\{DATANEXUS_CERTIFICATION_TARGET_URL:-\}"/)
  assert.match(certification, /Production certification target is not the governed production endpoint/)
  assert.match(certification, /\$DATANEXUS_CERTIFICATION_TARGET_URL\/api\/internal\/storage\//)
  assert.doesNotMatch(certification, /APP_URL:/)
})

test('R2 production preparation uses GitHub OIDC instead of copied production secrets', () => {
  assert.match(certification, /id-token: write/)
  assert.match(certification, /OIDC_AUDIENCE: datanexus-r2-production/)
  assert.match(certification, /ACTIONS_ID_TOKEN_REQUEST_URL/)
  assert.match(certification, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/)
  assert.match(certification, /Authorization: Bearer \$OIDC_TOKEN/)
  assert.doesNotMatch(certification, /secrets\.CRON_SECRET|secrets\.R2_CERTIFICATION_APP_URL/)
})
