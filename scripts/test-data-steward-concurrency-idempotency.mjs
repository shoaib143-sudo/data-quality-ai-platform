import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const qualityRun = await readFile(new URL('../app/api/data-quality/run/route.ts', import.meta.url), 'utf8')
const issueRoute = await readFile(new URL('../app/api/issues/route.ts', import.meta.url), 'utf8')
const stewardshipRoute = await readFile(new URL('../app/api/stewardship/assignments/route.ts', import.meta.url), 'utf8')
const classificationRoute = await readFile(new URL('../app/api/classifications/[classificationId]/route.ts', import.meta.url), 'utf8')
const glossaryRoute = await readFile(new URL('../app/api/glossary/[termId]/route.ts', import.meta.url), 'utf8')

assert.match(qualityRun, /idempotency-key/i, 'Data Quality execution must accept an idempotency key.')
assert.match(qualityRun, /data-quality:manual:/, 'Data Quality execution must namespace caller-provided idempotency keys.')
assert.match(qualityRun, /reused: queued\.reused/, 'Data Quality execution must expose whether durable work was reused.')

assert.match(issueRoute, /findIssueByFindingIdentity/, 'Issue creation must detect pre-existing issue identity.')
assert.match(issueRoute, /CONCURRENT_INSERT/, 'Issue creation must recover from a concurrent unique-identity insert.')
assert.match(issueRoute, /ISSUE_CREATE_DEDUPLICATED/, 'Issue deduplication must remain auditable.')
assert.match(issueRoute, /deduplicated: true/, 'Issue creation must explicitly signal deduplication.')

assert.match(stewardshipRoute, /error\.code === '23505'/, 'Stewardship assignment must detect unique conflicts.')
assert.match(stewardshipRoute, /active assignment with this target, member and role already exists/i, 'Duplicate stewardship assignment must fail deterministically.')

assert.match(classificationRoute, /review_dataset_classification/, 'Classification decisions must use the canonical database review function.')
assert.doesNotMatch(classificationRoute, /\.from\('dataset_classifications'\)\.update/, 'Classification decisions must not bypass canonical review concurrency semantics with direct updates.')

assert.match(glossaryRoute, /Only a draft term can be submitted for review/, 'Glossary lifecycle replay must reject invalid SUBMIT transitions.')
assert.match(glossaryRoute, /Only a governed term in review can be approved/, 'Glossary lifecycle replay must reject duplicate or out-of-order APPROVE transitions.')
assert.match(glossaryRoute, /Only an approved term can be deprecated/, 'Glossary lifecycle replay must reject duplicate/out-of-order DEPRECATE transitions.')
assert.match(glossaryRoute, /Only a deprecated term can be reopened/, 'Glossary lifecycle replay must reject duplicate/out-of-order REOPEN transitions.')

console.log('Data Steward concurrency and idempotency contracts passed.')
