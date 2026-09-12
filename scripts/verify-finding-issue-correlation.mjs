import fs from 'node:fs'
import assert from 'node:assert/strict'

const route = fs.readFileSync('app/api/issues/route.ts', 'utf8')
const correlation = fs.readFileSync('lib/governance/finding-issue-correlation.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260912031000_governance_issue_finding_identity.sql', 'utf8')

assert.ok(migration.includes('create unique index if not exists issues_finding_identity'), 'Profiling finding identity must be database-enforced.')
assert.ok(migration.includes('on governance.issues (finding_id)'), 'Finding identity index must bind governance issue to finding_id.')
assert.ok(migration.includes('where finding_id is not null'), 'Manual/project issues without findings must remain supported.')

assert.ok(correlation.includes(".eq('project_id', projectId)"), 'Finding correlation lookup must remain project scoped.')
assert.ok(correlation.includes(".eq('finding_id', findingId)"), 'Finding correlation lookup must use the authoritative finding identity.')
assert.ok(correlation.includes("error.code === '23505'"), 'Concurrent insert conflicts must be recognized by PostgreSQL unique violation code.')
assert.ok(correlation.includes('issues_finding_identity'), 'Only the finding identity constraint may trigger finding deduplication.')

const integrityPosition = route.indexOf('assertIssueReferencesBelongToProject')
const preexistingPosition = route.indexOf("reason: 'PREEXISTING'")
assert.ok(integrityPosition >= 0 && preexistingPosition > integrityPosition, 'Reference integrity validation must run before deduplication.')
assert.ok(route.includes("reason: 'CONCURRENT_INSERT'"), 'Route must recover idempotently from concurrent inserts.')
assert.ok(route.includes("eventType: 'ISSUE_CREATE_DEDUPLICATED'"), 'Deduplicated requests must remain auditable.')
assert.ok(route.includes('findingId: payload.finding_id'), 'Created issue audit evidence must preserve finding provenance.')
assert.ok(route.includes('profileRunId: payload.profile_run_id'), 'Created issue audit evidence must preserve profile-run provenance.')
assert.ok(route.includes('datasetVersionId: payload.dataset_version_id'), 'Created issue audit evidence must preserve dataset-version provenance.')
assert.ok(!correlation.includes('.update(') && !correlation.includes('.delete('), 'Finding correlation lookup must not mutate existing issue truth.')

console.log('Finding → governance issue correlation verifier passed.')
