import fs from 'node:fs'
import assert from 'node:assert/strict'

const detail = fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8')
const issues = fs.readFileSync('app/issues/page.tsx', 'utf8')
const presentation = fs.readFileSync('lib/governance/incident-presentation.ts', 'utf8')

assert.ok(detail.includes('loadGovernedIncident({ projectId, issueId })'), 'Incident detail must use the canonical authoritative incident reader.')
assert.ok(detail.includes('buildGovernedIncidentView(incident, landing.persona)'), 'Incident detail must use the centralized persona incident view.')
assert.ok(detail.includes(".schema('governance').from('issues')"), 'Incident detail must first prove user-scoped issue visibility through RLS.')
assert.ok(detail.includes(".eq('organization_id', landing.organizationId)"), 'Incident detail must enforce the resolved organization boundary.')
assert.ok(detail.includes("hasProjectCapability(user.id, projectId, 'issues.manage')"), 'Mutation authority must be resolved independently of persona presentation.')
assert.ok(detail.includes('view.components.map'), 'Component order must come from the presentation plan, not local persona branching.')
assert.ok(!detail.includes("case 'senior-leadership'") && !detail.includes("case 'data-owner'"), 'The page must not duplicate persona policy switches.')
assert.ok(detail.includes('Presentation changes by persona; severity, issue state, evidence, ownership and verification truth do not.'), 'Truth invariance must be visible in the workspace.')
assert.ok(detail.includes("incident.truth.lifecycleState === 'VERIFIED_RESOLVED'"), 'Verified resolution must be distinguished from merely recorded resolution.')
assert.ok(!detail.includes('.insert(') && !detail.includes('.update(') && !detail.includes('.delete('), 'Incident detail route must remain read-only.')

for (const id of [...presentation.matchAll(/^  '([a-z-]+)',$/gm)].map(match => match[1]).filter(id => id.includes('-'))) {
  assert.ok(detail.includes(`case '${id}'`) || id === 'incident-summary', `Incident workspace missing renderer for ${id}`)
}

assert.ok(issues.includes('Canonical incident journey'), 'Issues workspace must expose the governed incident journey.')
assert.ok(issues.includes('href={`/issues/${issue.id}`}'), 'Issues workspace must link to canonical incident detail.')
assert.ok(issues.includes('all 13 personas'), 'Incident journey must be explicitly governed for all formal personas.')

console.log('Persona-aware governed incident workspace verifier passed.')
