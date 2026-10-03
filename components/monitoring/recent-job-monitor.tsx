'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, CircleCheck, CircleX, Clock3, RefreshCw } from 'lucide-react'

type Run = {
  id: string
  agent_definition_id: string
  project_id: string
  dataset_id: string | null
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
}
type Step = { agent_run_id: string; status: string }
type DurableJob = { id:string; project_id:string; job_type:string; entity_id:string|null; agent_run_id:string|null; status:string; attempts:number; max_attempts:number; last_error:string|null; created_at:string; started_at:string|null; completed_at:string|null }
type Dataset = { id: string; name: string }
type Project = { id: string; name: string }

const done = new Set(['SUCCEEDED', 'COMPLETED'])
const failed = new Set(['FAILED', 'DEAD', 'CANCELLED'])

function tone(status: string) {
  const value = status.toUpperCase()
  if (done.has(value)) return 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20'
  if (failed.has(value)) return 'bg-rose-400/10 text-rose-300 ring-rose-400/20'
  return 'bg-cyan-400/10 text-cyan-200 ring-cyan-400/20'
}

function RunIcon({ status }: { status: string }) {
  const value = status.toUpperCase()
  if (done.has(value)) return <CircleCheck className="h-4 w-4" />
  if (failed.has(value)) return <CircleX className="h-4 w-4" />
  return <Clock3 className="h-4 w-4" />
}

export function RecentJobMonitor({ title='Recent job progress', limit=8 }: { title?: string; limit?: number }) {
  const [runs, setRuns] = useState<Run[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [jobs, setJobs] = useState<DurableJob[]>([])
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/monitoring/runs', { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json() as { runs?: Run[]; jobs?: DurableJob[]; steps?: Step[]; datasets?: Dataset[]; projects?: Project[] }
      setRuns((payload.runs ?? []).slice(0, limit))
      setJobs((payload.jobs ?? []).slice(0, limit))
      setSteps(payload.steps ?? [])
      setDatasets(payload.datasets ?? [])
      setProjects(payload.projects ?? [])
      setUpdatedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const datasetById = useMemo(() => new Map(datasets.map(item => [item.id, item])), [datasets])
  const projectById = useMemo(() => new Map(projects.map(item => [item.id, item])), [projects])
  const stepsByRun = useMemo(() => {
    const map = new Map<string, Step[]>()
    for (const step of steps) map.set(step.agent_run_id, [...(map.get(step.agent_run_id) ?? []), step])
    return map
  }, [steps])
  const visibleJobs = useMemo(() => jobs.filter(job => !job.agent_run_id || !runs.some(run => run.id === job.agent_run_id)).slice(0,limit), [jobs,runs,limit])

  return <section className="mt-5 rounded-[22px] border border-white/10 bg-[#102036] p-5 shadow-[10px_10px_28px_rgba(0,0,0,.24),-7px_-7px_22px_rgba(30,74,114,.08)]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan-300">Live execution tracking</p><h2 className="mt-1 text-xl font-black text-white">{title}</h2><p className="mt-1 text-sm text-slate-500">Ad hoc profiling, data quality, discovery and governed agent runs update every 5 seconds.</p></div>
      <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading'}</span><button type="button" onClick={() => void refresh()} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/[0.05]" aria-label="Refresh recent jobs"><RefreshCw className="h-4 w-4" /></button><Link href="/monitoring" className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-200 ring-1 ring-cyan-400/20 hover:bg-cyan-500/15">Open Job Monitor <ArrowRight className="h-4 w-4" /></Link></div>
    </div>
    <div className="mt-4 grid gap-2">
      {loading ? <div className="rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4 text-sm text-slate-500">Loading recent jobs…</div> : null}
      {!loading && runs.length === 0 && visibleJobs.length === 0 ? <div className="rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4 text-sm text-slate-500">No governed execution jobs are visible for your current access scope.</div> : null}
      {visibleJobs.map(job => {
        const project = projectById.get(job.project_id)?.name ?? `Scope ${job.project_id.slice(0,8)}`
        const complete = done.has(job.status.toUpperCase())
        const failedState = failed.has(job.status.toUpperCase())
        const progress = complete ? 100 : failedState ? Math.min(95,Math.max(10,Math.round((job.attempts/Math.max(1,job.max_attempts))*100))) : job.started_at ? 55 : 15
        return <Link key={`job:${job.id}`} href="/monitoring" className="group rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4 hover:border-cyan-400/25 hover:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black ring-1 ${tone(job.status)}`}><RunIcon status={job.status}/>{job.status}</span><span className="rounded-lg bg-violet-400/10 px-2 py-1 text-[10px] font-black text-violet-300">{job.job_type}</span><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">{project}</span><span className="text-xs text-slate-500">{progress}%</span><ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-300"/></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{width:`${progress}%`}}/></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>Durable job {job.id.slice(0,8)}</span><span>Attempt {job.attempts}/{job.max_attempts}</span>{job.last_error?<span className="max-w-full truncate text-rose-300">{job.last_error}</span>:null}</div>
        </Link>
      })}
      {runs.map(run => {
        const runSteps = stepsByRun.get(run.id) ?? []
        const completed = runSteps.filter(step => done.has(step.status.toUpperCase())).length
        const progress = runSteps.length ? Math.round((completed / runSteps.length) * 100) : (done.has(run.status.toUpperCase()) ? 100 : 0)
        const dataset = run.dataset_id ? datasetById.get(run.dataset_id)?.name : null
        const project = projectById.get(run.project_id)?.name ?? `Scope ${run.project_id.slice(0, 8)}`
        return <Link key={run.id} href={`/monitoring?run=${encodeURIComponent(run.id)}`} className="group rounded-2xl border border-white/[0.07] bg-[#0d1c30] p-4 hover:border-cyan-400/25 hover:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black ring-1 ${tone(run.status)}`}><RunIcon status={run.status} />{run.status}</span><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">{dataset ?? project}</span><span className="text-xs text-slate-500">{progress}%</span><ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-cyan-300" /></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-400 transition-[width]" style={{ width: `${progress}%` }} /></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>{project}</span><span>{runSteps.length ? `${completed}/${runSteps.length} steps complete` : 'Step evidence pending'}</span>{run.error_code ? <span className="text-rose-300">{run.error_code}</span> : null}</div>
        </Link>
      })}
    </div>
  </section>
}
