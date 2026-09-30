import { AlertTriangle, CheckCircle2, CircleHelp, ShieldCheck } from 'lucide-react'
import type { ReadinessCapability } from '@/lib/governance/unified-readiness-framework'
import type { CapabilityReadiness } from '@/lib/governance/unified-readiness-engine'

export function UnifiedReadinessSummary({ capabilities, results, questionCount }: { capabilities: readonly ReadinessCapability[]; results: readonly CapabilityReadiness[]; questionCount: number }) {
  const byId=new Map(capabilities.map(x=>[x.id,x]))
  const cleared=results.filter(x=>x.gate==='CLEARED').length
  const blocked=results.filter(x=>x.gate==='NOT_CLEARED').length
  const unresolved=results.filter(x=>x.gate==='UNKNOWN'||x.gate==='CONDITIONAL').length
  return <section aria-labelledby="unified-readiness-heading" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">DN-URA-1.0</p><h2 id="unified-readiness-heading" className="mt-2 text-2xl font-black">Unified readiness intelligence</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">DataNexus uses connected evidence first and asks only for unresolved human context. Readiness does not grant execution authority.</p></div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">{questionCount} unresolved questions</div>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Cleared capabilities" value={cleared} />
      <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Critical failures" value={blocked} />
      <Metric icon={<CircleHelp className="h-5 w-5" />} label="Conditional / unknown" value={unresolved} />
    </div>
    <div className="mt-6 space-y-2">
      {results.filter(x=>x.gate==='NOT_CLEARED').slice(0,5).map(result=><div key={result.capabilityId} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-black">{byId.get(result.capabilityId)?.label ?? result.capabilityId}</p><p className="mt-1 text-sm text-slate-700">Gate not cleared. Score {result.score ?? 'unknown'} / 5 with confidence {Math.round(result.confidence*100)}%.</p></div></div>)}
    </div>
  </section>
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-slate-600">{icon}<span className="text-xs font-black uppercase tracking-wide">{label}</span></div><p className="mt-2 text-3xl font-black">{value}</p></div>}
