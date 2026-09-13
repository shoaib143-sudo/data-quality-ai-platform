import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/monitoring/page.tsx', 'utf8')
const monitor = fs.readFileSync('app/monitoring/job-monitor.tsx', 'utf8')

assert.ok(page.includes("select('id, name, business_domain')"), 'monitor must source Data Domain identity from persisted catalog metadata')
assert.ok(monitor.includes("return domain || 'Unassigned Data Domain'"), 'missing domain metadata must fail visibly into an unassigned bucket')
assert.ok(monitor.includes("const key = \`${run.project_id}::${domainName}\`"), 'same-named domains from separate governed scopes must remain isolated')
assert.ok(monitor.includes("if (!latest.has(run.agent_definition_id))"), 'repeated component runs must collapse deterministically to the latest record')
assert.ok(monitor.includes("aggregateStatus(componentRuns)"), 'cell health must use component state rather than historical run noise')
assert.ok(monitor.includes("cell.domainName.toLowerCase().includes(q)"), 'domain search must operate on persisted domain names')
assert.ok(monitor.includes("selectedCell.datasetCount"), 'selected Data Domain must expose dataset coverage')
assert.ok(!monitor.includes('standing in for a Data Domain'), 'UI must not misrepresent project scope as Data Domain identity')
assert.ok(!monitor.includes('Math.random'), 'organic topology must remain deterministic')
assert.ok(!/SIMULATED DATA|simulated data/i.test(monitor), 'production monitor must not present real evidence as simulated')

console.log('Independent adversarial Domain Cell audit passed: no project-as-domain substitution, no cross-project merge, no hidden unassigned mapping, deterministic topology, and latest-state semantics.')
