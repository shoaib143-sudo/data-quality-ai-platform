import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  stewardshipCreate: await readFile(new URL('../app/api/stewardship/assignments/route.ts', import.meta.url), 'utf8'),
  stewardshipUpdate: await readFile(new URL('../app/api/stewardship/assignments/[assignmentId]/route.ts', import.meta.url), 'utf8'),
  qualityRun: await readFile(new URL('../app/api/data-quality/run/route.ts', import.meta.url), 'utf8'),
  glossaryCreate: await readFile(new URL('../app/api/glossary/route.ts', import.meta.url), 'utf8'),
  glossaryUpdate: await readFile(new URL('../app/api/glossary/[termId]/route.ts', import.meta.url), 'utf8'),
  classificationCreate: await readFile(new URL('../app/api/classifications/route.ts', import.meta.url), 'utf8'),
  classificationUpdate: await readFile(new URL('../app/api/classifications/[classificationId]/route.ts', import.meta.url), 'utf8'),
  issueCreate: await readFile(new URL('../app/api/issues/route.ts', import.meta.url), 'utf8'),
  issueUpdate: await readFile(new URL('../app/api/issues/[issueId]/route.ts', import.meta.url), 'utf8'),
  issueComment: await readFile(new URL('../app/api/issues/[issueId]/comments/route.ts', import.meta.url), 'utf8'),
}

function expectCapability(source, capability, label) {
  assert.match(source, new RegExp(`authorize(?:Project|DatasetVersion)\\([^;]+['"]${capability.replace('.', '\\.') }['"]\\)`), `${label} must require ${capability}`)
  assert.match(source, /createAdminClient\(\)/, `${label} must keep privileged persistence server-side`)
}

expectCapability(files.stewardshipCreate, 'stewardship.manage', 'Stewardship creation')
expectCapability(files.stewardshipUpdate, 'stewardship.manage', 'Stewardship mutation')
expectCapability(files.qualityRun, 'quality.execute', 'Data quality execution')
expectCapability(files.glossaryCreate, 'glossary.manage', 'Glossary creation')
expectCapability(files.glossaryUpdate, 'glossary.manage', 'Glossary mutation')
expectCapability(files.classificationCreate, 'classification.review', 'Classification creation/review')
expectCapability(files.classificationUpdate, 'classification.review', 'Classification decision')
expectCapability(files.issueCreate, 'issues.manage', 'Issue creation')
expectCapability(files.issueUpdate, 'issues.manage', 'Issue mutation')
expectCapability(files.issueComment, 'issues.manage', 'Issue comments')

assert.match(files.qualityRun, /canViewDatasetResource\(user\.id, dataset\.id\)/, 'Quality execution must enforce dataset resource ACL in addition to quality.execute')
assert.match(files.qualityRun, /idempotency-key/i, 'Quality execution must accept an explicit idempotency key')
assert.match(files.qualityRun, /No enabled quality rules apply/, 'Quality execution must fail closed when no rule applies')
assert.match(files.qualityRun, /completed profiling run is required/i, 'Quality execution must require completed profile evidence')

assert.match(files.glossaryUpdate, /Glossary lifecycle and authority must be changed through a governed action/, 'Glossary direct lifecycle-field mutation must be rejected')
assert.match(files.glossaryUpdate, /Governed glossary terms are not hard-deleted/, 'Glossary hard delete must be prohibited')
assert.match(files.stewardshipUpdate, /Stewardship assignments are not hard-deleted/, 'Stewardship hard delete must be prohibited')

assert.match(files.issueCreate, /assertIssueReferencesBelongToProject/, 'Issue creation must validate referenced entities belong to the selected project')
assert.match(files.issueCreate, /assertIssueOwnerBelongsToProjectOrganization/, 'Issue creation must validate owner organization scope')
assert.match(files.issueUpdate, /AMBIGUOUS_REMEDIATION_VERIFICATION_AUTHORITY/, 'Issue resolution must fail closed on ambiguous verification authority')
assert.match(files.issueUpdate, /REMEDIATION_RESOLUTION_EVIDENCE_REQUIRED/, 'Governed remediation resolution must require evidence')

console.log('Data Steward canonical API route authorization and negative-boundary checks passed.')
