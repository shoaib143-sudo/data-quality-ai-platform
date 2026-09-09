import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Gauge, Search, Settings, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import type { PersonaDefinition } from '@/lib/governance/personas'

export type RoleLandingData = {
  confidence: number | null
  governedAssets: number
  activeSources: number
  materialFindings: number
  highFindings: number
  failedControls: number
  openAlerts: number
  coverage: number
  affectedDomains: number
  topFindings: { id: string; title: string; description: string; severity: string }[]
  domains: { name: string; assets: number }[]
}

function pct(value: number | null) {
  return value === null ? 'N/A' : `${Math.round(value * 100)}%`
}

function status(confidence: number | null) {
  if (confidence === null) return { label: 'Building evidence', tone: 'text-slate-500', badge: 'bg-slate-100 text-slate-600' }
  if (confidence >= .9) return { label: 'Trusted', tone: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700' }
  if (confidence >= .75) return { label: 'Monitor', tone: 'text-blue-700', badge: 'bg-blue-50 text-blue-700' }
  if (confidence >= .6) return { label: 'Attention required', tone: 'text-amber-700', badge: 'bg-amber-50 text-amber-700' }
  return { label: 'Critical attention', tone: 'text-red-700', badge: 'bg-red-50 text-red-700' }
}

const surface = 'rounded-[28px] bg-[#eef3f8] shadow-[10px_10px_24px_rgba(163,177,198,0.34),-10px_-10px_24px_rgba(255,255,255,0.92)]'
const inset = 'rounded-2xl bg-[#eef3f8] shadow-[inset_4px_4px_10px_rgba(163,177,198,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.88)]'

export function RoleLandingPage({ persona, data, userLabel, canAdmin = false }: { persona: PersonaDefinition; data: RoleLandingData; userLabel: string; canAdmin?: boolean }) {
  const current = status(data.confidence)
  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <div className="mx-auto grid max-w-[1600px] gap-7 px-4 py-5 lg:grid-cols-[230px_1fr] lg:px-7">
        <aside className={`${surface} hidden min-h-[calc(100vh-40px)] p-5 lg:flex lg:flex-col`}>
          <Link href={`/home/${persona.slug}`} className="flex items-center gap-3 px-2 py-2">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-[4px_4px_10px_rgba(37,99,235,0.25)]"><ShieldCheck className="h-5 w-5" /></span>
            <span><span className="block text-lg font-black tracking-tight">DataNexus</span><span className="block text-[11px] text-slate-500">Trusted Data. Better Decisions.</span></span>
          </Link>
          <nav className="mt-8 space-y-2">
            {persona.nav.map((item, index) => <Link key={item.href} href={item.href} className={`block rounded-2xl px-4 py-3 text-sm font-semibold transition ${index === 0 ? 'bg-blue-50 text-blue-700 shadow-[inset_3px_3px_7px_rgba(147,197,253,0.18),inset_-3px_-3px_7px_rgba(255,255,255,0.9)]' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}>{item.label}</Link>)}
          </nav>
          {canAdmin ? <div className="mt-5 border-t border-slate-300/70 pt-4"><Link href="/admin" className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white/60 hover:text-slate-900"><Settings className="h-4 w-4"/>Administration</Link></div> : null}
          <div className={`${inset} mt-auto p-4`}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Your perspective</p>
            <p className="mt-2 text-sm font-bold">{persona.title}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{persona.focus}</p>
          </div>
        </aside>

        <section className="min-w-0 py-1">
          <header className="flex flex-wrap items-center justify-between gap-4 px-1">
            <div>
              <p className="text-sm font-semibold text-blue-600">{persona.title}</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Good day, {userLabel}</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">{persona.primaryQuestion}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">{canAdmin ? <Link href="/admin" className={`${inset} inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-600 lg:hidden`}><Settings className="h-4 w-4"/>Administration</Link> : null}<div className={`${inset} flex min-w-[260px] items-center gap-3 px-4 py-3 text-slate-500`}><Search className="h-4 w-4"/><span className="text-sm">Search DataNexus...</span></div></div>
          </header>

          <section className={`${surface} relative mt-7 overflow-hidden p-7 sm:p-8`}>
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-200/45 blur-3xl" />
            <div className="relative grid gap-7 xl:grid-cols-[270px_1fr] xl:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{persona.labels.confidence}</p>
                <div className="mt-2 flex items-end gap-3"><span className={`text-6xl font-black tracking-tight ${current.tone}`}>{pct(data.confidence)}</span><span className={`mb-2 rounded-full px-3 py-1 text-xs font-bold ${current.badge}`}>{current.label}</span></div>
              </div>
              <div className="max-w-3xl border-l border-slate-300/70 pl-7">
                <p className="text-xl font-bold leading-8 text-slate-800">{persona.strapline}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">This view is generated from current DataNexus governance evidence, including profiling scores, findings, quality controls, source readiness and observability signals.</p>
              </div>
            </div>
          </section>

          <section className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={<Gauge className="h-5 w-5" />} label={persona.labels.exposure} value={String(data.highFindings)} note={`${data.materialFindings} material findings`} />
            <Kpi icon={<Database className="h-5 w-5" />} label="Governed assets" value={String(data.governedAssets)} note={`${data.activeSources} active sources`} />
            <Kpi icon={<AlertTriangle className="h-5 w-5" />} label={persona.labels.attention} value={String(data.failedControls + data.openAlerts)} note={`${data.failedControls} failed controls · ${data.openAlerts} alerts`} />
            <Kpi icon={<CheckCircle2 className="h-5 w-5" />} label={persona.labels.progress} value={`${data.coverage}%`} note="Profiling evidence coverage" />
          </section>

          <section className="mt-7 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <div className={`${surface} p-6`}>
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{persona.labels.changes}</p><h2 className="mt-1 text-xl font-black">What needs attention</h2></div><Link href="/issues" className="text-sm font-bold text-blue-600">View all</Link></div>
              <div className="mt-5 space-y-3">
                {data.topFindings.length ? data.topFindings.map(finding => <Link key={finding.id} href="/issues" className={`${inset} flex items-start gap-4 p-4 transition hover:translate-y-[-1px]`}><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${['CRITICAL','HIGH'].includes(finding.severity.toUpperCase()) ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block font-bold">{finding.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{finding.description}</span></span><ArrowRight className="mt-2 h-4 w-4 text-slate-400"/></Link>) : <div className={`${inset} p-5 text-sm text-slate-500`}>No material findings are currently available.</div>}
              </div>
            </div>

            <div className={`${surface} p-6`}>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Business context</p>
              <h2 className="mt-1 text-xl font-black">Coverage by business area</h2>
              <div className="mt-5 space-y-4">
                {data.domains.slice(0,6).map(domain => <div key={domain.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">{domain.name}</span><span className="font-black text-slate-900">{domain.assets}</span></div><div className={`${inset} mt-2 h-2 overflow-hidden`}><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(12, Math.min(100, data.governedAssets ? (domain.assets / data.governedAssets) * 100 : 0))}%` }} /></div></div>)}
                {!data.domains.length && <p className="text-sm text-slate-500">Business domains will appear as governed assets are classified.</p>}
              </div>
            </div>
          </section>

          <section className={`${surface} mt-7 flex flex-wrap items-center justify-between gap-5 p-6`}>
            <div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Sparkles className="h-5 w-5"/></span><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{persona.labels.action}</p><p className="mt-1 font-bold">Focus on the highest-impact governance signal first.</p><p className="mt-1 text-sm text-slate-500">{data.highFindings ? `${data.highFindings} high-priority findings currently require attention.` : 'No high-priority finding is currently surfaced from the available evidence.'}</p></div></div>
            <Link href={persona.nav[1]?.href ?? '/dashboard'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-[5px_5px_12px_rgba(37,99,235,0.24)] hover:bg-blue-700">Open workspace <ArrowRight className="h-4 w-4"/></Link>
          </section>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 px-2 pb-4 text-xs text-slate-400"><span>DataNexus · Same governance evidence, role-specific perspective.</span><span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5"/> Minimalist role experience</span></div>
        </section>
      </div>
    </main>
  )
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className={`${surface} p-5`}><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600 shadow-[inset_2px_2px_6px_rgba(147,197,253,0.16)]">{icon}</span><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Live</span></div><p className="mt-5 text-3xl font-black tracking-tight">{value}</p><p className="mt-1 text-sm font-bold text-slate-700">{label}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>
}
