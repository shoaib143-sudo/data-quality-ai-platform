import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/monitoring/page.tsx', 'utf8')
const monitor = fs.readFileSync('app/monitoring/job-monitor.tsx', 'utf8')

assert.match(page, /schema\('app'\)\.from\('projects'\)\.select\('id, name, description'\)/, 'Domain cell monitor must resolve governed project scope metadata server-side.')
assert.match(page, /initialProjects=\{typedProjects\}/, 'Resolved project scopes must be passed into the monitor.')
assert.match(monitor, /type DomainCell = \{/, 'Monitor must model an explicit domain-cell aggregate.')
assert.match(monitor, /aggregateStatus\(projectRuns\)/, 'Domain status must be derived from contained execution states.')
assert.match(monitor, /new Set\(projectRuns\.map\(\(run\) => run\.agent_definition_id\)\)\.size/, 'Domain cells must expose contained execution-component coverage.')
assert.match(monitor, /Data Domain/, 'Domain-cell UI must identify the governed domain concept explicitly.')
assert.match(monitor, /Organic cells visualize status, not authority/, 'Visualization must not imply that visual topology changes authorization semantics.')
assert.match(monitor, /Project authorization and execution controls remain enforced/, 'Monitor must preserve governed authorization semantics in the operator surface.')
assert.match(monitor, /\/monitoring\?run=\$\{encodeURIComponent\(selectedRun\.id\)\}#job-logs/, 'Selected execution must retain a deep link into recorded execution diagnostics.')
assert.match(monitor, /setInterval\(\(\) => void refresh\(\), 5000\)/, 'Live status refresh must remain bounded.')
assert.match(monitor, /statusFilter === 'ALL' \|\| cell\.status === statusFilter/, 'Status filtering must be applied to domain aggregates.')
assert.match(monitor, /cell\.project\.name\.toLowerCase\(\)\.includes\(q\)/, 'Search must include Data Domain names.')
assert.doesNotMatch(monitor, /Math\.random/, 'Domain topology placement must remain deterministic.')
assert.doesNotMatch(monitor, /SIMULATED DATA|simulated data/i, 'Production Job Monitor must not label real execution evidence as simulated.')

console.log('Domain Cell Job Monitor contract verified: governed scope, deterministic organic topology, aggregated execution status, filtering, live refresh, and deep-linked diagnostics.')
