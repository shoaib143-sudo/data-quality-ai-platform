import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../app/datasets/dataset-actions.tsx', import.meta.url), 'utf8')

assert.match(source, /primaryBlocker === 'READINESS_RULE_NOT_ONBOARDED'/)
assert.match(source, /Readiness policy onboarding requires a governance administrator/)
assert.match(source, /href: null/)
assert.doesNotMatch(source, /const manualHref =/)
assert.match(source, /manualTarget\?\.href \? <Link/)
assert.match(source, /primaryBlocker === 'DATASET_NOT_ACTIVE'/)
assert.match(source, /canonicalRoutes\.datasetEdit\(datasetId\)/)
assert.match(source, /canonicalRoutes\.sourceEdit\(readiness\.source_id\)/)
assert.match(source, /The blocked source could not be resolved, so no safe remediation route is available/)
assert.match(source, /No governed self-service remediation route is available for this blocker/)

console.log('Profile readiness human remediation UX contract tests passed.')
