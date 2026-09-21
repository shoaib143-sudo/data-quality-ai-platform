import assert from 'node:assert/strict'
import fs from 'node:fs'

const files = {
  onboarding: fs.readFileSync('app/datasets/page.tsx', 'utf8'),
  sourceForm: fs.readFileSync('app/datasets/jdbc-source-form.tsx', 'utf8'),
  dataset360: fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8'),
  explorer: fs.readFileSync('app/profiling/explorer/page.tsx', 'utf8'),
  monitor: fs.readFileSync('app/monitoring/page.tsx', 'utf8'),
  governanceRun: fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8'),
  incident: fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8'),
}

const expected = {
  onboarding: ['Profiling Workspace', 'Governance Runs'],
  sourceForm: [
    'Create',
    'Cancel',
    'Validate CSV',
    'Scan file & metadata',
    'Connect & discover native hierarchy',
    'Save & make ready',
    'Save connection & governed scope',
    'Open Catalog Discovery',
    'Continue to dataset registration',
    'Open Governance Run',
  ],
  dataset360: [
    'Data Catalog',
    'Profiling evidence',
    'Lineage',
    'Issues',
    'Governance Run',
    'Ask DataNexus AI',
    'Open full evidence',
    'Open evidence',
  ],
  explorer: ['Dataset 360', 'Governance Run'],
  monitor: ['Execution Recovery', 'Run governed feature', 'Open execution recovery'],
  governanceRun: ['Open explorer', 'Job Monitor', 'Approvals', 'Reports', 'Latest execution'],
  incident: ['Issues', 'Governance Run'],
}

for (const [key, labels] of Object.entries(expected)) {
  const source = files[key]
  for (const label of labels) {
    assert.ok(source.includes(label), `${key} missing CTA or interactive label: ${label}`)
  }
}

const sourceButtons = [...files.sourceForm.matchAll(/<button\b[\s\S]*?>/g)].map(match => match[0])
assert.ok(sourceButtons.length >= 4, 'source form must retain its expected button controls')
for (const tag of sourceButtons) {
  assert.ok(/\btype=/.test(tag), `source form button missing explicit type: ${tag}`)
}
assert.ok(files.sourceForm.includes('disabled={busy || !projectId}'), 'source discovery CTA must suppress invalid/busy submission')
assert.ok(files.sourceForm.includes('disabled={busy || !projectId || !name.trim() || (!isFile && !hierarchy)}'), 'source registration CTA must suppress invalid/busy submission')
assert.ok(files.sourceForm.includes('role="status"'), 'source registration result must be announced accessibly')
assert.ok(files.sourceForm.includes('!error && createdSourceProjectId'), 'success CTAs must be hidden after failure')
assert.ok(!files.explorer.includes('<a href={canonicalRoutes.'), 'Profiling Explorer internal context navigation must use framework Links')
assert.ok(files.dataset360.includes('recentRuns.map(item=>canProfiling?'), 'Dataset 360 profile history CTAs must remain access-gated')
assert.ok(files.governanceRun.includes('canMonitoring ? <Link href={executionHref}'), 'Job Monitor CTA must remain access-gated')
assert.ok(files.governanceRun.includes('canApprovals ? <Link href="/approvals"'), 'Approvals CTA must remain access-gated')
assert.ok(files.governanceRun.includes('canReports ? <Link href="/reports"'), 'Reports CTA must remain access-gated')

console.log('Wave 2 CTA inventory, busy-state, and accessibility contract passed.')
