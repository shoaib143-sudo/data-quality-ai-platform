import Link from 'next/link'
import { Database, GitBranch, Plug } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { GlobalUtilityBar } from '@/components/app-shell/global-utility-bar'
import { connectorCapabilities } from '@/lib/connectors/connector-capabilities'

const tone:Record<string,string>={
  LIVE_NATIVE:'bg-emerald-400/10 text-emerald-300',
  LIVE_BRIDGE:'bg-cyan-400/10 text-cyan-300',
  INGEST_ADAPTER:'bg-violet-400/10 text-violet-300',
  DRY_RUN_ADAPTER:'bg-amber-400/10 text-amber-300',
  PLANNED_EXTERNAL:'bg-slate-400/10 text-slate-400',
}
export default async function ConnectorRegistryPage(){
  const user=await requireUser()
  const landing=await resolveLandingAccess(user.id)
  return <main id="main-content" tabIndex={-1} className="dn-light-workspace min-h-screen bg-[#0b1422] px-4 py-6 text-slate-100 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><GlobalUtilityBar persona={landing.persona} organizationRole={landing.organizationRole} roleLabel="Connector Registry" contextLabel="Current source, ETL, BI and code integration capability" homeHref="/home"/><nav className="mb-6 mt-4 flex justify-end rounded-2xl border border-white/10 bg-[#102036] p-3"><Link href="/catalog" className="rounded-xl px-3 py-2 text-sm font-bold text-blue-300 hover:bg-white/[0.05]">Back to Catalog</Link></nav><header className="rounded-3xl border border-white/10 bg-[#102036] p-7"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300"><Plug className="h-6 w-6"/></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-300">Integration transparency</p><h1 className="mt-1 text-3xl font-black">Connector capability registry</h1></div></div><p className="mt-3 max-w-4xl text-sm leading-6 text-slate-500">Shows what DataNexus can execute today, what requires the governed JDBC bridge, and which integrations currently accept exports or dry-run payloads rather than claiming a live vendor API connection.</p></header><div className="mt-5 grid gap-3 lg:grid-cols-2">{connectorCapabilities.map(item=><article key={item.key} className="rounded-2xl border border-white/[0.07] bg-[#102036] p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-cyan-300">{item.family==='DATABASE'?<Database className="h-5 w-5"/>:<GitBranch className="h-5 w-5"/>}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-white">{item.label}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${tone[item.readiness]}`}>{item.readiness.replaceAll('_',' ')}</span></div><p className="mt-2 text-xs font-bold text-slate-500">Captures</p><p className="mt-1 text-xs leading-5 text-slate-300">{item.capture.join(' · ')}</p><p className="mt-2 text-xs font-bold text-slate-500">Requirements</p><p className="mt-1 text-xs leading-5 text-slate-400">{item.requirements.join(' · ')}</p><Link href={item.route} className="mt-3 inline-flex text-xs font-bold text-blue-300">Open workspace →</Link></div></div></article>)}</div></div></main>
}
