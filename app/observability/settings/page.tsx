import Link from 'next/link'
import { Gauge, Layers3 } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { ObservabilitySettings } from './observability-settings'

export default async function ObservabilitySettingsPage(){
  const user=await requireUser()
  const supabase=await createClient()
  const [projects,datasets,policies,channels,routes,deliveries]=await Promise.all([
    supabase.schema('app').from('projects').select('id,name').order('name'),
    supabase.schema('catalog').from('datasets').select('id,project_id,name').order('name'),
    supabase.schema('profiling').from('observability_policies').select('*'),
    supabase.schema('profiling').from('notification_channels').select('id,project_id,name,channel_type,target,enabled,suppression_minutes,created_at').order('created_at',{ascending:false}),
    supabase.schema('profiling').from('notification_routes').select('*').order('created_at',{ascending:false}),
    supabase.schema('profiling').from('notification_deliveries').select('id,alert_id,channel_id,status,response_code,error_message,delivered_at,created_at').order('created_at',{ascending:false}).limit(100),
  ])
  for(const r of [projects,datasets,policies,channels,routes,deliveries])if(r.error)throw new Error(r.error.message)
  const capabilityRows=await Promise.all((projects.data??[]).map(async project=>{
    const projectId=String(project.id)
    const [policy,notification]=await Promise.all([
      hasProjectCapability(user.id,projectId,'observability.manage'),
      hasProjectCapability(user.id,projectId,'notification.manage'),
    ])
    return [projectId,{policy,notification}] as const
  }))
  const policyProjectIds=capabilityRows.filter(([,caps])=>caps.policy).map(([id])=>id)
  const notificationProjectIds=capabilityRows.filter(([,caps])=>caps.notification).map(([id])=>id)
  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><nav className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3 shadow-sm"><Link href="/home" className="flex items-center gap-3 font-bold text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><Layers3 className="h-5 w-5"/></span>DataNexus AI</Link><Link href="/observability" className="text-sm font-semibold text-blue-300 hover:text-cyan-300">Observability</Link></nav><header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-400/10 text-blue-300"><Gauge className="h-6 w-6"/></span><div><h1 className="text-3xl font-black text-white">Observability Policies & Notifications</h1><p className="mt-1 text-sm text-slate-400">Configure dataset policy thresholds and notification routing only for projects where your live capabilities allow those actions.</p></div></div></header><ObservabilitySettings projects={projects.data??[]} datasets={datasets.data??[]} initialPolicies={policies.data??[]} initialChannels={channels.data??[]} initialRoutes={routes.data??[]} initialDeliveries={deliveries.data??[]} policyProjectIds={policyProjectIds} notificationProjectIds={notificationProjectIds}/></div></main>
}