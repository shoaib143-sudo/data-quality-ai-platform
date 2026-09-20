import Link from 'next/link'
import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Database, Layers3, ShieldCheck, Users } from 'lucide-react'
import { authorizeProject } from '@/lib/auth/authorize'
import { loadDatasetGovernancePosture } from '@/lib/governance/dataset-governance-posture'
import { requireUser } from '@/lib/supabase/auth'
import { GoldenPathNavigator } from '@/components/golden-path-navigator'

type SearchParams = Promise<{
  projectId?: string
  datasetId?: string
  runId?: string
  findingId?: string
}>

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function label(value: unknown) {
  return text(value)?.replaceAll('_', ' ') ?? 'N/A'
}

export default async function DatasetGovernancePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const user = await requireUser()
  const requested = await searchParams
  const projectId = requested.projectId?.trim() ?? ''
  const datasetId = requested.datasetId?.trim() ?? ''
  const runId = requested.runId?.trim() || null
  const findingId = requested.findingId?.trim() || null

  if (!projectId || !datasetId) {
    return (
      <main className="min-h-screen bg-[#061426] px-4 py-8 text-slate-100">
        <div className="mx-auto max-w-5xl">
          <GoldenPathNavigator current="GOVERNANCE" theme="dark" />
          <section className="mt-5 rounded-3xl border border-white/10 bg-[#0a1d33] p-9 text-center">
            <ShieldCheck className="mx-auto h-9 w-9 text-cyan-300" />
            <h1 className="mt-4 text-2xl font-black">Choose a dataset first</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
              Governance posture is dataset-specific. Start from Datasets, Profiling, or Data Quality so DataNexus can preserve the governed asset context.
            </p>
            <Link href="/datasets" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white">
              Open datasets <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </main>
    )
  }

  await authorizeProject(user.id, projectId, 'catalog.read')
  const posture = await loadDatasetGovernancePosture(projectId, datasetId)
  const summary = posture.summary
  const dataset = posture.dataset
  const gaps = posture.gaps
  const openIssues = posture.issues.open

  return (
    <main className="min-h-screen bg-[#061426] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <GoldenPathNavigator
          current="GOVERNANCE"
          projectId={projectId}
          datasetId={datasetId}
          runId={runId}
          findingId={findingId}
          theme="dark"
        />

        <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Dataset governance</p>
                <h1 className="mt-1 text-3xl font-black text-white">{dataset.name}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                  Authoritative governance posture for this dataset. Proposed intelligence remains distinct from approved governance state.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] px-4 py-3 text-right">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Criticality</p>
              <p className="mt-1 text-lg font-black text-white">{label(summary.criticality)}</p>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Sensitivity" value={String(summary.highestSensitivity ?? 0)} icon={<ShieldCheck className="h-4 w-4" />} />
          <Metric label="Approved CDEs" value={String(summary.approvedCdeCount)} icon={<Database className="h-4 w-4" />} />
          <Metric label="Active stewards" value={String(summary.activeStewardshipCount)} icon={<Users className="h-4 w-4" />} />
          <Metric label="Authoritative controls" value={String(summary.authoritativeControlCount)} icon={<CheckCircle2 className="h-4 w-4" />} />
          <Metric label="Open issues" value={String(summary.openIssueCount)} icon={<AlertTriangle className="h-4 w-4" />} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <article className="rounded-3xl border border-white/10 bg-[#0a1d33] p-5">
            <div className="flex items-center gap-2">
              <Layers3 className="h-5 w-5 text-violet-300" />
              <h2 className="text-xl font-black text-white">Governance coverage</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Coverage title="Classifications" approved={posture.classification.authoritative.length} proposed={posture.classification.proposed.length} />
              <Coverage title="Critical data elements" approved={posture.criticalDataElements.approved.length} proposed={posture.criticalDataElements.proposed.length} />
              <Coverage title="Glossary mappings" approved={posture.glossary.approved.length} proposed={posture.glossary.proposed.length} />
              <Coverage title="Controls" approved={posture.controls.authoritative.length} proposed={posture.controls.proposed.length} />
              <Coverage title="Stewardship assignments" approved={posture.stewardship.active.length} proposed={0} />
              <Coverage title="Data contracts" approved={posture.contracts.length} proposed={0} />
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-[#0a1d33] p-5">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-cyan-300" />
              <h2 className="text-xl font-black text-white">Governance gaps</h2>
            </div>
            <div className="mt-4 space-y-2">
              {gaps.length ? gaps.map((gap) => (
                <div key={gap.code} className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-slate-200">{gap.code.replaceAll('_', ' ')}</p>
                    <span className={
                      'rounded-full px-2 py-1 text-[10px] font-black ' +
                      (gap.severity === 'HIGH'
                        ? 'bg-rose-400/10 text-rose-300'
                        : gap.severity === 'WARN'
                          ? 'bg-amber-400/10 text-amber-300'
                          : 'bg-slate-400/10 text-slate-300')
                    }>
                      {gap.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{gap.reason}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4 text-sm text-emerald-300">
                  No current governance coverage gaps were derived from the authoritative posture.
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0a1d33] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-amber-300">Governed action queue</p>
              <h2 className="mt-1 text-xl font-black text-white">Open issues</h2>
            </div>
            <Link href="/issues" className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-white/[0.05]">
              Open issue workspace <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {openIssues.length ? openIssues.slice(0, 8).map((issue) => (
              <div key={String(issue.id)} className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-slate-200">{text(issue.title) ?? 'Governance issue'}</p>
                  <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] font-black text-slate-400">{label(issue.status)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{label(issue.severity)}</p>
              </div>
            )) : (
              <p className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-5 text-sm text-slate-500 md:col-span-2">
                No open governance issues are recorded for this dataset.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1d33] p-4">
      <div className="text-cyan-300">{icon}</div>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
    </div>
  )
}

function Coverage({ title, approved, proposed }: { title: string; approved: number; proposed: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#08182b] p-4">
      <p className="text-sm font-bold text-slate-200">{title}</p>
      <div className="mt-2 flex gap-3 text-xs">
        <span className="text-emerald-300">{approved} approved</span>
        {proposed ? <span className="text-amber-300">{proposed} proposed</span> : null}
      </div>
    </div>
  )
}
