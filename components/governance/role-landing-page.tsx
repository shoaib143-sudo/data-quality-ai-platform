import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Gauge, Settings, ShieldCheck } from 'lucide-react'
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

type MetricCard = { label: string; value: string; icon: 'gauge' | 'database' | 'alert' | 'check' }
type PersonaView = { attentionTitle: string; contextTitle: string; actionTitle: string; actionHref: string; metrics: MetricCard[] }

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
  const risk = String(data.highFindings)
  const pressure = String(data.failedControls + data.openAlerts)
  const coverage = `${data.coverage}%`
  const views: Record<PersonaSlug, PersonaView> = {
    'senior-leadership': { attentionTitle: 'Material exposure', contextTitle: 'Business areas', actionTitle: 'Review material exposure', actionHref: '/reports', metrics: [{ label: 'Material risks', value: risk, icon: 'alert' }, { label: 'Business areas affected', value: String(data.affectedDomains), icon: 'database' }, { label: 'Evidence coverage', value: coverage, icon: 'check' }] },
    'business-user': { attentionTitle: 'Data concerns', contextTitle: 'Available data by business area', actionTitle: 'Find trusted data', actionHref: '/catalog', metrics: [{ label: 'Data confidence', value: pct(data.confidence), icon: 'gauge' }, { label: 'Governed assets', value: String(data.governedAssets), icon: 'database' }, { label: 'Use with caution', value: risk, icon: 'alert' }] },
    'data-owner': { attentionTitle: 'Owner decisions and risk', contextTitle: 'Owned estate', actionTitle: 'Review owner decisions', actionHref: '/stewardship', metrics: [{ label: 'Critical exposure', value: risk, icon: 'alert' }, { label: 'Governed estate', value: String(data.governedAssets), icon: 'database' }, { label: 'Evidence coverage', value: coverage, icon: 'check' }] },
    'data-product-owner': { attentionTitle: 'Consumer-impacting issues', contextTitle: 'Data product footprint', actionTitle: 'Review data products', actionHref: '/catalog', metrics: [{ label: 'Product trust', value: pct(data.confidence), icon: 'gauge' }, { label: 'Product estate', value: String(data.governedAssets), icon: 'database' }, { label: 'Consumer risks', value: risk, icon: 'alert' }] },
    'data-steward': { attentionTitle: 'Stewardship work', contextTitle: 'Stewardship coverage', actionTitle: 'Investigate data issues', actionHref: '/issues', metrics: [{ label: 'Material findings', value: String(data.materialFindings), icon: 'alert' }, { label: 'Governed assets', value: String(data.governedAssets), icon: 'database' }, { label: 'Evidence coverage', value: coverage, icon: 'check' }] },
    'data-governance-specialist': { attentionTitle: 'Governance gaps', contextTitle: 'Governance adoption', actionTitle: 'Review governance gaps', actionHref: '/reports', metrics: [{ label: 'Governance gaps', value: String(data.materialFindings), icon: 'alert' }, { label: 'Governed assets', value: String(data.governedAssets), icon: 'database' }, { label: 'Evidence coverage', value: coverage, icon: 'check' }] },
    'compliance-risk-officer': { attentionTitle: 'Control exposure', contextTitle: 'Exposure footprint', actionTitle: 'Review control evidence', actionHref: '/audit', metrics: [{ label: 'High-risk signals', value: risk, icon: 'alert' }, { label: 'Failed controls', value: String(data.failedControls), icon: 'gauge' }, { label: 'Evidence coverage', value: coverage, icon: 'check' }] },
    'privacy-security-officer': { attentionTitle: 'Sensitive-data risk', contextTitle: 'Privacy footprint', actionTitle: 'Review privacy signals', actionHref: '/classification-privacy', metrics: [{ label: 'Privacy risk signals', value: risk, icon: 'alert' }, { label: 'Assets in scope', value: String(data.governedAssets), icon: 'database' }, { label: 'Evidence coverage', value: coverage, icon: 'check' }] },
    'data-governance-admin': { attentionTitle: 'Workflow signals', contextTitle: 'Governed estate', actionTitle: 'Review operational signals', actionHref: '/monitoring', metrics: [{ label: 'Operational alerts', value: String(data.openAlerts), icon: 'alert' }, { label: 'Active sources', value: String(data.activeSources), icon: 'database' }, { label: 'Failed controls', value: String(data.failedControls), icon: 'gauge' }] },
    'data-custodian': { attentionTitle: 'Technical defects', contextTitle: 'Technical estate', actionTitle: 'Review technical signals', actionHref: '/observability', metrics: [{ label: 'Technical alerts', value: String(data.openAlerts), icon: 'alert' }, { label: 'Active sources', value: String(data.activeSources), icon: 'database' }, { label: 'Signal pressure', value: pressure, icon: 'gauge' }] },
    'source-system-owner': { attentionTitle: 'Upstream defects', contextTitle: 'Source footprint', actionTitle: 'Review source health', actionHref: '/observability', metrics: [{ label: 'Source alerts', value: String(data.openAlerts), icon: 'alert' }, { label: 'Active sources', value: String(data.activeSources), icon: 'database' }, { label: 'High-risk signals', value: risk, icon: 'gauge' }] },
  }
  return views[slug]
}

const surface = 'rounded-[24px] border border-white/70 bg-[#eef3f8] shadow-[8px_8px_20px_rgba(163,177,198,0.26),-8px_-8px_20px_rgba(255,255,255,0.9)]'
const inset = 'rounded-2xl bg-[#eef3f8] shadow-[inset_3px_3px_8px_rgba(163,177,198,0.18),inset_-3px_-3px_8px_rgba(255,255,255,0.84)]'
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:translate-y-0'

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
  const findings = data.topFindings.slice(0, 3)

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <div className="mx-auto grid max-w-[1480px] gap-6 px-4 py-5 lg:grid-cols-[220px_1fr] lg:px-6">
        <aside className={`${surface} hidden min-h-[calc(100vh-40px)] p-4 lg:flex lg:flex-col`}>
          <Link href={`/home/${persona.slug}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm"><ShieldCheck className="h-5 w-5" /></span>
            <span><span className="block text-lg font-black tracking-tight">DataNexus</span><span className="block text-[11px] text-slate-500">Trusted data</span></span>
          </Link>
          <nav className="mt-7 space-y-1.5">{visibleNav.map((item, index) => <Link key={item.href} href={item.href} className={`block rounded-2xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${index === 0 ? 'bg-white/65 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-white/55 hover:text-slate-900'}`}>{item.label}</Link>)}</nav>
          {canAdmin ? <div className="mt-auto pt-5"><Link href="/admin" className={`${button} w-full bg-white/55 text-slate-700 shadow-sm`}><Settings className="h-4 w-4" />Administration</Link></div> : null}
        </aside>

        <section className="min-w-0 py-1">
          <header className="flex flex-wrap items-start justify-between gap-4 px-1">
            <div><p className="text-sm font-semibold text-blue-600">{persona.title}</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Good day, {userLabel}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{persona.primaryQuestion}</p></div>
            <div className="flex flex-wrap gap-2 lg:hidden">{visibleNav.slice(0, 3).map(item => <Link key={item.href} href={item.href} className={`${button} ${inset} text-slate-700`}>{item.label}</Link>)}{canAdmin ? <Link href="/admin" className={`${button} ${inset} text-slate-700`}><Settings className="h-4 w-4" />Admin</Link> : null}</div>
          </header>

          <section className={`${surface} mt-6 p-6 sm:p-7`}>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">{persona.labels.confidence}</p><div className="mt-2 flex items-end gap-3"><span className={`text-5xl font-black tracking-tight ${current.tone}`}>{pct(data.confidence)}</span><span className={`mb-1 rounded-full px-3 py-1 text-xs font-bold ${current.badge}`}>{current.label}</span></div></div>
              <p className="max-w-xl text-sm leading-6 text-slate-600">{persona.strapline}</p>
            </div>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-3">{view.metrics.map(metric => <Kpi key={metric.label} icon={icon(metric.icon)} label={metric.label} value={metric.value} />)}</section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <div className={`${surface} p-5 sm:p-6`}>
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">{view.attentionTitle}</h2><Link href="/issues" className="rounded-xl px-3 py-2 text-sm font-bold text-blue-600 hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">View all</Link></div>
              <div className="mt-4 space-y-2.5">{findings.length ? findings.map(finding => <Link key={finding.id} href={`/issues?finding=${encodeURIComponent(finding.id)}`} className={`${inset} flex items-center gap-3 p-4 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${['CRITICAL','HIGH'].includes(finding.severity.toUpperCase()) ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><AlertTriangle className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-bold">{finding.title}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{finding.description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-400" /></Link>) : <div className={`${inset} p-4 text-sm text-slate-500`}>No material findings need attention.</div>}</div>
            </div>

            <div className={`${surface} p-5 sm:p-6`}>
              <h2 className="text-lg font-black">{view.contextTitle}</h2>
              <div className="mt-4 space-y-3">{data.domains.slice(0, 5).map(domain => <div key={domain.name} className="flex items-center justify-between gap-4 rounded-xl px-2 py-1.5 text-sm"><span className="truncate font-semibold text-slate-600">{domain.name}</span><span className="font-black tabular-nums">{domain.assets}</span></div>)}{!data.domains.length && <p className="text-sm leading-6 text-slate-500">Business context will appear as governed assets are classified.</p>}</div>
            </div>
          </section>

          <section className={`${surface} mt-5 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6`}><div><p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">Next action</p><p className="mt-1 font-bold">{view.actionTitle}</p></div><Link href={view.actionHref} className={`${button} bg-blue-600 text-white shadow-[4px_4px_10px_rgba(37,99,235,0.2)] hover:bg-blue-700`}>Open workspace <ArrowRight className="h-4 w-4" /></Link></section>
        </section>
      </div>
    </main>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className={`${surface} p-5`}><div className="flex items-center gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/55 text-blue-600 shadow-sm">{icon}</span><div><p className="text-2xl font-black tracking-tight tabular-nums">{value}</p><p className="mt-0.5 text-sm font-semibold text-slate-600">{label}</p></div></div></div>
}
