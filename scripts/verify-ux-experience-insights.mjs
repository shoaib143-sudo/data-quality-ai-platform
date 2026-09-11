import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const required = [
  'app/reports/experience/page.tsx',
  'app/reports/experience/layout.tsx',
  'app/reports/experience/loading.tsx',
  'app/reports/experience/error.tsx',
]

for (const path of required) {
  await access(path, constants.R_OK)
  console.log(`PASS experience insights artifact ${path}`)
}

const page = await readFile('app/reports/experience/page.tsx', 'utf8')
for (const [pattern, label] of [
  [/aggregate_type'.*ux_governance_journey/s, 'bounded UX aggregate query'],
  [/UX_JOURNEY_VIEWED/, 'journey view evidence'],
  [/UX_JOURNEY_NEXT_ACTION_SELECTED/, 'next action evidence'],
  [/interaction telemetry.*never substitutes.*governed outcome evidence/s, 'governance truth boundary'],
  [/<caption className="sr-only">/, 'accessible funnel table caption'],
  [/Projects observed complete/, 'completion observation wording'],
]) {
  if (!pattern.test(page)) throw new Error(`Experience insights missing ${label}`)
  console.log(`PASS ${label}`)
}

if (/certified projects|certification rate|governance certified/i.test(page)) {
  throw new Error('Interaction telemetry must not be presented as certification evidence.')
}
console.log('PASS interaction telemetry does not claim certification')

const layout = await readFile('app/reports/experience/layout.tsx', 'utf8')
if (!/requireWorkspaceAccess\('reports'\)/.test(layout)) throw new Error('Experience insights must inherit reports workspace authorization.')
console.log('PASS experience insights uses reports workspace authorization')

console.log('DataNexus UX experience insights verification completed.')
