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
  console.log(`PASS experience insight artifact ${path}`)
}
const page = await readFile('app/reports/experience/page.tsx', 'utf8')
for (const [pattern, label] of [
  [/UX_JOURNEY_VIEWED/, 'journey view evidence'],
  [/UX_JOURNEY_NEXT_ACTION_SELECTED/, 'next action evidence'],
  [/\.in\('project_id', projectIds\)/, 'RLS-scoped project boundary for service telemetry read'],
  [/Governed source, profiling, remediation, and control evidence remains authoritative/, 'governance truth boundary'],
  [/Evidence complete.*reporting convenience, not a certification state/s, 'non-certification outcome wording'],
  [/Observed time to complete.*only when both that governed evidence boundary and a COMPLETE journey interaction/s, 'time-to-value evidence boundary'],
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
