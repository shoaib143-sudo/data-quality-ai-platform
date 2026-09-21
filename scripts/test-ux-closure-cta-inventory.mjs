import assert from 'node:assert/strict'
import fs from 'node:fs'

const files = {
  shell: fs.readFileSync('components/app-shell/global-utility-bar.tsx', 'utf8'),
  datasetActions: fs.readFileSync('app/datasets/dataset-actions.tsx', 'utf8'),
  registration: fs.readFileSync('app/datasets/register-dataset-form.tsx', 'utf8'),
  journeyOverview: fs.readFileSync('app/journeys/page.tsx', 'utf8'),
  governanceRun: fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8'),
  remediation: fs.readFileSync('app/profiling/profiling-governance-panel.tsx', 'utf8'),
}

const expected = {
  shell: ['Dashboard', 'Data', 'Quality', 'Governance', 'Automation', 'Monitor', 'Approvals', 'Admin', 'Search', 'Inbox'],
  datasetActions: ['Dataset 360', 'Fix manually', 'Ask AI to repair', 'Run profiling'],
  registration: ['Create project', 'Cancel', 'Register dataset', 'Run profiling', 'Open Dataset 360'],
  journeyOverview: ['Open Governance Run'],
  governanceRun: [
    'Connect source',
    'Review sources',
    'Register dataset',
    'Open Dataset 360',
    'Open profiling',
    'Open profiling evidence',
    'Review quality',
    'Review findings',
    'Review governance',
    'Open workflow',
    'Open remediation',
    'Review issues',
    'Review verification',
    'Review outcome',
    'Review learning',
    'Review learning evidence',
    'Return to journeys',
    'Open explorer',
    'Open workflows',
    'Job Monitor',
    'Approvals',
    'Reports',
  ],
  remediation: [
    'Open Governance Workflows',
    'Start governed approval',
    'Track remediation',
    'Check verification',
    'Retry automatic verification',
    'Restart automatic verification',
    'Resolve with evidence',
  ],
}

for (const [key, labels] of Object.entries(expected)) {
  const source = files[key]
  for (const label of labels) assert.ok(source.includes(label), `${key} is missing CTA or navigation label: ${label}`)
}

for (const [key, source] of Object.entries({
  datasetActions: files.datasetActions,
  registration: files.registration,
  remediation: files.remediation,
})) {
  const buttonTags = [...source.matchAll(/<button\b[\s\S]*?>/g)].map(match => match[0])
  assert.ok(buttonTags.length > 0, `${key} must expose at least one button`)
  for (const tag of buttonTags) assert.ok(/\btype=/.test(tag), `${key} contains a button without an explicit type: ${tag}`)
}

assert.ok(files.datasetActions.includes('disabled={busy || readinessLoading}'), 'DatasetActions mutation CTAs must suppress actions while busy/loading')
assert.ok(files.registration.includes('disabled={busy}'), 'registration inputs and submit CTA must guard busy state')
assert.ok(files.remediation.includes('disabled={busy !== null}'), 'remediation mutation CTAs must suppress double submission')
assert.ok(files.shell.includes('focus-visible:ring-2'), 'global nav CTAs must retain keyboard focus styling')
assert.ok(files.governanceRun.includes('hover:border-cyan-300/30'), 'Governance Run stage CTAs must retain interactive affordance')
assert.ok(files.registration.includes('role="status"'), 'registration outcome messaging must be exposed as status')
assert.ok(files.datasetActions.includes('role="status"'), 'dataset readiness/execution messaging must be exposed as status')

console.log('UX closure CTA inventory and accessibility contract passed.')