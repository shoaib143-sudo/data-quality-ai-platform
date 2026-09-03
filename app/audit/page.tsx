import Link from 'next/link'
import { ClipboardList, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function date(value:string){return new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})}
export default async function AuditPage(){
  await requireUser();const supabase=await createClient()
  const {data,error}=await supabase.schema('governance').from('audit_events').select('*').order('created_at',{ascending:false}).limit(500)
  if(error)throw new Error(`Unable to load audit events: ${error.message}`)
  const events=data??[]
  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><Link href="/lineage" className="text-sm font-semibold text-blue-600">Lineage</Link></nav>
    <header className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-700"><ClipboardList className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Governance Audit Trail</h1><p className="mt-1 text-sm text-slate-500">Immutable operational history for governed entity changes, automation and lifecycle actions.</p></div></div></header>
    <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Recent events</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{events.length} loaded</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="px-3 py-2">Time</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">Project</th><th className="px-3 py-2">Correlation</th></tr></thead><tbody>{events.map(e=><tr key={e.id} className="border-b border-slate-100"><td className="px-3 py-3 text-slate-500">{date(e.created_at)}</td><td className="px-3 py-3 font-semibold">{e.event_type}</td><td className="px-3 py-3">{e.actor_type}{e.actor_user_id?<span className="block font-mono text-[11px] text-slate-400">{e.actor_user_id.slice(0,8)}</span>:null}</td><td className="px-3 py-3"><span className="font-semibold">{e.entity_type??'N/A'}</span>{e.entity_id?<span className="block font-mono text-[11px] text-slate-400">{e.entity_id}</span>:null}</td><td className="px-3 py-3 font-mono text-xs text-slate-500">{e.project_id?.slice(0,8)??'GLOBAL'}</td><td className="px-3 py-3 font-mono text-xs text-slate-400">{e.correlation_id?.slice(0,8)??'—'}</td></tr>)}</tbody></table></div></section>
  </div></main>
}
