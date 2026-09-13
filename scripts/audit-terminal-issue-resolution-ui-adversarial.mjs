import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ui = await readFile(new URL('../app/issues/issue-manager.tsx', import.meta.url), 'utf8')
const api = await readFile(new URL('../app/api/issues/[issueId]/route.ts', import.meta.url), 'utf8')

const terminalIndex = ui.indexOf("const terminal = ['RESOLVED', 'CLOSED'].includes(issue.status)")
const resolveGuardIndex = ui.indexOf('{!terminal ? <div')
const resolveActionIndex = ui.indexOf('Resolve with evidence')
const commentIndex = ui.indexOf('placeholder="Add comment"')
assert.ok(terminalIndex >= 0, 'Terminal-state classification is missing.')
assert.ok(resolveGuardIndex > terminalIndex && resolveActionIndex > resolveGuardIndex, 'Resolution action is not guarded by terminal state.')
assert.ok(commentIndex > resolveActionIndex, 'Comment capability must remain available independently of the resolution action.')

const authorizeIndex = api.indexOf("authorizeProject(user.id, issue.project_id, 'issues.manage')")
const allowlistIndex = api.indexOf('ISSUE_STATUSES.has(status)')
const updateIndex = api.indexOf(".from('issues').update(updates)")
assert.ok(authorizeIndex >= 0 && allowlistIndex > authorizeIndex && updateIndex > allowlistIndex, 'Authorization and deterministic status validation must precede issue mutation.')
assert.match(api, /requiresGovernedResolutionEvidence/, 'Governed resolution evidence enforcement must remain active.')
assert.match(api, /AMBIGUOUS_REMEDIATION_VERIFICATION_AUTHORITY/, 'Ambiguous verification authority must continue to fail closed.')

for (const futureState of ['ARCHIVED', 'DONE', 'UNKNOWN', 'FUTURE_STATE']) {
  assert.ok(!api.includes(`'${futureState}'`), `Unexpected future issue state ${futureState} entered the governed allowlist.`)
}

console.log('terminal issue resolution adversarial audit: PASS', {
  terminalResolutionActionHidden: true,
  commentsPreserved: true,
  authorizationPrecedesMutation: true,
  unknownStatesFailClosed: true,
})
