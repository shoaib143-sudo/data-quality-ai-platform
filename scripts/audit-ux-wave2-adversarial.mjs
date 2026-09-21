import assert from 'node:assert/strict'
import fs from 'node:fs'
import { classifyRemediationSla } from '../lib/governance/remediation-sla.ts'

const onboarding = fs.readFileSync('app/datasets/jdbc-source-form.tsx', 'utf8')
const dataset360 = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')
const governanceRun = fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8')
const incident = fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8')
const monitor = fs.readFileSync('app/monitoring/page.tsx', 'utf8')

assert.ok(onboarding.includes('!error && createdSourceProjectId'), 'adversarial: failed registration must not expose success continuation')
assert.ok(onboarding.includes('setCreatedSourceProjectId(null)'), 'adversarial: changed connection context must invalidate stale success continuation')
assert.ok(onboarding.includes('!isFile && canOpenDiscovery ? <Link href="/catalog/discovery"'), 'adversarial: source-system personas without discovery access must not receive an inaccessible CTA')
assert.ok(dataset360.includes('.limit(6)'), 'adversarial: Dataset 360 history must remain bounded')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(governanceRun), 'adversarial: Governance Run observability must remain read-only')
assert.ok(governanceRun.includes("const executionHref = canMonitoring && latestExecution"), 'adversarial: monitoring navigation must fail closed on workspace access')
assert.ok(governanceRun.includes("agentRuns.find(run => String(run.dataset_version_id ?? '') === String(latestVersion.id)) ?? null"), 'adversarial: current dataset execution must never fall back to a different dataset run')
assert.ok(governanceRun.includes("=== 'INVALID'"), 'adversarial: malformed remediation due dates must surface as attention')
assert.ok(governanceRun.includes("const remediationRequired = highFindings.length > 0 || openIssues.length > 0"), 'adversarial: unresolved issues must keep remediation active')
assert.equal(classifyRemediationSla({ status: 'OPEN', dueAt: 'invalid', nowMs: 0 }), 'INVALID', 'adversarial: malformed due date must not be treated as on-time')
assert.equal(classifyRemediationSla({ status: 'RESOLVED', dueAt: '1970-01-01T00:00:00Z', nowMs: Date.now() }), 'RESOLVED', 'adversarial: terminal issues must not remain overdue')
assert.ok(incident.includes('Mutation authority independently verified'), 'adversarial: incident presentation must preserve external mutation authority boundary')
assert.ok(monitor.includes('filterAuthorizedExecutionRuns'), 'adversarial: Job Monitor must retain resource authorization filtering')

console.log('Independent Wave 2 UX adversarial audit passed.')