import Link from 'next/link'
import { Activity, AlertTriangle, Bot, LockKeyhole, ShieldCheck } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { createGovernanceCommandCenterState } from '@/lib/ai/governance-command-center-state'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }

function tone(value: string) {
  if (['CRITICAL', 'ERROR', 'FAIL', 'REJECTED', 'REVOKED'].includes(value)) return 'border-red-200 bg-red-50 text-red-800'
  if (['HIGH', 'PARTIAL', 'DRAFT'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800'
  if (['ACTIVE', 'APPROVED', 'PASS', 'SUCCESS'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function Badge({ value }: { value: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone(value)}`}>{value}</span>
}

export default async function AICommandCenterPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id
  const state = selectedProjectId ? await (async () => {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    return createGovernanceCommandCenterState().read(selectedProjectId)
  })() : null

  const systemName = new Map(state?.aiSystems.map((system) => [system.id, system.name]) ?? [])

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="text-sm font-semibold text-slate-600">← Administration</Link>
        <Link href="/ai-capabilities" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">AI Capability Control Center</Link>
      </div>

      <header className="rounded-3xl border bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><ShieldCheck className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">AI Governance Plane</p><h1 className="text-3xl font-black">DataNexus AI Command Center</h1><p className="mt-2 max-w-4xl text-sm text-slate-600">Read-only lifecycle, governance-evidence, telemetry, autonomy-policy and action visibility. Exact-current-version human approval is the only deployment authority shown here.</p></div></div>
      </header>

      <form method="get" className="rounded-2xl border bg-white p-5"><label className="block text-sm font-semibold">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load control state</button></form>

      {!state ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : <>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <article className="rounded-2xl border bg-white p-5"><Bot className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.aiSystems}</p><p className="text-xs font-bold uppercase text-slate-500">AI systems</p></article>
          <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.aiSystemDecisions}</p><p className="text-xs font-bold uppercase text-slate-500">Human decisions</p></article>
          <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.aiSystemAssessments}</p><p className="text-xs font-bold uppercase text-slate-500">Assessments</p></article>
          <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.aiTelemetryEvents}</p><p className="text-xs font-bold uppercase text-slate-500">AI telemetry</p></article>
          <article className="rounded-2xl border bg-white p-5"><LockKeyhole className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.enabledAutoPolicies}</p><p className="text-xs font-bold uppercase text-slate-500">Enabled auto</p></article>
          <article className="rounded-2xl border bg-white p-5"><AlertTriangle className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{state.counts.highOrCriticalFindings}</p><p className="text-xs font-bold uppercase text-slate-500">High / critical</p></article>
        </section>

        <section className="rounded-2xl border bg-slate-950 p-6 text-white"><div className="flex items-center gap-3"><LockKeyhole className="h-5 w-5"/><h2 className="text-lg font-black">Mutation controls remain closed</h2></div><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><p>Autonomy expansion: disabled</p><p>Direct mutation: disabled</p><p>Emergency kill mutation: disabled</p><p>Policy mutation: disabled</p></div></section>

        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Safety findings</h2><p className="mt-1 text-sm text-slate-500">Visibility derived from canonical evidence; findings are not automatic governance decisions.</p><div className="mt-5 space-y-3">{state.findings.length ? state.findings.map((finding) => <article key={`${finding.source}:${finding.recordId}:${finding.code}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"><div><p className="font-bold">{finding.code}</p><p className="mt-1 text-sm text-slate-600">{finding.message}</p><p className="mt-2 font-mono text-[11px] text-slate-400">{finding.source} · {finding.recordId}</p></div><Badge value={finding.severity}/></article>) : <p className="text-sm text-slate-500">No control-state findings.</p>}</div></section>

        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">AI governance evidence</h2><p className="mt-1 text-sm text-slate-500">Versions are append-only. A new current version returns the system to DRAFT until a human reviewer with policy approval authority approves that exact version.</p><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">System</th><th className="p-3">Version</th><th className="p-3">Provider / model</th><th className="p-3">Risk</th><th className="p-3">Intended use</th><th className="p-3">Created</th></tr></thead><tbody>{state.aiSystemVersions.map((version) => <tr key={version.id} className="border-b last:border-0"><td className="p-3 font-bold">{systemName.get(version.ai_system_id) ?? version.ai_system_id}</td><td className="p-3">v{version.version_number}</td><td className="p-3">{version.provider ?? 'Not recorded'} / {version.model_name ?? 'Not recorded'}</td><td className="p-3"><Badge value={version.risk_tier}/></td><td className="p-3">{version.intended_use}</td><td className="p-3 text-xs text-slate-500">{new Date(version.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Human decisions</h2><p className="mt-1 text-sm text-slate-500">APPROVED, REJECTED and REVOKED decisions are append-only human authority evidence.</p><div className="mt-5 space-y-3">{state.aiSystemDecisions.length ? state.aiSystemDecisions.map((decision) => <div key={decision.id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><p className="font-bold">{systemName.get(decision.ai_system_id) ?? decision.ai_system_id}</p><Badge value={decision.decision}/></div><p className="mt-2 text-sm text-slate-600">{decision.review_note}</p><p className="mt-2 text-xs text-slate-400">Capability: {decision.reviewer_capability} · {new Date(decision.created_at).toLocaleString()}</p></div>) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No human AI-system decisions are recorded for this project.</p>}</div></article>

          <article className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Assessments</h2><p className="mt-1 text-sm text-slate-500">Assessment provenance remains explicit: HUMAN, SYSTEM or AGENT. Assessment evidence does not replace human deployment approval.</p><div className="mt-5 space-y-3">{state.aiSystemAssessments.length ? state.aiSystemAssessments.map((assessment) => <div key={assessment.id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><p className="font-bold">{assessment.assessment_type} · {assessment.assessor_type}</p><Badge value={assessment.result}/></div><p className="mt-2 text-xs text-slate-500">{systemName.get(assessment.ai_system_id) ?? assessment.ai_system_id} · {new Date(assessment.created_at).toLocaleString()}</p></div>) : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No AI-system assessments are recorded for this project.</p>}</div></article>
        </section>

        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">AI telemetry</h2><p className="mt-1 text-sm text-slate-500">Operational events contain status, latency, token and cost metadata only; prompt, completion and hidden-reasoning payloads are prohibited by the TelemetryProvider contract.</p><div className="mt-5 overflow-x-auto">{state.aiTelemetryEvents.length ? <table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Observed</th><th className="p-3">Operation</th><th className="p-3">Status</th><th className="p-3">Provider / model</th><th className="p-3">Latency</th><th className="p-3">Tokens</th><th className="p-3">Cost</th></tr></thead><tbody>{state.aiTelemetryEvents.map((event) => <tr key={event.id} className="border-b last:border-0"><td className="p-3 text-xs">{new Date(event.observed_at).toLocaleString()}</td><td className="p-3">{event.operation}<p className="text-xs text-slate-400">{event.event_type}</p></td><td className="p-3"><Badge value={event.status}/></td><td className="p-3">{event.provider_id ?? '—'} / {event.model_name ?? '—'}</td><td className="p-3">{event.latency_ms == null ? '—' : `${event.latency_ms} ms`}</td><td className="p-3">{(event.input_tokens ?? 0) + (event.output_tokens ?? 0)}</td><td className="p-3">{event.cost_usd == null ? '—' : `$${Number(event.cost_usd).toFixed(6)}`}</td></tr>)}</tbody></table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No AI telemetry events are recorded for this project.</p>}</div></section>

        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Autonomy policies</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Action</th><th className="p-3">Mode</th><th className="p-3">Authority</th><th className="p-3">Confidence</th><th className="p-3">Max auto risk</th><th className="p-3">Reversible</th></tr></thead><tbody>{state.autonomyPolicies.map((policy) => <tr key={policy.id} className="border-b last:border-0"><td className="p-3 font-bold">{policy.action_key}</td><td className="p-3">{policy.enabled ? policy.execution_mode : 'DISABLED'}</td><td className="p-3">{policy.authority_status}</td><td className="p-3">{Number(policy.min_confidence).toFixed(2)}</td><td className="p-3">{policy.max_auto_risk_level}</td><td className="p-3">{policy.reversible ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></section>

        <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-black">Recent autonomy actions</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Action</th><th className="p-3">Status</th><th className="p-3">Risk</th><th className="p-3">Confidence</th><th className="p-3">Created</th></tr></thead><tbody>{state.autonomyActions.map((action) => <tr key={action.id} className="border-b last:border-0"><td className="p-3 font-bold">{action.action_key}</td><td className="p-3">{action.status}</td><td className="p-3">{action.risk_level}</td><td className="p-3">{Number(action.confidence).toFixed(2)}</td><td className="p-3 text-xs text-slate-500">{new Date(action.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></section>
      </>}
    </div>
  </main>
}
