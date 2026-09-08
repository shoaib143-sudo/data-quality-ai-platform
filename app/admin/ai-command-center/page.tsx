import Link from 'next/link'
import { Activity, AlertTriangle, Bot, LockKeyhole, ShieldCheck } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { createGovernanceCommandCenterState } from '@/lib/ai/governance-command-center-state'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }

function severityTone(severity: string) {
  if (severity === 'CRITICAL') return 'border-red-200 bg-red-50 text-red-800'
  if (severity === 'HIGH') return 'border-orange-200 bg-orange-50 text-orange-800'
  if (severity === 'WARN') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function lifecycleTone(status: string) {
  if (status === 'APPROVED' || status === 'ACTIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'DRAFT') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function executionTone(mode: string, enabled: boolean) {
  if (!enabled || mode === 'BLOCKED') return 'border-slate-200 bg-slate-50 text-slate-700'
  if (mode === 'APPROVAL_REQUIRED') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (mode === 'AUTO') return 'border-red-200 bg-red-50 text-red-800'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

export default async function AICommandCenterPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)

  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id
  const state = selectedProjectId
    ? await (async () => {
        await authorizeProject(user.id, selectedProjectId, 'catalog.read')
        return createGovernanceCommandCenterState().read(selectedProjectId)
      })()
    : null

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/50 p-5 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">← Administration</Link>
          <Link href="/ai-capabilities" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">AI Capability Control Center</Link>
        </div>

        <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><ShieldCheck className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">AI Governance Plane</p>
              <h1 className="text-3xl font-black tracking-tight">DataNexus AI Command Center</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">Read-only control-state visibility for governed AI systems, autonomy policies, action history and safety findings. This surface does not approve systems, change policies, execute actions or expand autonomy.</p>
            </div>
          </div>
        </header>

        <form method="get" className="rounded-2xl border bg-white p-5">
          <label className="block text-sm font-semibold">Project
            <select name="projectId" defaultValue={selectedProjectId} className="mt-2 w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <button className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load control state</button>
        </form>

        {!state ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">No authorized project is available for this account.</section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <article className="rounded-2xl border bg-white p-5"><Bot className="h-5 w-5 text-violet-600"/><p className="mt-3 text-3xl font-black">{state.counts.aiSystems}</p><p className="text-xs font-bold uppercase text-slate-500">AI systems</p></article>
              <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5 text-red-600"/><p className="mt-3 text-3xl font-black">{state.counts.enabledAutoPolicies}</p><p className="text-xs font-bold uppercase text-slate-500">Enabled auto</p></article>
              <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5 text-blue-600"/><p className="mt-3 text-3xl font-black">{state.counts.enabledApprovalPolicies}</p><p className="text-xs font-bold uppercase text-slate-500">Approval required</p></article>
              <article className="rounded-2xl border bg-white p-5"><LockKeyhole className="h-5 w-5 text-slate-600"/><p className="mt-3 text-3xl font-black">{state.counts.blockedPolicies}</p><p className="text-xs font-bold uppercase text-slate-500">Blocked / disabled</p></article>
              <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5 text-amber-600"/><p className="mt-3 text-3xl font-black">{state.counts.openActions}</p><p className="text-xs font-bold uppercase text-slate-500">Open actions</p></article>
              <article className="rounded-2xl border bg-white p-5"><AlertTriangle className="h-5 w-5 text-orange-600"/><p className="mt-3 text-3xl font-black">{state.counts.highOrCriticalFindings}</p><p className="text-xs font-bold uppercase text-slate-500">High / critical</p></article>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5 text-emerald-300"/><h2 className="text-lg font-black">Mutation controls remain closed</h2></div>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p><span className="font-bold">Autonomy expansion:</span> disabled</p>
                <p><span className="font-bold">Direct mutation:</span> disabled</p>
                <p><span className="font-bold">Emergency kill mutation:</span> disabled in this UI slice</p>
                <p><span className="font-bold">Policy mutation:</span> disabled</p>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6">
              <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-black">Safety findings</h2><p className="mt-1 text-sm text-slate-500">Derived from canonical governance state. Findings are visibility, not automatic governance decisions.</p></div></div>
              <div className="mt-5 space-y-3">
                {state.findings.length === 0 ? <p className="text-sm text-slate-500">No control-state findings.</p> : state.findings.map((finding) => (
                  <article key={`${finding.source}:${finding.recordId}:${finding.code}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
                    <div><p className="font-bold">{finding.code}</p><p className="mt-1 text-sm text-slate-600">{finding.message}</p><p className="mt-2 font-mono text-[11px] text-slate-400">{finding.source} · {finding.recordId}</p></div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${severityTone(finding.severity)}`}>{finding.severity}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-black">AI systems</h2>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">System</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Lifecycle</th><th className="px-3 py-3">Current version</th></tr></thead><tbody>{state.aiSystems.map((system) => <tr key={system.id} className="border-b last:border-0"><td className="px-3 py-4"><p className="font-bold">{system.name}</p><p className="font-mono text-xs text-slate-500">{system.system_key}</p></td><td className="px-3 py-4">{system.system_type}</td><td className="px-3 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${lifecycleTone(system.lifecycle_status)}`}>{system.lifecycle_status}</span></td><td className="px-3 py-4 font-mono text-xs text-slate-500">{system.current_version_id ?? 'None'}</td></tr>)}</tbody></table></div>
            </section>

            <section className="rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-black">Autonomy policies</h2>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Action</th><th className="px-3 py-3">Mode</th><th className="px-3 py-3">Authority</th><th className="px-3 py-3">Confidence</th><th className="px-3 py-3">Max auto risk</th><th className="px-3 py-3">Reversible</th><th className="px-3 py-3">Reviewed</th></tr></thead><tbody>{state.autonomyPolicies.map((policy) => <tr key={policy.id} className="border-b last:border-0"><td className="px-3 py-4 font-bold">{policy.action_key}</td><td className="px-3 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${executionTone(policy.execution_mode, policy.enabled)}`}>{policy.enabled ? policy.execution_mode : 'DISABLED'}</span></td><td className="px-3 py-4">{policy.authority_status}</td><td className="px-3 py-4">{Number(policy.min_confidence).toFixed(2)}</td><td className="px-3 py-4">{policy.max_auto_risk_level}</td><td className="px-3 py-4">{policy.reversible ? 'Yes' : 'No'}</td><td className="px-3 py-4 text-xs text-slate-500">{policy.reviewed_at ? new Date(policy.reviewed_at).toLocaleString() : 'Not recorded'}</td></tr>)}</tbody></table></div>
            </section>

            <section className="rounded-2xl border bg-white p-6">
              <h2 className="text-xl font-black">Recent autonomy actions</h2>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Action</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Risk</th><th className="px-3 py-3">Confidence</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Executed</th></tr></thead><tbody>{state.autonomyActions.map((action) => <tr key={action.id} className="border-b last:border-0"><td className="px-3 py-4 font-bold">{action.action_key}</td><td className="px-3 py-4">{action.status}</td><td className="px-3 py-4">{action.risk_level}</td><td className="px-3 py-4">{Number(action.confidence).toFixed(2)}</td><td className="px-3 py-4 text-xs text-slate-500">{new Date(action.created_at).toLocaleString()}</td><td className="px-3 py-4 text-xs text-slate-500">{action.executed_at ? new Date(action.executed_at).toLocaleString() : 'Not executed'}</td></tr>)}</tbody></table></div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
