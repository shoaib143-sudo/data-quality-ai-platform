import { Activity, AlertTriangle } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { readGovernedTraceTimeline, type GovernedTrace } from '@/lib/ai/governance-trace-timeline'
import { hasTraceInvocationEvidence } from '@/lib/ai/trace-invocation-evidence'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }

function recorded(value: unknown) {
  return value == null || value === '' ? 'Not recorded' : String(value)
}

export default async function AICommandCenterTracesPage({ searchParams }: { searchParams: Promise<{ projectId?: string; traceId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id

  let traces: GovernedTrace[] = []
  if (selectedProjectId) {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    traces = await readGovernedTraceTimeline(selectedProjectId)
  }

  const selectedTraceId = params.traceId?.trim() || null
  const visibleTraces = selectedTraceId ? traces.filter((trace) => trace.traceId === selectedTraceId) : traces

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-3xl border bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><Activity className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">AI Observability Plane</p><h1 className="text-3xl font-black">Trace Timeline</h1><p className="mt-2 max-w-4xl text-sm text-slate-600">Read-only correlation of canonical AI telemetry carrying W3C trace IDs. Model invocation details are a whitelisted evidence projection only; admission evidence describes execution accounting against resource-budget controls, not governance approval. This surface does not grant governance authority and does not assert that every upstream or downstream span has been observed.</p></div></div>
      </header>

      <form method="get" className="grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="block text-sm font-semibold">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full rounded-xl border bg-white px-3 py-2 font-normal">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">Trace ID<input name="traceId" defaultValue={selectedTraceId ?? ''} placeholder="Optional exact W3C trace ID" className="mt-2 block w-full rounded-xl border bg-white px-3 py-2 font-mono text-sm font-normal"/></label>
        <button className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load traces</button>
      </form>

      {!selectedProjectId ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : null}
      {selectedProjectId && visibleTraces.length === 0 ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No canonical trace-correlated telemetry matched this project and trace filter.</section> : null}

      {visibleTraces.map((trace) => <section key={trace.traceId} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-5 py-4"><div><p className="font-mono text-sm font-bold text-slate-950">{trace.traceId}</p><p className="mt-1 text-xs text-slate-500">{trace.firstObservedAt} → {trace.lastObservedAt}</p></div><div className="flex gap-2 text-xs font-bold"><span className="rounded-full border bg-white px-3 py-1">{trace.eventCount} events</span>{trace.errorCount > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-rose-700"><AlertTriangle className="h-3.5 w-3.5"/>{trace.errorCount} errors</span> : <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">No recorded errors</span>}</div></div>
        <div className="divide-y">{trace.events.map((event, index) => <div key={event.id} className="px-5 py-4">
          <div className="grid gap-3 lg:grid-cols-[80px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="text-xs font-bold text-slate-500">#{index + 1}</div>
            <div><p className="text-sm font-bold text-slate-950">{event.operation}</p><p className="mt-1 text-xs text-slate-500">{event.eventType} · {event.status} · {event.observedAt}</p></div>
            <div className="text-xs text-slate-600"><p><span className="font-semibold">Provider:</span> {recorded(event.providerId)}</p><p><span className="font-semibold">Model:</span> {recorded(event.modelName)}</p><p><span className="font-semibold">Agent run:</span> {recorded(event.agentRunId)}</p><p><span className="font-semibold">Execution correlation:</span> <span className="font-mono">{recorded(event.correlationId)}</span></p></div>
            <div className="text-xs text-slate-600"><p><span className="font-semibold">Span:</span> <span className="font-mono">{recorded(event.spanId)}</span></p><p><span className="font-semibold">Parent:</span> <span className="font-mono">{recorded(event.parentSpanId)}</span></p><p><span className="font-semibold">Latency:</span> {recorded(event.latencyMs)} ms · <span className="font-semibold">Tokens:</span> {recorded(event.inputTokens)} / {recorded(event.outputTokens)}</p></div>
          </div>
          {event.eventType === 'MODEL_INVOCATION' && hasTraceInvocationEvidence(event.invocationEvidence) ? <div className="mt-4 grid gap-2 rounded-xl border bg-slate-50 p-4 text-xs text-slate-600 md:grid-cols-2 xl:grid-cols-4">
            <p><span className="font-semibold">Route:</span> {recorded(event.invocationEvidence.routeSource)} · {recorded(event.invocationEvidence.routeReason)}</p>
            <p><span className="font-semibold">Routing policy:</span> {recorded(event.invocationEvidence.routingPolicyId)} · {recorded(event.invocationEvidence.routingPolicyReason)}</p>
            <p><span className="font-semibold">Output ceiling:</span> caller {recorded(event.invocationEvidence.requestedMaxOutputTokens)} · governed {recorded(event.invocationEvidence.governanceMaxOutputTokens)} · effective {recorded(event.invocationEvidence.effectiveMaxOutputTokens)} · policy {recorded(event.invocationEvidence.resourceBudgetPolicyId)}</p>
            <p><span className="font-semibold">Budget admission:</span> {recorded(event.invocationEvidence.resourceBudgetAdmissionReason)} · requests/min window {recorded(event.invocationEvidence.resourceBudgetRequestCountLastMinute)} · active concurrency {recorded(event.invocationEvidence.resourceBudgetActiveConcurrency)}</p>
            <p><span className="font-semibold">Admission ID:</span> <span className="font-mono">{recorded(event.invocationEvidence.resourceBudgetAdmissionId)}</span></p>
            <p><span className="font-semibold">Lease ID:</span> <span className="font-mono">{recorded(event.invocationEvidence.resourceBudgetLeaseId)}</span></p>
            <p><span className="font-semibold">Provider correlation:</span> {recorded(event.invocationEvidence.providerRequestId)} · HTTP {recorded(event.invocationEvidence.providerHttpStatus)}</p>
            <p><span className="font-semibold">Observed total tokens:</span> {recorded(event.invocationEvidence.totalTokens)}</p>
          </div> : null}
        </div>)}</div>
      </section>)}
    </div>
  </main>
}
