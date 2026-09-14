import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('app/monitoring/page.tsx', 'utf8')
const refreshRoute = readFileSync('app/api/monitoring/runs/route.ts', 'utf8')
const detail = readFileSync('app/monitoring/domain/[projectId]/page.tsx', 'utf8')
const windowSource = readFileSync('lib/monitoring/run-window.ts', 'utf8')

const match = windowSource.match(/MONITORING_RUN_WINDOW\s*=\s*(\d+)/)
assert.ok(match, 'shared monitoring run window must be declared')
const runWindow = Number(match[1])
assert.equal(runWindow, 250, 'monitoring snapshot window must remain aligned to the domain drilldown contract')

assert.match(page, /createAdminClient/, 'overview must enrich already-authorized runs through the trusted server client')
assert.match(page, /filterAuthorizedExecutionRuns/, 'overview must authorize runs before exposing them')
assert.match(page, /\.limit\(MONITORING_RUN_WINDOW\)/, 'overview must use the shared monitoring snapshot window')
assert.match(page, /catalog'\)\.from\('datasets'\)\.select\('id, project_id, name, business_domain'\)/, 'overview must resolve persisted business-domain metadata for authorized runs')
assert.doesNotMatch(page, /\.limit\(50\)/, 'overview must not silently use the old 50-run window')

assert.match(refreshRoute, /\.limit\(MONITORING_RUN_WINDOW\)/, 'refresh endpoint must use the same monitoring snapshot window as initial render')
assert.match(refreshRoute, /filterAuthorizedExecutionRuns/, 'refresh must preserve the authorization boundary')
assert.match(refreshRoute, /business_domain/, 'refresh endpoint must return domain metadata alongside refreshed runs')
assert.doesNotMatch(refreshRoute, /\.limit\(50\)/, 'refresh must not regress to the old 50-run window')

const detailLimit = detail.match(/\.limit\((\d+)\)/)
assert.ok(detailLimit, 'domain drilldown must declare its execution snapshot window')
assert.equal(Number(detailLimit[1]), runWindow, 'overview and drilldown must evaluate feature completion from the same run-window size')

console.log('Job Monitor domain consistency contract passed: authorized metadata enrichment, Customer-domain preservation, and aligned overview/drilldown run windows.')
