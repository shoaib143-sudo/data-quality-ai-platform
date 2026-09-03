import Link from 'next/link'
import { CalendarClock, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ScheduleManager } from './schedule-manager'

export default async function SchedulesPage(){
  await requireUser()
  const supabase=await createClient()
  const [projectsResult,datasetsResult,versionsResult,schedulesResult]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').order('version_number',{ascending:false}),
    supabase.schema('orchestration').from('job_schedules').select('*').order('next_run_at'),
  ])
  for(const result of [projectsResult,datasetsResult,versionsResult,schedulesResult]) if(result.error) throw new Error(result.error.message)
  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm">
        <Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link>
        <div className="flex gap-2 text-sm"><Link href="/monitoring" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Job Monitor</Link><Link href="/data-quality" className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-100">Data Quality</Link></div>
      </nav>
      <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><CalendarClock className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Scheduled profiling & data quality</h1><p className="mt-1 text-sm text-slate-500">Recurring governed executions with retry policy, misfire handling and durable queue delivery.</p></div></div></header>
      <ScheduleManager
        projects={projectsResult.data??[]}
        datasets={datasetsResult.data??[]}
        versions={versionsResult.data??[]}
        initialSchedules={schedulesResult.data??[]}
      />
    </div>
  </main>
}
