import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Gauge, Search, Settings, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import type { PersonaDefinition, PersonaSlug } from '@/lib/governance/personas'

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

type MetricCard = { label: string; value: string; note: string; icon: 'gauge' | 'database' | 'alert' | 'check' }
type PersonaView = { attentionTitle: string; contextTitle: string; actionTitle: string; actionDetail: string; actionHref: string; metrics: MetricCard[] }

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

function personaView(slug: PersonaSlug, data: RoleLandingData): PersonaView {
  const risk = `${data.highFindings}`
  const attention = `${data.failedControls + data.openAlerts}`
  const coverage = `${data.coverage}%`
  const common = {
    'senior-leadership': {
      attentionTitle: 'Material exposure requiring leadership attention', contextTitle: 'Enterprise coverage by business area', actionTitle: 'Review the highest material exposure first', actionDetail: data.highFindings ? `${data.highFindings} high-priority findings currently contribute to enterprise exposure.` : 'No high-priority finding is currently surfaced from the available evidence.', actionHref: '/reports',
      metrics: [
        { label: 'Material risks', value: risk, note: `${data.materialFindings} material findings`, icon: 'gauge' },
        { label: 'Business areas affected', value: String(data.affectedDomains), note: `${data.governedAssets} governed assets`, icon: 'database' },
        { label: 'Control and alert pressure', value: attention, note: `${data.failedControls} failed controls · ${data.openAlerts} alerts`, icon: 'alert' },
        { label: 'Evidence coverage', value: coverage, note: 'Latest completed profiling coverage', icon: 'check' },
      ],
    },
    'business-user': {
      attentionTitle: 'Data concerns that may affect use', contextTitle: 'Available data by business area', actionTitle: 'Start with trusted data for your business need', actionDetail: data.highFindings ? `${data.highFindings} high-priority concerns should be reviewed before relying on affected data.` : 'No high-priority concern is currently surfaced from the available evidence.', actionHref: '/catalog',
      metrics: [
        { label: 'Trusted data coverage', value: coverage, note: 'Assets with current completed profiling evidence', icon: 'check' },
        { label: 'Available governed assets', value: String(data.governedAssets), note: `${data.activeSources} active sources`, icon: 'database' },
        { label: 'Use with caution', value: risk, note: `${data.materialFindings} material findings`, icon: 'alert' },
        { label: 'Current data confidence', value: pct(data.confidence), note: 'Based on latest scored profiling evidence', icon: 'gauge' },
      ],
    },
    'data-owner': {
      attentionTitle: 'Owner decisions and material data risk', contextTitle: 'Owned estate view by business area', actionTitle: 'Prioritize the highest-risk owner decision', actionDetail: data.highFindings ? `${data.highFindings} high-priority findings require accountable review.` : 'No high-priority owner decision is currently surfaced from the available evidence.', actionHref: '/stewardship',
      metrics: [
        { label: 'Critical exposure', value: risk, note: `${data.materialFindings} material findings`, icon: 'gauge' },
        { label: 'Governed estate', value: String(data.governedAssets), note: `${data.affectedDomains} represented business areas`, icon: 'database' },
        { label: 'Owner attention', value: attention, note: 'Failed controls and unresolved alerts', icon: 'alert' },
        { label: 'Remediation evidence coverage', value: coverage, note: 'Current profiling coverage', icon: 'check' },
      ],
    },
    'data-steward': {
      attentionTitle: 'Stewardship work requiring investigation', contextTitle: 'Stewardship coverage by business area', actionTitle: 'Investigate the highest-priority data issue', actionDetail: data.highFindings ? `${data.highFindings} high-priority findings are available for stewardship triage.` : 'No high-priority finding is currently surfaced from the available evidence.', actionHref: '/issues',
      metrics: [
        { label: 'Open investigation pressure', value: String(data.materialFindings), note: `${data.highFindings} high-priority findings`, icon: 'alert' },
        { label: 'Stewardship estate', value: String(data.governedAssets), note: `${data.activeSources} active sources`, icon: 'database' },
        { label: 'Control failures and alerts', value: attention, note: 'Operational signals requiring triage', icon: 'gauge' },
        { label: 'Evidence coverage', value: coverage, note: 'Latest profiling coverage', icon: 'check' },
      ],
    },
    'data-governance-admin': {
      attentionTitle: 'Platform and workflow signals requiring action', contextTitle: 'Governed estate operating footprint', actionTitle: 'Resolve the highest-impact platform signal', actionDetail: data.openAlerts || data.failedControls ? `${data.failedControls} failed controls and ${data.openAlerts} unresolved alerts are currently visible.` : 'No failed control or unresolved alert is currently surfaced from the available evidence.', actionHref: '/monitoring',
      metrics: [
        { label: 'Operational alerts', value: String(data.openAlerts), note: 'Unresolved observability alerts', icon: 'alert' },
        { label: 'Active source footprint', value: String(data.activeSources), note: `${data.governedAssets} governed assets`, icon: 'database' },
        { label: 'Failed controls', value: String(data.failedControls), note: 'Failed or unsuccessful quality control runs', icon: 'gauge' },
        { label: 'Platform evidence coverage', value: coverage, note: 'Current profiling coverage', icon: 'check' },
      ],
    },
    'data-governance-specialist': {
      attentionTitle: 'Governance gaps requiring intervention', contextTitle: 'Governance adoption by business area', actionTitle: 'Target the largest governance gap', actionDetail: data.materialFindings ? `${data.materialFindings} material findings indicate where governance attention is most needed.` : 'No material governance finding is currently surfaced from the available evidence.', actionHref: '/reports',
      metrics: [
        { label: 'Governance gaps', value: String(data.materialFindings), note: `${data.highFindings} high-priority`, icon: 'alert' },
        { label: 'Governed assets', value: String(data.governedAssets), note: `${data.affectedDomains} represented business areas`, icon: 'database' },
        { label: 'Control effectiveness pressure', value: attention, note: 'Failed controls and unresolved alerts', icon: 'gauge' },
        { label: 'Adoption evidence coverage', value: coverage, note: 'Current profiling coverage', icon: 'check' },
      ],
    },
    'compliance-risk-officer': {
      attentionTitle: 'Regulatory and control exposure', contextTitle: 'Exposure footprint by business area', actionTitle: 'Review the most material control exposure', actionDetail: data.highFindings ? `${data.highFindings} high-priority findings are available for risk review.` : 'No high-priority control exposure is currently surfaced from the available evidence.', actionHref: '/audit',
      metrics: [
        { label: 'Regulatory exposure signals', value: risk, note: `${data.materialFindings} material findings`, icon: 'gauge' },
        { label: 'Failed controls', value: String(data.failedControls), note: 'Current failed quality control runs', icon: 'alert' },
        { label: 'Affected business areas', value: String(data.affectedDomains), note: `${data.governedAssets} governed assets`, icon: 'database' },
        { label: 'Audit evidence coverage', value: coverage, note: 'Current profiling evidence coverage', icon: 'check' },
      ],
    },
    'privacy-security-officer': {
      attentionTitle: 'Sensitive-data risk signals', contextTitle: 'Sensitive-data governance footprint', actionTitle: 'Investigate the highest-priority privacy signal', actionDetail: data.highFindings ? `${data.highFindings} high-priority findings require privacy and security review.` : 'No high-priority privacy signal is currently surfaced from the available evidence.', actionHref: '/classification-privacy',
      metrics: [
        { label: 'Privacy risk signals', value: risk, note: `${data.materialFindings} material findings`, icon: 'alert' },
        { label: 'Governed assets in scope', value: String(data.governedAssets), note: `${data.affectedDomains} represented business areas`, icon: 'database' },
        { label: 'Operational exposure', value: String(data.openAlerts), note: 'Unresolved observability alerts', icon: 'gauge' },
        { label: 'Protection evidence coverage', value: coverage, note: 'Current profiling evidence coverage', icon: 'check' },
      ],
    },
    'data-custodian': {
      attentionTitle: 'Technical defects affecting governed data', contextTitle: 'Technical estate footprint by business area', actionTitle: 'Resolve the highest-impact technical signal', actionDetail: data.openAlerts || data.failedControls ? `${data.openAlerts} unresolved alerts and ${data.failedControls} failed controls require technical review.` : 'No unresolved technical signal is currently surfaced from the available evidence.', actionHref: '/observability',
      metrics: [
        { label: 'Technical alerts', value: String(data.openAlerts), note: 'Unresolved observability alerts', icon: 'alert' },
        { label: 'Active sources', value: String(data.activeSources), note: `${data.governedAssets} governed assets`, icon: 'database' },
        { label: 'Failed technical controls', value: String(data.failedControls), note: 'Failed quality control runs', icon: 'gauge' },
        { label: 'Profiling readiness', value: coverage, note: 'Current profiling evidence coverage', icon: 'check' },
      ],
    },
    'data-product-owner': {
      attentionTitle: 'Consumer-impacting product issues', contextTitle: 'Data product footprint by business area', actionTitle: 'Protect the highest-impact data product first', actionDetail: data.highFindings ? `${data.highFindings} high-priority findings may affect product trust.` : 'No high-priority product issue is currently surfaced from the available evidence.', actionHref: '/catalog',
      metrics: [
        { label: 'Product trust', value: pct(data.confidence), note: 'Latest scored profiling evidence', icon: 'gauge' },
        { label: 'Product estate', value: String(data.governedAssets), note: `${data.activeSources} active sources`, icon: 'database' },
        { label: 'Consumer-impacting risks', value: risk, note: `${data.materialFindings} material findings`, icon: 'alert' },
        { label: 'Certification evidence coverage', value: coverage, note: 'Current profiling evidence coverage', icon: 'check' },
      ],
    },
    'source-system-owner': {
      attentionTitle: 'Upstream defects affecting downstream consumers', contextTitle: 'Source footprint by business area', actionTitle: 'Address the highest-impact source defect', actionDetail: data.openAlerts || data.highFindings ? `${data.openAlerts} unresolved alerts and ${data.highFindings} high-priority findings are available for source review.` : 'No high-impact source defect is currently surfaced from the available evidence.', actionHref: '/observability',
      metrics: [
        { label: 'Source reliability signals', value: String(data.openAlerts), note: 'Unresolved observability alerts', icon: 'alert' },
        { label: 'Active sources', value: String(data.activeSources), note: `${data.governedAssets} governed assets`, icon: 'database' },
        { label: 'Downstream risk signals', value: risk, note: `${data.materialFindings} material findings`, icon: 'gauge' },
        { label: 'Source evidence coverage', value: coverage, note: 'Current profiling coverage', icon: 'check' },
      ],
    },
  } satisfies Record<PersonaSlug, PersonaView>

  return common[slug]
}

const surface = 'rounded-[28px] bg-[#eef3f8] shadow-[10px_10px_24px_rgba(163,177,198,0.34),-10px_-10px_24px_rgba(255,255,255,0.92)]'
const inset = 'rounded-2xl bg-[#eef3f8] shadow-[inset_4px_4px_10px_rgba(163,177,198,0.22),inset_-4px_-4px_10px_rgba(255,255,255,0.88)]'

function icon(kind: MetricCard['icon']) {
  if (kind === 'database') return <Database className="h-5 w-5" />
  if (kind === 'alert') return <AlertTriangle className="h-5 w-5" />
  if (kind === 'check') return <CheckCircle2 className="h-5 w-5" />
  return <Gauge className="h-5 w-5" />
}

export function RoleLandingPage({ persona, data, userLabel, canAdmin = false }: { persona: PersonaDefinition; data: RoleLandingData; userLabel: string; canAdmin?: boolean }) {
  const current = status(data.confidence)
  const view = personaView(persona.slug, data)
  const visibleNav = persona.nav.filter(item => canAdmin || !item.href.startsWith('/admin'))

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <div className="mx-auto grid max-w-[1600px] gap-7 px-4 py-5 lg:grid-cols-[230px_1fr] lg:px-7">
        <aside className={`${surface} hidden min-h-[calc(100vh-40px)] p-5 lg:flex lg:flex-col`}>
          <Link href={`/home/${persona.slug}`} className="flex items-center gap-3 px-2 py-2"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white"><ShieldCheck className="h-5 w-5" /></span><span><span className="block text-lg font-black tracking-tight">DataNexus</span><span className="block text-[11px] text-slate-500">Trusted Data. Better Decisions.</span></span></Link>
          <nav className="mt-8 space-y-2">{visibleNav.map((item, index) => <Link key={item.href} href={item.href} className={`block rounded-2xl px-4 py-3 text-sm font-semibold transition ${index === 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}>{item.label}</Link>)}</nav>
          {canAdmin ? <div className="mt-5 border-t border-slate-300/70 pt-4"><Link href="/admin" className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-white/60"><Settings className="h-4 w-4"/>Administration</Link></div> : null}
          <div className={`${inset} mt-auto p-4`}><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Your perspective</p><p className="mt-2 text-sm font-bold">{persona.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{persona.focus}</p></div>
        </aside>

        <section className="min-w-0 py-1">
          <header className="flex flex-wrap items-center justify-between gap-4 px-1"><div><p className="text-sm font-semibold text-blue-600">{persona.title}</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Good day, {userLabel}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{persona.primaryQuestion}</p></div><div className="flex flex-wrap items-center gap-3">{canAdmin ? <Link href="/admin" className={`${inset} inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-600 lg:hidden`}><Settings className="h-4 w-4"/>Administration</Link> : null}<div className={`${inset} flex min-w-[260px] items-center gap-3 px-4 py-3 text-slate-500`}><Search className="h-4 w-4"/><span className="text-sm">Search DataNexus...</span></div></div></header>

          <section className={`${surface} relative mt-7 overflow-hidden p-7 sm:p-8`}><div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-200/45 blur-3xl" /><div className="relative grid gap-7 xl:grid-cols-[270px_1fr] xl:items-center"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{persona.labels.confidence}</p><div className="mt-2 flex items-end gap-3"><span className={`text-6xl font-black tracking-tight ${current.tone}`}>{pct(data.confidence)}</span><span className={`mb-2 rounded-full px-3 py-1 text-xs font-bold ${current.badge}`}>{current.label}</span></div></div><div className="max-w-3xl border-l border-slate-300/70 pl-7"><p className="text-xl font-bold leading-8 text-slate-800">{persona.strapline}</p><p className="mt-2 text-sm leading-6 text-slate-500">This view uses current DataNexus evidence from profiling, findings, quality controls, source readiness and observability. It changes emphasis by persona without changing the underlying evidence.</p></div></div></section>

          <section className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{view.metrics.map(metric => <Kpi key={metric.label} icon={icon(metric.icon)} label={metric.label} value={metric.value} note={metric.note} />)}</section>

          <section className="mt-7 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <div className={`${surface} p-6`}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{persona.labels.changes}</p><h2 className="mt-1 text-xl font-black">{view.attentionTitle}</h2></div><Link href="/issues" className="text-sm font-bold text-blue-600">View evidence</Link></div><div className="mt-5 space-y-3">{data.topFindings.length ? data.topFindings.map(finding => <Link key={finding.id} href="/issues" className={`${inset} flex items-start gap-4 p-4 transition hover:translate-y-[-1px]`}><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${['CRITICAL','HIGH'].includes(finding.severity.toUpperCase()) ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block font-bold">{finding.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{finding.description}</span></span><ArrowRight className="mt-2 h-4 w-4 text-slate-400"/></Link>) : <div className={`${inset} p-5 text-sm text-slate-500`}>No material finding is currently available from the evidence queried for this landing page.</div>}</div></div>
            <div className={`${surface} p-6`}><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Business context</p><h2 className="mt-1 text-xl font-black">{view.contextTitle}</h2><div className="mt-5 space-y-4">{data.domains.slice(0,6).map(domain => <div key={domain.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">{domain.name}</span><span className="font-black text-slate-900">{domain.assets}</span></div><div className={`${inset} mt-2 h-2 overflow-hidden`}><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(12, Math.min(100, data.governedAssets ? (domain.assets / data.governedAssets) * 100 : 0))}%` }} /></div></div>)}{!data.domains.length && <p className="text-sm text-slate-500">Business areas will appear as governed assets acquire business-domain context.</p>}</div></div>
          </section>

          <section className={`${surface} mt-7 flex flex-wrap items-center justify-between gap-5 p-6`}><div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Sparkles className="h-5 w-5"/></span><div><p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">{persona.labels.action}</p><p className="mt-1 font-bold">{view.actionTitle}</p><p className="mt-1 text-sm text-slate-500">{view.actionDetail}</p></div></div><Link href={view.actionHref} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Open workspace <ArrowRight className="h-4 w-4"/></Link></section>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 px-2 pb-4 text-xs text-slate-400"><span>DataNexus · Shared governed evidence, persona-specific decisions.</span><span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5"/> Evidence-backed role experience</span></div>
        </section>
      </div>
    </main>
  )
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className={`${surface} p-5`}><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-600">{icon}</span><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Live</span></div><p className="mt-5 text-3xl font-black tracking-tight">{value}</p><p className="mt-1 text-sm font-bold text-slate-700">{label}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>
}
