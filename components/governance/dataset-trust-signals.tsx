import { AlertTriangle, BadgeCheck, Clock3, Gauge, UserRoundCheck } from 'lucide-react'

type Props = {
  certification: string
  quality: number | null | undefined
  observedAt?: string | null
  hasAccountability: boolean
  openIssues: number
}

function pct(value:number|null|undefined){return typeof value==='number'&&Number.isFinite(value)?`${Math.round(value*100)}%`:'N/A'}
function freshness(value?:string|null){
  if(!value)return 'Unknown'
  const ms=Date.now()-new Date(value).getTime()
  if(!Number.isFinite(ms)||ms<0)return 'Current'
  const hours=Math.floor(ms/3_600_000)
  if(hours<1)return '<1h'
  if(hours<24)return `${hours}h`
  return `${Math.floor(hours/24)}d`
}

export function DatasetTrustSignals({certification,quality,observedAt,hasAccountability,openIssues}:Props){
  const signals=[
    {label:'Certification',value:certification||'UNCERTIFIED',icon:BadgeCheck},
    {label:'Quality',value:pct(quality),icon:Gauge},
    {label:'Evidence age',value:freshness(observedAt),icon:Clock3},
    {label:'Accountability',value:hasAccountability?'Assigned':'Missing',icon:UserRoundCheck},
    {label:'Open issues',value:String(openIssues),icon:AlertTriangle},
  ]
  return <section className="mt-5 rounded-2xl border border-white/10 bg-[#08182b] p-4" aria-label="Dataset trust signals">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-300">Trust at a glance</p><p className="mt-1 text-xs text-slate-500">Persisted governance and profiling evidence only.</p></div><span className="text-[11px] font-semibold text-slate-500">No AI-generated trust state</span></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{signals.map(({label,value,icon:Icon})=><div key={label} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3"><Icon className="h-4 w-4 text-cyan-300" aria-hidden="true"/><p className="mt-2 text-base font-black text-white">{value}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p></div>)}</div>
  </section>
}
