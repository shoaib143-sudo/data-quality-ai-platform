import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/admin/learning-cases/page.tsx', 'utf8')
const manager = fs.readFileSync('app/admin/learning-cases/positive-learning-case-review-manager.tsx', 'utf8')
const route = fs.readFileSync('app/api/admin/learning-cases/[candidateId]/review/route.ts', 'utf8')
const adminLoader = fs.readFileSync('lib/agents/proactive-governed-case-learning-admin.ts', 'utf8')

for (const invariant of [
  'authorizeDataGovernanceSuperAdminForOrganization',
  'loadPositiveLearningCaseAdminInbox',
  'Positive case review',
  'Nothing becomes reusable organizational knowledge until a Data Governance Admin explicitly approves it',
]) {
  assert.ok(page.includes(invariant), 'missing PGCL page invariant: ' + invariant)
}

for (const invariant of [
  'APPROVE_POSITIVE_CASE',
  'APPROVE_WITH_EDITS',
  'REJECT',
  'DEFER',
  'MARK_ONE_OFF',
  'Review reason',
  'Verified result',
  'Proposed reusable lesson',
  'Do not reuse when',
  'Verification evidence',
  'No learning cases need review',
  'occurrenceCount',
  'Latest verified occurrence',
]) {
  assert.ok(manager.includes(invariant), 'missing PGCL UI state/action: ' + invariant)
}

for (const invariant of [
  'requireApiUser',
  'authorizeDataGovernanceSuperAdmin',
  'reviewProactiveGovernedCaseLearningCandidate',
  'A valid PGCL decision is required.',
  'A review reason is required.',
  'Positive learning case was not found.',
]) {
  assert.ok(route.includes(invariant), 'missing PGCL API invariant: ' + invariant)
}

for (const invariant of [
  'dataGovernanceSuperAdminProjectIds',
  "PENDING_REVIEW",
  "DEFERRED",
  'positive_learning_cases',
  'learning_candidates',
  'positive_learning_case_occurrences',
]) {
  assert.ok(adminLoader.includes(invariant), 'missing PGCL inbox invariant: ' + invariant)
}

assert.equal(manager.includes('dangerouslySetInnerHTML'), false)
assert.equal(route.includes('service_role'), false, 'route must use server admin client rather than expose service credentials')
assert.equal(/chain[-_ ]?of[-_ ]?thought/i.test(page + manager + route), false)
assert.equal(/hidden[-_ ]?reasoning/i.test(page + manager + route), false)

console.log('PGCL admin review UX exposes all governed decisions, requires reasons, and keeps authorization server-side.')
