import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const required = [
  'app/access-denied/page.tsx',
  'lib/governance/workspace-access.ts',
]

for (const path of required) {
  await access(path, constants.R_OK)
  console.log(`PASS policy-denied UX artifact ${path}`)
}

const guard = await readFile('lib/governance/workspace-access.ts', 'utf8')
for (const [pattern, label] of [
  [/redirect\(context\.enabled \? '\/access-denied' : '\/home\/unavailable'\)/, 'denied workspace redirect'],
  [/canAccessWorkspace\(context\.persona, workspace, context\.organizationRole\)/, 'centralized workspace authorization'],
]) {
  if (!pattern.test(guard)) throw new Error(`Workspace access guard missing ${label}`)
  console.log(`PASS ${label}`)
}

const page = await readFile('app/access-denied/page.tsx', 'utf8')
for (const [pattern, label] of [
  [/requireUser\(\)/, 'authenticated denied-state route'],
  [/resolveLandingAccess\(user\.id\)/, 'current governance context'],
  [/DataNexus has not changed any data or permissions/, 'safe no-mutation statement'],
  [/does not disclose the internal capability or policy rule/, 'non-leaking denial explanation'],
  [/Return to role home/, 'safe recovery action'],
  [/id="main-content"/, 'accessible main landmark'],
]) {
  if (!pattern.test(page)) throw new Error(`Policy-denied page missing ${label}`)
  console.log(`PASS ${label}`)
}

if (/required capability|missing permission|policy key|role_key/i.test(page)) {
  throw new Error('Policy-denied UX must not reveal internal authorization detail.')
}
console.log('PASS denied-state copy does not expose internal authorization detail')
console.log('DataNexus policy-denied UX verification completed.')
