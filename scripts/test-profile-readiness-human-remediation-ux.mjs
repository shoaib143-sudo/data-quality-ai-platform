import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../app/datasets/dataset-actions.tsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../app/api/profiling/readiness/route.ts', import.meta.url), 'utf8')
const descriptors = fs.readFileSync(new URL('../lib/profiling/readiness-manual-remediation.ts', import.meta.url), 'utf8')

assert.match(descriptors, /READINESS_RULE_NOT_ONBOARDED/)
assert.match(descriptors, /routeKind: 'NONE'/)
assert.match(descriptors, /There is no self-service onboarding workflow in the product today/)
assert.match(descriptors, /DATASET_NOT_ACTIVE/)
assert.match(descriptors, /Dataset lifecycle activation is not available from the current dataset edit form/)
assert.match(descriptors, /SOURCE_NOT_ACTIVE/)
assert.match(descriptors, /SOURCE_NOT_OBSERVED_READY/)
assert.match(descriptors, /GOVERNED_SCOPE_NOT_READY/)
assert.match(descriptors, /EXECUTION_SOURCE_NOT_BOUND/)
assert.match(descriptors, /DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE/)
assert.match(descriptors, /DATASET_VERSION_NOT_LATEST/)
assert.match(descriptors, /affectedObject: 'UNKNOWN'/)

assert.match(api, /hasProjectCapability\(user\.id, projectId, 'source\.manage'\)/)
assert.match(api, /hasProjectCapability\(user\.id, projectId, 'catalog\.update'\)/)
assert.match(api, /canAccessWorkspace\(landingAccess\.persona, 'datasets', landingAccess\.organizationRole\)/)
assert.match(api, /source_edit: canAccessDatasetsWorkspace && canManageSource/)
assert.match(api, /dataset_edit: canAccessDatasetsWorkspace && canUpdateCatalog/)

assert.match(source, /getReadinessManualRemediationDescriptor\(primaryBlocker\)/)
assert.match(source, /readiness\.manual_access\?\.source_edit !== true/)
assert.match(source, /readiness\.manual_access\?\.dataset_edit !== true/)
assert.match(source, /canonicalRoutes\.sourceEdit\(readiness\.source_id\)/)
assert.match(source, /manualTarget\?\.href \? <Link/)
assert.match(source, /Expected result:/)
assert.doesNotMatch(source, /const manualHref =/)

console.log('Profile readiness human remediation UX contract tests passed.')
