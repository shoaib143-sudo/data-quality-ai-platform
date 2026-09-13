import Link from 'next/link'
import { CalendarClock, Layers3 } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { resolvePreferredGovernanceProject } from '@/lib/governance/preferred-project'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ScheduleManager } from './schedule-manager'

export default async function SchedulesPage(){
  const user=await requireUser()
  const [supabase,preferredProjectId]=await Promise.all([createClient(),resolvePreferredGovernanceProject(user.id)])
  const projectsResult=await supabase.schema('app').from('projects').select('id,name').order('name')
  if(projectsResult.error) throw new Error(projectsResult.error.message)

  const capabilityRows=await Promise.all((projectsResult.data??[]).map(async project=>[project.id,await hasProjectCapability(user.id,project.id,'schedule.manage')] as const))
  const allowedProjectIds=new Set(capabilityRows.filter(([,allowed])=>allowed).map(([projectId])=>projectId))
  const allowedProjects=(projectsResult.data??[]).filter(project=>allowedProjectIds.has(project.id))
  const projects=preferredProjectId&&allowedProjectIds.has(preferredProjectId)
    ? [...allowedProjects].sort((a,b)=>a.id===preferredProjectId?-1:b.id===preferredProjectId?1:a.name.localeCompare(b.name))
    : allowedProjects
  const projectIds=projects.map(project=>project.id)
  const initialProjectId=projects[0]?.id??''

  const [datasetsResult,versionsResult,schedulesResult]=projectIds.length?await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name').in('project_id',projectIds).order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').order('version_number',{ascending:false}),
    initialProjectId?supabase.schema('orchestration').from('job_schedules').select('*').eq('project_id',initialProjectId).order('next_run_at'):Promise.resolve({data:[],error:null}),
  ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}]
  for(const result of [datasetsResult,versionsResult,schedulesResult]) if(result.error) throw new Error(result.error.message)

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm">
        <Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link>
        <div className="flex gap-2 text-sm"><Link href="/monitoring" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Job Monitor</Link><Link href="/data-quality" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Data Quality</Link></div>
      </nav>
      <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CalendarClock className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Scheduled profiling & data quality</h1><p className="mt-1 text-sm text-slate-500">Recurring governed executions with retry policy, misfire handling and durable queue delivery.</p></div></div></header>
      {projects.length?<ScheduleManager
        projects={projects}
        datasets={datasetsResult.data??[]}
        versions={versionsResult.data??[]}
        initialSchedules={schedulesResult.data??[]}
      />:<section className="mt-6 rounded-3xl border border-dashed bg-white p-8 text-sm text-slate-500 shadow-sm">No project with schedule management permission is available.</section>}
    </div>
  </main>
}
