import Link from 'next/link'
import { Activity, BookOpenCheck, ShieldCheck } from 'lucide-react'

import { authorizeProject } from '@/lib/auth/authorize'
import { readGovernedLearningLifecycleCommandCenter } from '@/lib/ai/governed-learning-command-center-state'
import { readPgclCommandCenterState } from '@/lib/ai/pgcl-command-center-state'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

type Project = { id: string; name: string }

function tone(value: string) {
  if (['REJECTED', 'FAILED', 'ROLLED_BACK', 'NOT_READY'].includes(value)) return 'border-red-200 bg-red-50 text-red-800'
  if (['PENDING_REVIEW', 'DEFERRED', 'REVIEW_REQUIRED', 'CANARY'].includes(value)) return 'border-amber-200 bg-amber-50 text-amber-800'
  if (['APPROVED', 'ACTIVE', 'VERIFIED', 'SUCCEEDED'].includes(value)) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function Badge({ value }: { value: string }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tone(value)}`}>{value}</span>
}

export default async function LearningGovernancePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const user = await requireUser()
  const landing = await resolveLandingAccess(user.id)
  const canAdminWorkspace = canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)
  const params = await searchParams
  const supabase = await createClient()
  const projectsResult = await supabase.schema('app').from('projects').select('id,name').order('name')
  if (projectsResult.error) throw new Error(`Unable to load projects: ${projectsResult.error.message}`)

  const projects = (projectsResult.data ?? []) as Project[]
  const selectedProjectId = projects.some((project) => project.id === params.projectId)
    ? params.projectId!
    : projects[0]?.id

  const control = selectedProjectId ? await (async () => {
    await authorizeProject(user.id, selectedProjectId, 'admin.manage')
    const [lifecycle, pgcl] = await Promise.all([
      readGovernedLearningLifecycleCommandCenter(selectedProjectId),
      readPgclCommandCenterState(selectedProjectId, user.id),
    ])
    return { lifecycle, pgcl }
  })() : null

  const lifecycle = control?.lifecycle ?? null
  const pgcl = control?.pgcl ?? null

  return <main id="main-content" tabIndex={-1} className="min-h-screen bg-slate-50 p-5 sm:p-6">
    <div className="mx-auto max-w-7xl space-y-7">
      <GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Learning Governance" contextLabel="Governed AI learning evidence" homeHref="/home" />
      {canAdminWorkspace ? <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={selectedProjectId ? `/admin/ai-command-center?projectId=${selectedProjectId}` : '/admin/ai-command-center'} className="text-sm font-semibold text-slate-600">← AI Command Center</Link>
        <Link href="/admin" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">Administration</Link>
      </div> : null}

      <header className="rounded-3xl border bg-white p-7 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-600 text-white"><BookOpenCheck className="h-6 w-6"/></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Phase 11 governed learning</p>
            <h1 className="text-3xl font-black">Learning Governance</h1>
            <p className="mt-2 max-w-4xl text-sm text-slate-600">Read-only visibility across learning candidates, benchmark gates, human approval, controlled release, proactive positive cases, and reuse outcomes. This view exposes no review, approval, promotion, activation, rollback, tool-authority, or mutation action.</p>
          </div>
        </div>
      </header>

      <form method="get" className="rounded-2xl border bg-white p-5">
        <label className="block text-sm font-semibold">Project
          <select name="projectId" defaultValue={selectedProjectId} className="mt-2 block w-full max-w-xl rounded-xl border bg-white px-3 py-2 font-normal">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <button type="submit" className="mt-3 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white">Load learning evidence</button>
      </form>

      {!lifecycle || !pgcl ? <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600">No authorized project is available for this account.</section> : <>
        {!pgcl.schemaCompatibility.productionProvenanceColumnsAvailable && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-black">Production learning provenance schema pending</p>
          <p className="mt-1">The connected database does not expose the PGCL production-provenance columns yet. Positive cases remain visible but are treated as non-production or unclassified until migration <span className="font-mono">20260920016000_pgcl_production_learning_provenance</span> is reconciled.</p>
        </section>}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
          <article className="rounded-2xl border bg-white p-5"><BookOpenCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{lifecycle.counts.total}</p><p className="text-xs font-bold uppercase text-slate-500">Lifecycle candidates</p></article>
          <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{lifecycle.counts.active}</p><p className="text-xs font-bold uppercase text-slate-500">Active releases</p></article>
          <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{pgcl.counts.total}</p><p className="text-xs font-bold uppercase text-slate-500">Positive cases</p></article>
          <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{pgcl.counts.pendingReview + pgcl.counts.deferred}</p><p className="text-xs font-bold uppercase text-slate-500">Awaiting review</p></article>
          <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{pgcl.counts.approved}</p><p className="text-xs font-bold uppercase text-slate-500">Approved cases</p></article>
          <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{pgcl.counts.occurrenceEvents}</p><p className="text-xs font-bold uppercase text-slate-500">Verified occurrences</p></article>
          <article className="rounded-2xl border bg-white p-5"><Activity className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{pgcl.counts.usageEvents}</p><p className="text-xs font-bold uppercase text-slate-500">Reuse records</p></article>
          <article className="rounded-2xl border bg-white p-5"><ShieldCheck className="h-5 w-5"/><p className="mt-3 text-3xl font-black">{pgcl.counts.succeeded}</p><p className="text-xs font-bold uppercase text-slate-500">Successful reuse</p></article>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-black">Reuse execution surfaces</h2><p className="mt-1 text-sm text-slate-500">Where approved precedent was applied, separated from terminal governed-outcome verification.</p></div>
            <p className="text-xs text-slate-500">{pgcl.counts.authoritativeOutcomes} authoritative terminal outcomes</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <article className="rounded-xl border p-4"><p className="text-2xl font-black">{pgcl.counts.directSpecialistApplications}</p><p className="text-xs font-bold uppercase text-slate-500">Direct specialist</p></article>
            <article className="rounded-xl border p-4"><p className="text-2xl font-black">{pgcl.counts.supervisorApplications}</p><p className="text-xs font-bold uppercase text-slate-500">Handsfree specialist</p></article>
            <article className="rounded-xl border p-4"><p className="text-2xl font-black">{pgcl.counts.profilingApplications}</p><p className="text-xs font-bold uppercase text-slate-500">Profiling investigation</p></article>
            <article className="rounded-xl border p-4"><p className="text-2xl font-black">{pgcl.counts.dataQualityApplications}</p><p className="text-xs font-bold uppercase text-slate-500">Data Quality investigation</p></article>
            <article className="rounded-xl border p-4"><p className="text-2xl font-black">{pgcl.counts.authoritativeOutcomes}</p><p className="text-xs font-bold uppercase text-slate-500">Verified outcomes</p></article>
            <article className="rounded-xl border p-4"><p className="text-2xl font-black">{pgcl.counts.unknownApplicationSurfaces}</p><p className="text-xs font-bold uppercase text-slate-500">Legacy/unknown surface</p></article>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-black">Authority boundaries</h2>
          <p className="mt-1 text-sm text-slate-500">Learning evidence remains context and evaluation evidence. It does not create action authority.</p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>Self-promotion: {lifecycle.authority.selfPromotionAllowed ? 'enabled' : 'disabled'}</p>
            <p>Authority expansion: {lifecycle.authority.automaticAuthorityExpansionAllowed ? 'enabled' : 'disabled'}</p>
            <p>Mutation expansion: {lifecycle.authority.automaticMutationBoundaryChangeAllowed ? 'enabled' : 'disabled'}</p>
            <p>Human review: {lifecycle.authority.humanReviewRequired ? 'required' : 'not required'}</p>
            <p>Context authority: {pgcl.authority.contextOnly ? 'context only' : 'authoritative'}</p>
            <p>Action authorization: {pgcl.authority.mayAuthorizeAction ? 'allowed' : 'prohibited'}</p>
            <p>Positive-case review: {pgcl.authority.adminReviewRequired ? 'required before reuse' : 'not required'}</p>
            <p>Current policy: {pgcl.authority.currentPolicyReevaluationRequired ? 're-evaluated for every action' : 'not required'}</p>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-black">Learning portfolio by agent</h2><p className="mt-1 text-sm text-slate-500">The eight canonical agents share one governed positive-case learning contract.</p></div>
            <p className="text-xs text-slate-500">{pgcl.counts.agentsRepresented}/8 agents currently have recorded cases</p>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Agent</th><th className="p-3">Cases</th><th className="p-3">Approved</th><th className="p-3">Active context</th><th className="p-3">Reuse</th><th className="p-3">Applied</th><th className="p-3">Succeeded</th><th className="p-3">Failed</th><th className="p-3">Verified outcomes</th></tr></thead>
              <tbody>{pgcl.agentCoverage.map((agent) => <tr key={agent.agentKey} className="border-b last:border-0"><td className="p-3 font-bold">{agent.agentKey}</td><td className="p-3">{agent.candidateCount}</td><td className="p-3">{agent.approvedCount}</td><td className="p-3">{agent.promotedActiveCount}</td><td className="p-3">{agent.usageCount}</td><td className="p-3">{agent.appliedCount}</td><td className="p-3">{agent.succeededCount}</td><td className="p-3">{agent.failedCount}</td><td className="p-3">{agent.authoritativeOutcomeCount}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-xl font-black">Positive learning cases</h2><p className="mt-1 max-w-4xl text-sm text-slate-500">Review status, recurrence, promoted-context state and reuse telemetry only. Reusable lessons, raw evidence payloads and hidden reasoning are intentionally not rendered.</p></div>
            <p className="text-xs text-slate-500">{pgcl.counts.applied} applied · {pgcl.counts.succeeded} succeeded · {pgcl.counts.failed} failed · {pgcl.counts.dismissed} dismissed</p>
          </div>
          <div className="mt-5 overflow-x-auto">
            {pgcl.candidates.length ? <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Agent / skill</th><th className="p-3">Use case</th><th className="p-3">Review</th><th className="p-3">Occurrences</th><th className="p-3">Promoted context</th><th className="p-3">Reuse outcomes</th><th className="p-3">Last activity</th></tr></thead>
              <tbody>{pgcl.candidates.map((candidate) => <tr key={candidate.candidateId} className="border-b align-top last:border-0">
                <td className="p-3"><p className="font-bold">{candidate.agentKey}</p><p className="text-xs text-slate-400">{candidate.skillKey} · {candidate.runMode}</p><p className="mt-1"><Badge value={candidate.canonicalStatus}/></p></td>
                <td className="p-3"><p className="max-w-sm font-semibold">{candidate.title}</p><p className="mt-1 max-w-sm text-xs text-slate-500">{candidate.resultSummary}</p><p className="mt-1 font-mono text-[11px] text-slate-400">{candidate.useCaseKey}</p><p className="mt-1 text-[11px] text-slate-400">{candidate.significanceSignals.join(', ') || 'No significance signal recorded'}</p></td>
                <td className="p-3"><Badge value={candidate.reviewStatus}/><p className="mt-1 text-xs text-slate-400">{candidate.latestDecision ?? 'No Admin decision recorded'}</p></td>
                <td className="p-3"><p className="font-bold">{candidate.occurrenceCount}</p><p className="text-xs text-slate-400">same governed case pattern</p></td>
                <td className="p-3">{candidate.promotedLearningCaseId ? <><Badge value={candidate.promotedLearningCaseStatus ?? 'RECORDED'}/><p className="mt-1 font-mono text-[11px] text-slate-400">{candidate.promotedLearningCaseId}</p></> : <span className="text-slate-400">Not promoted</span>}</td>
                <td className="p-3"><p>{candidate.usageCount} total · {candidate.appliedCount} applied</p><p className="mt-1 text-xs text-slate-500">{candidate.succeededCount} succeeded · {candidate.failedCount} failed · {candidate.dismissedCount} dismissed</p><p className="mt-1 text-xs text-slate-400">Avg relevance: {candidate.averageRelevance == null ? 'not scored' : candidate.averageRelevance.toFixed(3)}</p><p className="mt-1 text-xs text-slate-400">Surfaces: {candidate.executionSurfaces.join(', ') || 'legacy/unknown'}</p><p className="mt-1 text-xs text-slate-400">Authoritative outcomes: {candidate.authoritativeOutcomeCount}</p></td>
                <td className="p-3 text-xs text-slate-500">{candidate.lastUsedAt ? new Date(candidate.lastUsedAt).toLocaleString() : new Date(candidate.updatedAt).toLocaleString()}</td>
              </tr>)}</tbody>
            </table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No PGCL positive cases are recorded for this project.</p>}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-black">Controlled learning lifecycle</h2><p className="mt-1 text-sm text-slate-500">Canonical proposal, benchmark, approval, canary, activation and rollback state with transition and canary evidence counts.</p></div><p className="text-xs text-slate-500">{lifecycle.counts.transitionEvents} transitions · {lifecycle.counts.canaryEvidenceEvents} canary evidence rows · {lifecycle.counts.rolledBack} rolled back</p></div>
          <div className="mt-5 overflow-x-auto">
            {lifecycle.candidates.length ? <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Agent / skill</th><th className="p-3">Candidate</th><th className="p-3">Lifecycle</th><th className="p-3">Transition evidence</th><th className="p-3">Benchmark</th><th className="p-3">Canary evidence</th><th className="p-3">Approval</th><th className="p-3">Release</th></tr></thead>
              <tbody>{lifecycle.candidates.map((candidate) => <tr key={candidate.id} className="border-b last:border-0"><td className="p-3"><p className="font-bold">{candidate.agentKey}</p><p className="text-xs text-slate-400">{candidate.skillKey}</p></td><td className="p-3"><p className="font-semibold">{candidate.title}</p><p className="text-xs text-slate-400">{candidate.baselineVersion} → {candidate.candidateVersion}</p></td><td className="p-3"><Badge value={candidate.status}/></td><td className="p-3"><p>{candidate.transitionCount} transitions</p><p className="mt-1 text-xs text-slate-400">{candidate.latestTransition ?? 'No transition recorded'}</p></td><td className="p-3">{candidate.benchmarkStatus ? <Badge value={candidate.benchmarkStatus}/> : <span className="text-slate-400">Not recorded</span>}</td><td className="p-3"><p>{candidate.canaryEvidenceCount} cases</p><p className="mt-1 text-xs text-slate-500">{candidate.canaryPassCount} pass · {candidate.canaryFailureCount} fail</p><p className="mt-1 text-xs text-slate-400">Avg: {candidate.canaryAverageScore == null ? 'n/a' : candidate.canaryAverageScore.toFixed(3)}</p></td><td className="p-3">{candidate.approvalRequestId ? <span className="font-mono text-xs">{candidate.approvalRequestId}</span> : <span className="text-slate-400">Not requested</span>}</td><td className="p-3">{candidate.releaseStatus ? <Badge value={candidate.releaseStatus}/> : <span className="text-slate-400">Not released</span>}</td></tr>)}</tbody>
            </table> : <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No durable governed learning lifecycle candidates are recorded for this project.</p>}
          </div>
        </section>
      </>}
    </div>
  </main>
}
