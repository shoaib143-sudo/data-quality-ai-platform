import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../app/datasets/dataset-actions.tsx', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../app/api/profiling/readiness/route.ts', import.meta.url), 'utf8')
const descriptors = fs.readFileSync(new URL('../lib/profiling/readiness-manual-remediation.ts', import.meta.url), 'utf8')

const onboarding = descriptors.match(/READINESS_RULE_NOT_ONBOARDED:[\s\S]*?\n  },/)?.[0] ?? ''
assert.ok(onboarding, 'onboarding blocker must have an explicit descriptor')
assert.match(onboarding, /routeKind: 'NONE'/, 'onboarding must not expose a fabricated route')
assert.match(onboarding, /requiredCapability: 'admin.manage'/)

const unknown = descriptors.match(/affectedObject: 'UNKNOWN'[\s\S]*?routeKind: 'NONE'/)?.[0] ?? ''
assert.ok(unknown, 'unknown blockers must fail closed')

assert.match(api, /canAccessDatasetsWorkspace && canManageSource/)
assert.match(api, /canAccessDatasetsWorkspace && canUpdateCatalog/)
assert.doesNotMatch(api, /source_edit:\s*true/)
assert.doesNotMatch(api, /dataset_edit:\s*true/)

assert.match(source, /readiness\.manual_access\?\.source_edit !== true/)
assert.match(source, /readiness\.manual_access\?\.dataset_edit !== true/)
assert.match(source, /Your current governance context cannot use the source configuration workspace/)
assert.match(source, /Your current governance context cannot use the dataset configuration workspace/)
assert.doesNotMatch(source, /READINESS_RULE_NOT_ONBOARDED[^\n]*canonicalRoutes\./)

console.log('Adversarial profile readiness remediation UX audit passed.')
