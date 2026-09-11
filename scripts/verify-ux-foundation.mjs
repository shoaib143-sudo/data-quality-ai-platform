import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const required = [
  'components/app-shell/global-utility-bar.tsx',
  'components/role-landing/role-landing-shell.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/error.tsx',
  'app/search/page.tsx',
]

for (const path of required) {
  await access(path, constants.R_OK)
  console.log(`PASS UX foundation artifact ${path}`)
}

const shell = await readFile('components/app-shell/global-utility-bar.tsx', 'utf8')
for (const [pattern, label] of [
  [/href="\/search"/, 'real global search entry point'],
  [/href="\/issues"/, 'governance work queue entry point'],
  [/aria-label="Primary"/, 'semantic primary navigation'],
  [/focus-visible:ring-2/, 'visible keyboard focus treatment'],
]) {
  if (!pattern.test(shell)) throw new Error(`UX foundation shell missing ${label}`)
  console.log(`PASS ${label}`)
}

const roleShell = await readFile('components/role-landing/role-landing-shell.tsx', 'utf8')
if (!/GlobalUtilityBar/.test(roleShell)) throw new Error('Role landing must use the shared DataNexus utility shell.')
if (/Search DataNexus/.test(roleShell) && !/href=.*search/.test(roleShell)) throw new Error('Role landing must not retain a decorative search placeholder.')
console.log('PASS role landing uses shared utility navigation')

const dashboard = await readFile('app/dashboard/page.tsx', 'utf8')
if (!/GlobalUtilityBar/.test(dashboard)) throw new Error('Executive dashboard must use the shared DataNexus utility shell.')
console.log('PASS executive dashboard uses shared utility navigation')

const errorState = await readFile('app/dashboard/error.tsx', 'utf8')
for (const pattern of [/reset/, /Retry dashboard/, /View observability/]) {
  if (!pattern.test(errorState)) throw new Error('Dashboard error state must remain recoverable and actionable.')
}
console.log('PASS dashboard has a recoverable error state')

console.log('DataNexus UX Foundation verification completed.')
