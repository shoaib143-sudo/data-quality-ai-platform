import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const required = [
  'components/app-shell/global-utility-bar.tsx',
  'components/app-shell/skip-to-content.tsx',
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
  'app/journeys/page.tsx',
  'app/journeys/layout.tsx',
  'app/journeys/loading.tsx',
  'app/journeys/error.tsx',
  'app/reports/experience/page.tsx',
  'app/reports/experience/loading.tsx',
  'app/reports/experience/error.tsx',
]

for (const path of required) {
  await access(path, constants.R_OK)
  console.log(`PASS UX foundation artifact ${path}`)
}

const shell = await readFile('components/app-shell/global-utility-bar.tsx', 'utf8')
for (const [pattern, label] of [
  [/href="\/search"/, 'real global search entry point'],
  [/\/journeys/, 'guided governance journey entry point'],
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

const journey = await readFile('app/journeys/page.tsx', 'utf8')
for (const [pattern, label] of [
  [/source_operational_readiness/, 'discovery evidence in guided journey'],
  [/profile_runs/, 'profiling evidence in guided journey'],
  [/profile_findings/, 'finding evidence in guided journey'],
  [/quality_rule_runs/, 'quality-control evidence in guided journey'],
  [/steps\.find\(step => !step\.complete\)/, 'evidence-derived next action'],
  [/without claiming certification or completion that has not been proven/, 'truth-boundary copy'],
]) {
  if (!pattern.test(journey)) throw new Error(`Guided journey missing ${label}`)
  console.log(`PASS ${label}`)
}

const journeyLayout = await readFile('app/journeys/layout.tsx', 'utf8')
if (!/requireWorkspaceAccess\('journeys'\)/.test(journeyLayout)) throw new Error('Guided journey must use workspace authorization.')
console.log('PASS guided journey is workspace-authorized')

const experienceReport = await readFile('app/reports/experience/page.tsx', 'utf8')
for (const [pattern, label] of [
  [/orchestration'\)\.from\('analytics_events'\)/, 'service-only interaction telemetry source'],
  [/createAdminClient\(\)/, 'server-side analytics access'],
  [/projectIds/, 'telemetry constrained to accessible projects'],
  [/source_operational_readiness/, 'governed source outcome evidence'],
  [/profile_runs/, 'governed profiling outcome evidence'],
  [/quality_rule_runs/, 'governed control outcome evidence'],
  [/Interaction telemetry helps explain adoption and friction/, 'analytics-versus-governance truth boundary'],
  [/Evidence complete/, 'explicit evidence-completion reporting state'],
]) {
  if (!pattern.test(experienceReport)) throw new Error(`Experience insights report missing ${label}`)
  console.log(`PASS ${label}`)
}

const reportsPage = await readFile('app/reports/page.tsx', 'utf8')
if (!/href="\/reports\/experience"/.test(reportsPage)) throw new Error('Governance reports must link to experience insights.')
console.log('PASS governance reports link to experience insights')

const skipLink = await readFile('components/app-shell/skip-to-content.tsx', 'utf8')
for (const [pattern, label] of [
  [/href={\`#\$\{targetId\}\`}/, 'keyboard skip destination'],
  [/focus:not-sr-only/, 'skip link becomes visible on focus'],
  [/Skip to main content/, 'clear skip-link label'],
]) {
  if (!pattern.test(skipLink)) throw new Error(`Accessibility foundation missing ${label}`)
  console.log(`PASS ${label}`)
}

for (const path of ['app/dashboard/page.tsx','app/inbox/page.tsx','app/journeys/page.tsx','components/role-landing/role-landing-shell.tsx']) {
  const source = await readFile(path, 'utf8')
  if (!/id="main-content"/.test(source) || !/tabIndex={-1}/.test(source)) {
    throw new Error(`${path} must expose a keyboard-focusable main-content target.`)
  }
}
console.log('PASS shared-shell surfaces expose keyboard main-content targets')

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
