import Link from 'next/link'
import { Activity, AlertTriangle, CheckCircle2, Clock3, GitBranch, ShieldAlert, Wrench } from 'lucide-react'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { ExecutionStatusBadge } from '@/components/app-shell/execution-status'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type WorkflowInstance = {
  id: string
  project_id: string
  workflow_definition_id: string
  status: string
  current_step: number
  started_at: string | null
  updated_at: string | null
}

type WorkflowDefinition = {
  id: string
  name: string
  steps: unknown
}

type Issue = {
  id: string
  project_id: string
  title: string
  status: string
  severity: string
  due_at: string | null
  updated_at: string | null
}

type Alert = {
  id: string
  project_id: string
  dataset_id: string
  title: string
  status: string
  severity: string
  category: string
  last_observed_at: string
}

type AgentRun = {
  id: string
  project_id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_code: string | null
}

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) : 'Not available'
}

function severityClass(value: string) {
  const normalized = value.toUpperCase()
  if (normalized === 'CRITICAL' || normalized === 'HIGH') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (normalized === 'MEDIUM') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function EmptyState({ children }: { children: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">{children}</div>
}

export default async function InboxPage() {
  await requireUser()
  const supabase = await createClient()

  const [workflowResult, definitionsResult, issuesResult, alertsResult, jobsResult] = await Promise.all([
    supabase.schema('governance').from('workflow_instances').select('id,project_id,workflow_definition_id,status,current_step,started_at,updated_at').in('status', ['PENDING', 'IN_PROGRESS']).order('updated_at', { ascending: false }).limit(50),
    supabase.schema('governance').from('workflow_definitions').select('id,name,steps'),
    supabase.schema('governance').from('issues').select('id,project_id,title,status,severity,due_at,updated_at').not('status', 'in', '("RESOLVED","CLOSED")').order('updated_at', { ascending: false }).limit(50),
    supabase.schema('profiling').from('observability_alerts').select('id,project_id,dataset_id,title,status,severity,category,last_observed_at').neq('status', 'RESOLVED').order('last_observed_at', { ascending: false }).limit(50),
    supabase.schema('agent').from('agent_runs').select('id,project_id,status,created_at,started_at,completed_at,error_code').in('status', ['FAILED', 'RUNNING', 'QUEUED', 'PENDING']).order('created_at', { ascending: false }).limit(50),
  ])

  const failures = [
    ['workflow approvals', workflowResult.error],
    ['workflow definitions', definitionsResult.error],
    ['issues', issuesResult.error],
    ['observability alerts', alertsResult.error],
    ['job execution', jobsResult.error],
  ].filter(([, error]) => Boolean(error)).map(([label]) => String(label))

  const workflows = (workflowResult.data ?? []) as WorkflowInstance[]
  const definitions = (definitionsResult.data ?? []) as WorkflowDefinition[]
  const issues = (issuesResult.data ?? []) as Issue[]
  const alerts = (alertsResult.data ?? []) as Alert[]
  const jobs = (jobsResult.data ?? []) as AgentRun[]
  const definitionById = new Map(definitions.map((item) => [item.id, item]))

  const failedJobs = jobs.filter((job) => job.status === 'FAILED')
  const activeJobs = jobs.filter((job) => job.status !== 'FAILED')
  const highAlerts = alerts.filter((alert) => ['HIGH', 'CRITICAL'].includes(alert.severity.toUpperCase()))
  const overdueIssues = issues.filter((issue) => issue.due_at && new Date(issue.due_at).getTime() < Date.now())

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <GlobalUtilityBar contextLabel="Governance inbox" />

        <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Action center</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Governance Inbox</h1>
              <p className="mt-3 max-w-3xl leading-7 text-slate-600">
                One place for pending governance work, unresolved risk signals, remediation items, and execution failures visible to your current access scope.
              </p>
            </div>
            <Link href="/search" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Search evidence
            </Link>
          </div>
        </section>

        {failures.length ? (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            Some inbox sources could not be loaded: {failures.join(', ')}. Available evidence is still shown below.
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Pending workflows', workflows.length, GitBranch, '/workflows'],
            ['Open issues', issues.length, Wrench, '/issues'],
            ['High alerts', highAlerts.length, ShieldAlert, '/observability#alerts'],
            ['Failed jobs', failedJobs.length, AlertTriangle, '/monitoring'],
          ].map(([label, value, Icon, href]) => {
            const IconComponent = Icon as typeof GitBranch
            return (
              <Link key={String(label)} href={String(href)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <IconComponent className="h-5 w-5 text-blue-600" aria-hidden="true" />
                <p className="mt-4 text-3xl font-black">{String(value)}</p>
                <p className="text-sm font-semibold text-slate-500">{String(label)}</p>
              </Link>
            )
          })}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><GitBranch className="h-5 w-5 text-violet-600" /><h2 className="text-xl font-black">Approvals and workflows</h2></div>
                <p className="mt-1 text-sm text-slate-500">Pending workflow instances that require continued governance action.</p>
              </div>
              <Link href="/workflows" className="text-sm font-bold text-blue-600">View all</Link>
            </div>
            <div className="mt-5 space-y-3">
              {workflows.length ? workflows.slice(0, 8).map((workflow) => {
                const definition = definitionById.get(workflow.workflow_definition_id)
                return (
                  <Link key={workflow.id} href={`/workflows?instanceId=${encodeURIComponent(workflow.id)}`} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">{definition?.name ?? 'Governance workflow'}</span>
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{workflow.status}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Current step {workflow.current_step + 1} · updated {when(workflow.updated_at ?? workflow.started_at)}</p>
                  </Link>
                )
              }) : <EmptyState>No pending workflow actions are visible.</EmptyState>}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-amber-600" /><h2 className="text-xl font-black">Remediation work</h2></div>
                <p className="mt-1 text-sm text-slate-500">Open governed issues, with overdue work surfaced first.</p>
              </div>
              <Link href="/issues" className="text-sm font-bold text-blue-600">View all</Link>
            </div>
            <div className="mt-5 space-y-3">
              {issues.length ? [...issues].sort((a, b) => Number(Boolean(b.due_at && new Date(b.due_at).getTime() < Date.now())) - Number(Boolean(a.due_at && new Date(a.due_at).getTime() < Date.now()))).slice(0, 8).map((issue) => {
                const overdue = Boolean(issue.due_at && new Date(issue.due_at).getTime() < Date.now())
                return (
                  <Link key={issue.id} href="/issues" className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{issue.title}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${severityClass(issue.severity)}`}>{issue.severity}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{overdue ? 'Overdue' : issue.status} · updated {when(issue.updated_at)}</p>
                  </Link>
                )
              }) : <EmptyState>No open remediation issues are visible.</EmptyState>}
            </div>
            {overdueIssues.length ? <p className="mt-4 text-xs font-semibold text-rose-700">{overdueIssues.length} issue{overdueIssues.length === 1 ? '' : 's'} currently overdue.</p> : null}
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" /><h2 className="text-xl font-black">Risk signals</h2></div>
                <p className="mt-1 text-sm text-slate-500">Persisted observability alerts requiring review.</p>
              </div>
              <Link href="/observability#alerts" className="text-sm font-bold text-blue-600">View all</Link>
            </div>
            <div className="mt-5 space-y-3">
              {alerts.length ? alerts.slice(0, 8).map((alert) => (
                <Link key={alert.id} href="/observability#alerts" className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{alert.title}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{alert.category.replaceAll('_', ' ')} · observed {when(alert.last_observed_at)}</p>
                </Link>
              )) : <EmptyState>No unresolved observability alerts are visible.</EmptyState>}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /><h2 className="text-xl font-black">Execution attention</h2></div>
                <p className="mt-1 text-sm text-slate-500">Failed and active governed agent runs.</p>
              </div>
              <Link href="/monitoring" className="text-sm font-bold text-blue-600">Job monitor</Link>
            </div>
            <div className="mt-5 space-y-3">
              {jobs.length ? jobs.slice(0, 8).map((job) => (
                <Link key={job.id} href={`/monitoring?run=${encodeURIComponent(job.id)}`} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{job.status === 'FAILED' ? 'Agent run failed' : 'Agent run in progress'}</span>
                    <ExecutionStatusBadge status={job.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{job.error_code ? `Error ${job.error_code} · ` : ''}{when(job.started_at ?? job.created_at)}</p>
                </Link>
              )) : <EmptyState>No failed or active agent runs are visible.</EmptyState>}
            </div>
            {!failedJobs.length && !activeJobs.length ? <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Execution queue is clear.</div> : null}
          </article>
        </section>

        <footer className="mt-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Inbox contents are derived from persisted governance evidence and current access scope. No synthetic notifications are created.
        </footer>
      </div>
    </main>
  )
}
