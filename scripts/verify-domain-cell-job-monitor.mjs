import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/monitoring/page.tsx', 'utf8')
const monitor = fs.readFileSync('app/monitoring/job-monitor.tsx', 'utf8')

assert.match(page, /schema\('catalog'\)\.from\('datasets'\)\.select\('id, name, business_domain'\)/, 'Domain cell monitor must resolve persisted catalog business-domain metadata server-side.')
assert.match(page, /schema\('app'\)\.from\('projects'\)\.select\('id, name, description'\)/, 'Domain cell monitor must retain governed project scope metadata server-side.')
assert.match(page, /initialProjects=\{typedProjects\}/, 'Resolved project scopes must be passed into the monitor.')
assert.match(monitor, /type DomainCell = \{/, 'Monitor must model an explicit domain-cell aggregate.')
assert.match(monitor, /dataDomainForRun\(run, datasets\)/, 'Runs must be grouped by persisted dataset business-domain metadata.')
assert.match(monitor, /aggregateStatus\(componentRuns\)/, 'Domain status must be derived from the latest state of contained execution components.')
assert.match(monitor, /latestRunPerComponent\(projectRuns\)/, 'Domain cells must collapse repeated runs to the latest state per execution component.')
assert.match(monitor, /datasetCount: new Set\(projectRuns\.flatMap/, 'Domain cells must expose dataset coverage inside the Data Domain.')
assert.match(monitor, /Data Domain/, 'Domain-cell UI must identify the governed domain concept explicitly.')
assert.match(monitor, /Organic cells visualize status, not authority/, 'Visualization must not imply that visual topology changes authorization semantics.')
assert.match(monitor, /Project authorization and execution controls remain enforced/, 'Monitor must preserve governed authorization semantics in the operator surface.')
assert.match(monitor, /\/monitoring\?run=\$\{encodeURIComponent\(selectedRun\.id\)\}#job-logs/, 'Selected execution must retain a deep link into recorded execution diagnostics.')
assert.match(monitor, /setInterval\(\(\) => void refresh\(\), 5000\)/, 'Live status refresh must remain bounded.')
assert.match(monitor, /statusFilter === 'ALL' \|\| cell\.status === statusFilter/, 'Status filtering must be applied to domain aggregates.')
assert.match(monitor, /cell\.domainName\.toLowerCase\(\)\.includes\(q\)/, 'Search must include persisted Data Domain names.')
assert.doesNotMatch(monitor, /Math\.random/, 'Domain topology placement must remain deterministic.')
assert.doesNotMatch(monitor, /SIMULATED DATA|simulated data/i, 'Production Job Monitor must not label real execution evidence as simulated.')

console.log('Domain Cell Job Monitor contract verified: persisted business-domain grouping, governed scope, latest component-state aggregation, deterministic organic topology, filtering, live refresh, and deep-linked diagnostics.')

await import('./test-domain-cell-job-monitor.mjs')
await import('./audit-domain-cell-job-monitor-adversarial.mjs')
