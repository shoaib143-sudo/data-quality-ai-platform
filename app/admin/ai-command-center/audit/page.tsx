import Link from 'next/link'
import { CheckCircle2, FileClock, ShieldCheck, XCircle } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { createGovernanceAuditCommandCenterState } from '@/lib/ai/governance-audit-command-center-state'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type Project = { id: string; name: string }

function recorded(value: string | null | undefined) {
  return value ? 'Recorded' : 'Not recorded'
}

export default async function AuditEvidencePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)
  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId) ? params.projectId! : projects[0]?.id
  const state = selectedProjectId ? await (async () => {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    return createGovernanceAuditCommandCenterState().read(selectedProjectId)
  })() : null

  return <main className="min-h-screen bg-slate-50 p-5 sm:p-8">
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={selectedProjectId ? `/admin/ai-command-center?projectId=${selectedProjectId}` : '/admin/ai-command-center'} className="text-sm font-semibold text-slate-600">← AI Command Center</Link>
        <Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">Administration</Link>
      </div>

      <header className="rounded-3xl border bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><FileClock className="h-6 w-6"/></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Audit Evidence</p><h1 className="text-3xl font-black">Command Center Audit Ledger</h1><p className="mt-2 max-w-4xl text-sm text-slate-600">Read-only audit-event provenance, canonical chain verification and immutable report-snapshot visibility. Raw metadata and report payloads are intentionally not exposed here.</p></div></div>
      </header>

      <form method="get" className="rounded-2xl border bg-white p-5"><label className="block text-sm font-semibold">Project<select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load audit evidence</button></form>

      {!state ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : <>
        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Canonical verifier</p><h2 className="mt-1 text-xl font-black">Audit chain verification</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">This status comes from governance.verify_audit_chain for the selected project. Event rows alone are not treated as independent proof of chain integrity.</p></div><div className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black ${state.chainVerification.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{state.chainVerification.valid ? <CheckCircle2 className="h-4 w-4"/> : <XCircle className="h-4 w-4"/>}{state.chainVerification.valid ? 'VERIFIED VALID' : 'VERIFICATION FAILED'}</div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-xl border p-4"><p className="text-2xl font-black">{state.chainVerification.events_checked}</p><p className="text-xs font-bold uppercase text-slate-500">Events checked</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-black">{state.chainVerification.failures}</p><p className="text-xs font-bold uppercase text-slate-500">Failures</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-black">v{state.chainVerification.chain_version}</p><p className="text-xs font-bold uppercase text-slate-500">Chain version</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-black">{state.chainVerification.v2_forks_observed + state.chainVerification.legacy_forks_observed}</p><p className="text-xs font-bold uppercase text-slate-500">Observed legacy forks</p></div><div className="rounded-xl border p-4"><p className="text-sm font-black">{state.chainVerification.verified_at ? new Date(state.chainVerification.verified_at).toLocaleString() : 'Not recorded'}</p><p className="text-xs font-bold uppercase text-slate-500">Verified at</p></div></div>
        </section>

        <section className="rounded-2xl border bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Recent audit events</h2><p className="mt-1 max-w-4xl text-sm text-slate-500">The latest 100 project-scoped events show actor, event, entity, correlation and chain provenance only. Audit metadata is not rendered.</p></div><div className="text-right text-xs text-slate-500"><p>{state.counts.visibleAuditEvents} recent events shown</p><p>{state.counts.visibleEventsMissingSequence} without sequence · {state.counts.visibleEventsMissingPreviousHash} without previous hash in this window</p></div></div><div className="mt-5 overflow-x-auto">{state.auditEvents.length ? <table className="w-full min-w-[1150px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Created</th><th className="p-3">Actor</th><th className="p-3">Event</th><th className="p-3">Entity</th><th className="p-3">Correlation</th><th className="p-3">Chain</th><th className="p-3">Hashes</th></tr></thead><tbody>{state.auditEvents.map((event) => <tr key={event.id} className="border-b last:border-0"><td className="p-3 text-xs">{new Date(event.created_at).toLocaleString()}</td><td className="p-3">{event.actor_type}<p className="font-mono text-[11px] text-slate-400">{event.actor_user_id ?? 'No user actor'}</p></td><td className="p-3 font-semibold">{event.event_type}</td><td className="p-3">{event.entity_type ?? 'Not recorded'}<p className="font-mono text-[11px] text-slate-400">{event.entity_id ?? 'No entity id'}</p></td><td className="p-3 font-mono text-xs">{event.correlation_id ?? 'Not recorded'}</td><td className="p-3">v{event.chain_version}<p className="text-xs text-slate-400">Sequence {event.chain_sequence ?? 'legacy / not recorded'}</p></td><td className="p-3 text-xs">Event hash: {recorded(event.event_hash)}<p className="text-slate-400">Previous: {recorded(event.previous_hash)}</p></td></tr>)}</tbody></table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No audit events are recorded for this project. Absence means audit evidence has not been recorded, not that governed activity did not occur.</p>}</div></section>

        <section className="rounded-2xl border bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Audit report snapshots</h2><p className="mt-1 max-w-4xl text-sm text-slate-500">Snapshots bind a report to an audit-chain tip and report hash. Report payloads and chain-tip hash values are not exposed in this view.</p></div><p className="text-xs text-slate-500">{state.counts.visibleAuditSnapshots} recent snapshots shown</p></div><div className="mt-5 overflow-x-auto">{state.auditReportSnapshots.length ? <table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Created</th><th className="p-3">Type</th><th className="p-3">Actor</th><th className="p-3">Events</th><th className="p-3">Chain sequence</th><th className="p-3">Integrity fields</th></tr></thead><tbody>{state.auditReportSnapshots.map((snapshot) => <tr key={snapshot.id} className="border-b last:border-0"><td className="p-3 text-xs">{new Date(snapshot.created_at).toLocaleString()}</td><td className="p-3 font-bold">{snapshot.report_type}</td><td className="p-3">{snapshot.actor_type}<p className="text-xs text-slate-400">{snapshot.actor_ref ?? 'Actor reference not recorded'}</p></td><td className="p-3">{snapshot.audit_event_count}</td><td className="p-3">{snapshot.chain_sequence}</td><td className="p-3 text-xs">Chain tip: recorded<p className="text-slate-400">Report hash: recorded</p></td></tr>)}</tbody></table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No audit report snapshots are recorded for this project. This does not negate the underlying audit-event ledger or its chain-verification result.</p>}</div></section>

        <section className="rounded-2xl border bg-slate-950 p-6 text-white"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5"/><h2 className="text-lg font-black">Authority boundary</h2></div><p className="mt-3 max-w-4xl text-sm text-slate-300">Audit validity demonstrates the verifier’s assessment of ledger integrity. It does not approve an AI system, activate a model version, promote learning, mutate policy, or grant deployment authority.</p></section>
      </>}
    </div>
  </main>
}