import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const required = [
  'components/app-shell/global-utility-bar.tsx',
  'components/role-landing/role-landing-shell.tsx',
  'app/dashboard/page.tsx',
  'app/dashboard/error.tsx',
  'app/search/page.tsx',
  'app/inbox/page.tsx',
  'app/inbox/loading.tsx',
  'app/monitoring/loading.tsx',
  'components/app-shell/execution-status.tsx',
  'components/app-shell/workspace-state.tsx',
  'components/app-shell/workspace-error.tsx',
  'app/issues/loading.tsx',
  'app/issues/error.tsx',
  'app/workflows/loading.tsx',
  'app/workflows/error.tsx',
  'app/observability/loading.tsx',
  'app/observability/error.tsx',
  'app/monitoring/error.tsx',
  'app/inbox/error.tsx',
]

for (const path of required) {
  await access(path, constants.R_OK)
  console.log(`PASS UX foundation artifact ${path}`)
}

const shell = await readFile('components/app-shell/global-utility-bar.tsx', 'utf8')
for (const [pattern, label] of [
  [/href="\/search"/, 'real global search entry point'],
  [/href="\/inbox"/, 'governance inbox entry point'],
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

const executionStatus = await readFile('components/app-shell/execution-status.tsx', 'utf8')
for (const [pattern, label] of [
  [/RUNNING.*QUEUED.*PENDING/s, 'active async status vocabulary'],
  [/SUCCEEDED.*COMPLETED/s, 'completed async status vocabulary'],
  [/FAILED.*ERROR.*CANCELLED/s, 'failed async status vocabulary'],
  [/motion-reduce:animate-none/, 'reduced-motion safe activity indicator'],
]) {
  if (!pattern.test(executionStatus)) throw new Error(`Shared async status missing ${label}`)
  console.log(`PASS ${label}`)
}

const monitor = await readFile('app/monitoring/job-monitor.tsx', 'utf8')
if (!/ExecutionStatusBadge/.test(monitor)) throw new Error('Job Monitor must use the shared execution status component.')
console.log('PASS Job Monitor uses shared async execution status')

const inboxLoading = await readFile('app/inbox/loading.tsx', 'utf8')
const monitoringLoading = await readFile('app/monitoring/loading.tsx', 'utf8')
if (!/WorkspaceLoadingState/.test(inboxLoading) || !/WorkspaceLoadingState/.test(monitoringLoading)) {
  throw new Error('Inbox and monitoring must use shared loading states.')
}
console.log('PASS async workspaces use shared loading states')

const workspaceError = await readFile('components/app-shell/workspace-error.tsx', 'utf8')
for (const [pattern, label] of [
  [/onClick={reset}/, 'retry action in shared workspace error'],
  [/error\.digest/, 'non-sensitive error reference'],
  [/No data was changed/, 'safe mutation boundary messaging'],
]) {
  if (!pattern.test(workspaceError)) throw new Error(`Shared workspace error state missing ${label}`)
  console.log(`PASS ${label}`)
}

for (const path of ['app/issues','app/workflows','app/observability','app/monitoring','app/inbox']) {
  const error = await readFile(`${path}/error.tsx`, 'utf8')
  if (!/WorkspaceErrorState/.test(error)) throw new Error(`${path} must use shared recoverable error state.`)
}
console.log('PASS priority governance workspaces use shared recoverable errors')

for (const path of ['app/issues','app/workflows','app/observability','app/monitoring','app/inbox']) {
  const loading = await readFile(`${path}/loading.tsx`, 'utf8')
  if (!/WorkspaceLoadingState/.test(loading)) throw new Error(`${path} must use shared loading state.`)
}
console.log('PASS priority governance workspaces use shared loading states')

const inbox = await readFile('app/inbox/page.tsx', 'utf8')
for (const [pattern, label] of [
  [/workflow_instances/, 'workflow approvals in unified inbox'],
  [/governance'\)\.from\('issues'\)/, 'remediation issues in unified inbox'],
  [/observability_alerts/, 'risk alerts in unified inbox'],
  [/agent_runs/, 'execution attention in unified inbox'],
  [/Some inbox sources could not be loaded/, 'partial-data inbox state'],
]) {
  if (!pattern.test(inbox)) throw new Error(`Governance inbox missing ${label}`)
  console.log(`PASS ${label}`)
}

console.log('DataNexus UX Foundation verification completed.')
