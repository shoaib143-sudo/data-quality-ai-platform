import fs from 'node:fs'
import assert from 'node:assert/strict'

const personas = fs.readFileSync('lib/governance/personas.ts', 'utf8')
const presentation = fs.readFileSync('lib/governance/incident-presentation.ts', 'utf8')
const registry = fs.readFileSync('lib/governance/incident-component-registry.ts', 'utf8')
const reader = fs.readFileSync('lib/governance/governed-incident-reader.ts', 'utf8')
const view = fs.readFileSync('lib/governance/governed-incident-view.ts', 'utf8')

const personaSlugs = [...personas.matchAll(/^  '([^']+)',$/gm)].map((match) => match[1]).slice(0, 13)
assert.equal(personaSlugs.length, 13, 'Expected exactly 13 formal governance personas.')
for (const slug of personaSlugs) {
  assert.ok(presentation.includes(`'${slug}': {`), `Missing incident presentation policy for ${slug}`)
}

for (const marker of [
  "truthBoundary: 'GOVERNED_OUTCOME_ONLY'",
  "authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE'",
  "actionAuthority: 'PRESENTATION_ONLY'",
  "fallback: 'CANONICAL_INCIDENT_VIEW'",
]) assert.ok(presentation.includes(marker), `Missing presentation boundary ${marker}`)

const componentIds = [...presentation.matchAll(/^  '([a-z-]+)',$/gm)].map((match) => match[1]).filter((id) => id.includes('-'))
assert.ok(componentIds.length >= 14, 'Expected governed incident component identifiers.')
for (const id of componentIds) {
  assert.ok(registry.includes(`'${id}':`), `Component registry missing ${id}`)
}
assert.ok(!registry.includes('mayMutateGovernanceTruth: true'), 'Components must never mutate governance truth.')
assert.ok(registry.includes("authorizationBoundary: 'EXTERNAL_TO_COMPONENT'"), 'Component authorization must remain external.')

for (const authorityTable of [
  "from('issues')",
  "from('profiling_remediation_outcomes')",
  "from('data_quality_remediation_outcomes')",
  "from('data_quality_investigations')",
  "from('lineage_impact_analyses')",
  "from('lineage_impact_nodes')",
  "from('dataset_business_context_links')",
  "from('remediation_knowledge')",
]) assert.ok(reader.includes(authorityTable), `Incident reader missing authoritative source ${authorityTable}`)

assert.ok(reader.includes(".eq('project_id', input.projectId)"), 'Incident evidence must remain project scoped.')
assert.ok(reader.includes('assertProjectBelongsToInstanceOrganization(input.projectId)'), 'Incident reader must validate instance organization boundary.')
assert.ok(reader.includes('assertGovernedIncidentTruthInvariant(incident)'), 'Incident composition must assert truth invariants.')
assert.ok(!reader.includes('.insert(') && !reader.includes('.update(') && !reader.includes('.delete('), 'Canonical incident reader must be read-only.')

assert.ok(view.includes('truthFingerprint'), 'Persona incident view must expose a truth-consistency fingerprint.')
assert.ok(view.includes('buildIncidentPresentationPlan(persona)'), 'Persona incident view must use the centralized policy.')
assert.ok(view.includes('getIncidentComponentDefinition'), 'Persona incident view must use the governed component registry.')

console.log('Governed incident foundation verifier passed for all 13 personas and authoritative evidence boundaries.')
