import assert from 'node:assert/strict'
import fs from 'node:fs'

const form = fs.readFileSync('app/datasets/jdbc-source-form.tsx', 'utf8')
const page = fs.readFileSync('app/datasets/page.tsx', 'utf8')

assert.ok(form.includes("import { canonicalRoutes } from '@/lib/platform/canonical-routes'"), 'source onboarding must use canonical route builders')
assert.ok(form.includes('createdSourceProjectId'), 'source onboarding must retain the successful project context')
assert.ok(form.includes("const sourceProjectId = String(payload.source?.project_id ?? projectId)"), 'success context must derive from the persisted source response')
assert.ok(form.includes('setCreatedSourceProjectId(sourceProjectId)'), 'successful source registration must enable continuation CTAs')
assert.ok(form.includes('!error && createdSourceProjectId'), 'continuation CTAs must never render for failed registration')
assert.ok(form.includes('Continue to dataset registration'), 'successful source registration must expose the next Golden Path action')
assert.ok(form.includes('canonicalRoutes.governanceRun(createdSourceProjectId)'), 'successful source registration must expose Governance Run')
assert.ok(form.includes('setCreatedSourceProjectId(null)'), 'stale successful context must be cleared on subsequent edits')
assert.ok(form.includes('role="status"'), 'source registration result must be accessible as status')
assert.ok(page.includes('id="register-dataset"'), 'dataset registration must expose a canonical in-page continuation target')
assert.ok(page.includes('scroll-mt-24'), 'the continuation target must remain visible below the sticky/product shell')

console.log('Source onboarding continuation and failure-state contract passed.')
