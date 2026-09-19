import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync(new URL('../lib/governance/resource-access-admin-service.ts', import.meta.url), 'utf8')
const route = fs.readFileSync(new URL('../app/api/resource-access/preview/route.ts', import.meta.url), 'utf8')
const ui = fs.readFileSync(new URL('../app/resource-access/resource-access-manager.tsx', import.meta.url), 'utf8')

test('resource ACL preview reuses the same server-side scope validation as mutation', () => {
  assert.match(service, /validateResourceAccessTarget/)
  assert.match(service, /hasProjectCapability\(input\.actorUserId, input\.projectId, 'admin\.manage'\)/)
  assert.match(service, /canViewDatasetResource\(input\.targetUserId, input\.datasetId\)/)
  assert.match(route, /requireApiUser\(\)/)
  assert.match(route, /'Cache-Control': 'private, no-store'/)
})

test('DENY preview is explicit and replacement is fail closed', () => {
  assert.match(service, /input\.effect === 'DENY' \? 'DENIED' : 'ALLOWED'/)
  assert.match(service, /DENY takes precedence/)
  assert.match(service, /replacementRequired: Boolean\(existingGrant\)/)
  assert.match(ui, /preview\?\.replacementRequired === true/)
})

test('preview never replaces mutation-time authorization', () => {
  assert.match(ui, /Preview is advisory/)
  assert.match(ui, /revalidated when the rule is committed/)
  assert.match(service, /createResourceAccessGrant/)
})
