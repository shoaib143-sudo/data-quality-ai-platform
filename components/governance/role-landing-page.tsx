import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  Gauge,
  GitBranch,
  Layers3,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
} from 'lucide-react'
import { LandingRecentlyViewed } from '@/components/governance/landing-recently-viewed'
import type { PersonaDefinition, PersonaSlug } from '@/lib/governance/personas'
import { canAccessWorkspaceHref } from '@/lib/governance/workspace-access'

export type LandingTrendPoint = { label: string; value: number }
export type LandingDomain = { name: string; assets: number; confidence: number | null; highFindings: number }
export type LandingDataset = {
  id: string
  projectId: string
  name: string
  domain: string
  confidence: number | null
  completeness: number | null
  uniqueness: number | null
  validity: number | null
  accuracy: number | null
  certificationStatus: string
  criticality: string
  hasOwner: boolean
  findingCount: number
  highFindingCount: number
  latestRunId: string | null
  approvedGlossaryMappings: number
  approvedClassifications: number
  cdeMappings: number
}
export type LandingActivity = { id: string; label: string; detail: string; when: string; href: string; tone: 'good' | 'warn' | 'info' }
export type LandingImpact = { label: string; count: number; href: string }
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
  certifiedDatasets: number
  pendingCertifications: number
  pendingWaivers: number
  unresolvedIssues: number
  ownershipCoverage: number
  domainAssignedCoverage: number
  approvedGlossaryMappings: number
  approvedClassifications: number
  cdeMappings: number
  failedControlEvaluations: number
  topFindings: { id: string; title: string; description: string; severity: string; href: string }[]
  domains: LandingDomain[]
  datasets: LandingDataset[]
  trend: LandingTrendPoint[]
  activity: LandingActivity[]
  businessImpact: LandingImpact[]
  defaultProjectId: string | null
  selectedDomain: string
  selectedDatasetId: string
  selectedDimension: string
  selectedRange: string
}

type MetricIcon = 'gauge' | 'database' | 'alert' | 'check' | 'users' | 'tag' | 'lineage' | 'activity' | 'book'
type MetricCard = { label: string; value: string; detail: string; href: string; icon: MetricIcon }
type PersonaView = { attentionTitle: string; contextTitle: string; actionTitle: string; actionHref: string; metrics: MetricCard[]; aiStarters: string[] }

const surface = 'rounded-[22px] border border-white/10 bg-[#0a1d33] shadow-[10px_10px_28px_rgba(0,0,0,0.28),-7px_-7px_22px_rgba(30,74,114,0.13)]'
const inset = 'rounded-2xl border border-white/[0.07] bg-[#08182b] shadow-[inset_4px_4px_10px_rgba(0,0,0,0.28),inset_-3px_-3px_8px_rgba(30,74,114,0.09)]'
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#061426]'
const interactive = `${focus} transition duration-150 hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-white/[0.055] active:translate-y-0`
const button = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${focus} transition hover:-translate-y-0.5 active:translate-y-0`

function pct(value: number | null) { return value === null || !Number.isFinite(value) ? 'N/A' : `${Math.round(value * 100)}%` }
function numeric(value: number | null) { return value === null || !Number.isFinite(value) ? 'N/A' : `${Math.round(value * 100)}%` }
function metricIcon(kind: MetricIcon) {
  if (kind === 'database') return <Database className="h-5 w-5" />
  if (kind === 'alert') return <AlertTriangle className="h-5 w-5" />
  if (kind === 'check') return <CheckCircle2 className="h-5 w-5" />
  if (kind === 'users') return <Users className="h-5 w-5" />
  if (kind === 'tag') return <Tag className="h-5 w-5" />
  if (kind === 'lineage') return <GitBranch className="h-5 w-5" />
  if (kind === 'activity') return <Activity className="h-5 w-5" />
  if (kind === 'book') return <BookOpen className="h-5 w-5" />
  return <Gauge className="h-5 w-5" />
}

function personaView(slug: PersonaSlug, data: RoleLandingData): PersonaView {
  const decisions = data.pendingCertifications + data.pendingWaivers
  const impacts = data.businessImpact.reduce((sum, item) => sum + item.count, 0)
  const metadataGaps = Math.max(0, data.governedAssets - Math.round((data.domainAssignedCoverage / 100) * data.governedAssets))
  const views: Record<PersonaSlug, PersonaView> = {
    'senior-leadership': { attentionTitle: 'Material business risks', contextTitle: 'Business domain health', actionTitle: 'Review the highest-priority decision', actionHref: '/issues', metrics: [
      { label: 'Material risks', value: String(data.highFindings), detail: `${data.materialFindings} material findings`, href: '/issues', icon: 'alert' },
      { label: 'Business impact', value: String(impacts), detail: 'Linked reports, KPIs, processes and decisions', href: '/reports', icon: 'lineage' },
      { label: 'Decisions in progress', value: String(decisions), detail: 'Certification and exception decisions', href: '/stewardship', icon: 'check' },
      { label: 'Ownership coverage', value: `${data.ownershipCoverage}%`, detail: 'Governed datasets with an accountable owner', href: '/stewardship', icon: 'users' }], aiStarters: ['What needs my attention today?', 'Where is our biggest data risk?', 'What changed since my last review?', 'Which business decisions are affected?', 'Are we improving overall?'] },
    'business-user': { attentionTitle: 'Known concerns affecting governed data', contextTitle: 'Data available by business domain', actionTitle: 'Find trusted data for your business need', actionHref: '/catalog', metrics: [
      { label: 'Certified datasets', value: String(data.certifiedDatasets), detail: 'Governed datasets with certified status', href: '/catalog?q=CERTIFIED', icon: 'check' },
      { label: 'Known issues', value: String(data.unresolvedIssues), detail: 'Unresolved governed data issues', href: '/issues', icon: 'alert' },
      { label: 'Governed datasets', value: String(data.governedAssets), detail: `${data.affectedDomains} represented domains`, href: '/catalog', icon: 'database' },
      { label: 'Business terms linked', value: String(data.approvedGlossaryMappings), detail: 'Approved glossary mappings', href: '/glossary', icon: 'book' }], aiStarters: ['Find data for a business question', 'Can I trust the data I use?', 'Explain this dataset in simple terms', 'Show known issues for my data', 'What governed data should I use?'] },
    'data-owner': { attentionTitle: 'Risks and decisions requiring owner attention', contextTitle: 'Owned domain health', actionTitle: 'Review owner decisions and remediation', actionHref: '/stewardship', metrics: [
      { label: 'High-risk findings', value: String(data.highFindings), detail: 'Critical and high findings', href: '/issues', icon: 'alert' },
      { label: 'Critical data mappings', value: String(data.cdeMappings), detail: 'Governed CDE mappings', href: '/classification', icon: 'tag' },
      { label: 'Pending decisions', value: String(decisions), detail: 'Certification and exception decisions', href: '/stewardship', icon: 'check' },
      { label: 'Ownership coverage', value: `${data.ownershipCoverage}%`, detail: 'Datasets with accountable ownership', href: '/stewardship', icon: 'users' }], aiStarters: ['What requires my decision today?', 'Which owned data is outside tolerance?', 'What critical data is affected?', 'Who is resolving the highest risks?', 'What should I prioritize next?'] },
    'data-product-owner': { attentionTitle: 'Consumer-impacting data product risks', contextTitle: 'Product trust by business domain', actionTitle: 'Review data products requiring attention', actionHref: '/catalog', metrics: [
      { label: 'Product trust', value: pct(data.confidence), detail: 'Latest scored profiling evidence', href: '/data-quality', icon: 'gauge' },
      { label: 'Certified products', value: String(data.certifiedDatasets), detail: 'Certified governed datasets', href: '/catalog?q=CERTIFIED', icon: 'check' },
      { label: 'Consumer-impact links', value: String(impacts), detail: 'Business dependencies linked to data', href: '/lineage', icon: 'lineage' },
      { label: 'Open product issues', value: String(data.unresolvedIssues), detail: 'Unresolved governed issues', href: '/issues', icon: 'alert' }], aiStarters: ['Which data products need attention?', 'Are consumers affected by current issues?', 'What is the trust trend for my products?', 'Which products are ready for certification?', 'Show downstream impact of product risks'] },
    'data-steward': { attentionTitle: 'Stewardship work requiring investigation', contextTitle: 'Stewardship coverage by business domain', actionTitle: 'Investigate the highest-priority issue', actionHref: '/issues', metrics: [
      { label: 'Open issues', value: String(data.unresolvedIssues), detail: 'Issues awaiting resolution', href: '/issues', icon: 'alert' },
      { label: 'Material findings', value: String(data.materialFindings), detail: `${data.highFindings} high priority`, href: '/profiling/explorer', icon: 'activity' },
      { label: 'Domain metadata gaps', value: String(metadataGaps), detail: `${data.domainAssignedCoverage}% domain assignment coverage`, href: '/catalog', icon: 'tag' },
      { label: 'Classification evidence', value: String(data.approvedClassifications), detail: 'Approved classifications', href: '/classification', icon: 'check' }], aiStarters: ['What needs my attention today?', 'Which issues should I investigate first?', 'Where are metadata gaps?', 'Which controls or rules are failing?', 'What remediation needs coordination?'] },
    'data-governance-specialist': { attentionTitle: 'Governance gaps requiring intervention', contextTitle: 'Governance health by business domain', actionTitle: 'Target the largest governance gap', actionHref: '/reports', metrics: [
      { label: 'Control failures', value: String(data.failedControlEvaluations), detail: 'Governance control evaluations not passing', href: '/data-quality/rules', icon: 'alert' },
      { label: 'Critical data coverage', value: String(data.cdeMappings), detail: 'Governed CDE mappings', href: '/classification', icon: 'tag' },
      { label: 'Ownership coverage', value: `${data.ownershipCoverage}%`, detail: 'Datasets with accountable ownership', href: '/stewardship', icon: 'users' },
      { label: 'Open exceptions', value: String(data.pendingWaivers), detail: 'Control waivers awaiting decision', href: '/audit', icon: 'check' }], aiStarters: ['Where are our governance gaps?', 'Which domains need intervention?', 'Are controls working effectively?', 'Where is ownership incomplete?', 'Are governance outcomes improving?'] },
    'compliance-risk-officer': { attentionTitle: 'Regulatory and control exposure', contextTitle: 'Exposure by business domain', actionTitle: 'Review the most material control exposure', actionHref: '/audit', metrics: [
      { label: 'Failed controls', value: String(data.failedControlEvaluations), detail: 'Non-passing governance evaluations', href: '/data-quality/rules', icon: 'alert' },
      { label: 'Open exceptions', value: String(data.pendingWaivers), detail: 'Control waivers awaiting decision', href: '/audit', icon: 'check' },
      { label: 'Material findings', value: String(data.highFindings), detail: 'Critical and high findings', href: '/issues', icon: 'activity' },
      { label: 'Evidence coverage', value: `${data.coverage}%`, detail: 'Datasets with completed profiling evidence', href: '/audit', icon: 'database' }], aiStarters: ['Show open control failures', 'Where is regulatory exposure highest?', 'Which exceptions need review?', 'Is audit evidence complete?', 'What risks need escalation?'] },
    'privacy-security-officer': { attentionTitle: 'Sensitive-data and privacy risk signals', contextTitle: 'Privacy evidence by business domain', actionTitle: 'Review privacy and classification exposure', actionHref: '/classification-privacy', metrics: [
      { label: 'Approved classifications', value: String(data.approvedClassifications), detail: 'Governed classification evidence', href: '/classification', icon: 'tag' },
      { label: 'Unclassified datasets', value: String(Math.max(0, data.governedAssets - data.datasets.filter(item => item.approvedClassifications > 0).length)), detail: 'Datasets without approved classification evidence', href: '/classification-privacy', icon: 'alert' },
      { label: 'Privacy-impact links', value: String(impacts), detail: 'Business dependencies connected to data', href: '/lineage', icon: 'lineage' },
      { label: 'Open governed issues', value: String(data.unresolvedIssues), detail: 'Issues requiring review', href: '/issues', icon: 'activity' }], aiStarters: ['Where is sensitive data exposed?', 'Which datasets lack classification?', 'Show privacy risks by domain', 'What downstream assets depend on sensitive data?', 'Which privacy issues need action?'] },
    'data-governance-admin': { attentionTitle: 'Governance operational signals', contextTitle: 'Governed estate operating footprint', actionTitle: 'Review degraded governance operations', actionHref: '/monitoring', metrics: [
      { label: 'Active sources', value: String(data.activeSources), detail: 'Currently active data sources', href: '/datasets', icon: 'database' },
      { label: 'Operational alerts', value: String(data.openAlerts), detail: 'Unresolved observability alerts', href: '/monitoring', icon: 'alert' },
      { label: 'Failed quality controls', value: String(data.failedControls), detail: 'Failed quality rule executions', href: '/data-quality/rules', icon: 'activity' },
      { label: 'Profiling coverage', value: `${data.coverage}%`, detail: 'Datasets with current completed profiling evidence', href: '/profiling/explorer', icon: 'check' }], aiStarters: ['Is the governance platform healthy?', 'Which sources or jobs are failing?', 'What workflows need attention?', 'Where is configuration incomplete?', 'Summarize operational governance alerts'] },
    'data-custodian': { attentionTitle: 'Technical signals requiring remediation', contextTitle: 'Technical health by business domain', actionTitle: 'Resolve the highest-impact technical signal', actionHref: '/observability', metrics: [
      { label: 'Active sources', value: String(data.activeSources), detail: 'Sources currently available', href: '/datasets', icon: 'database' },
      { label: 'Technical alerts', value: String(data.openAlerts), detail: 'Unresolved observability alerts', href: '/observability', icon: 'alert' },
      { label: 'Failed controls', value: String(data.failedControls), detail: 'Failed quality rule executions', href: '/data-quality/rules', icon: 'activity' },
      { label: 'Profiling coverage', value: `${data.coverage}%`, detail: 'Current profiling evidence coverage', href: '/profiling/explorer', icon: 'check' }], aiStarters: ['Which technical signals need attention?', 'Show failed profiling or quality jobs', 'Where are source health problems?', 'What changed in the schema?', 'What should be remediated first?'] },
    'source-system-owner': { attentionTitle: 'Upstream defects affecting downstream consumers', contextTitle: 'Source impact by business domain', actionTitle: 'Address the highest-impact source defect', actionHref: '/observability', metrics: [
      { label: 'Active sources', value: String(data.activeSources), detail: 'Currently active source connections', href: '/datasets', icon: 'database' },
      { label: 'Source alerts', value: String(data.openAlerts), detail: 'Unresolved observability alerts', href: '/observability', icon: 'alert' },
      { label: 'High-risk findings', value: String(data.highFindings), detail: 'Critical and high findings', href: '/issues', icon: 'activity' },
      { label: 'Downstream dependencies', value: String(impacts), detail: 'Linked business impacts', href: '/lineage', icon: 'lineage' }], aiStarters: ['Is my source causing downstream issues?', 'What changed in my source?', 'Which defects keep recurring?', 'Who is affected downstream?', 'What upstream fix should I prioritize?'] },
    'metadata-analyst': { attentionTitle: 'Metadata gaps requiring analysis', contextTitle: 'Metadata coverage by business domain', actionTitle: 'Review the largest metadata gap', actionHref: '/catalog', metrics: [
      { label: 'Domain assignment', value: `${data.domainAssignedCoverage}%`, detail: 'Datasets assigned to a business domain', href: '/catalog', icon: 'tag' },
      { label: 'Ownership coverage', value: `${data.ownershipCoverage}%`, detail: 'Datasets with accountable ownership', href: '/catalog', icon: 'users' },
      { label: 'Glossary mappings', value: String(data.approvedGlossaryMappings), detail: 'Approved dataset and column term mappings', href: '/glossary', icon: 'book' },
      { label: 'Classifications', value: String(data.approvedClassifications), detail: 'Approved classification evidence', href: '/classification', icon: 'check' }], aiStarters: ['Show metadata gaps by dataset', 'Which datasets lack business terms?', 'Where is ownership missing?', 'Show lineage and metadata coverage', 'Which metadata should be improved first?'] },
    'data-quality-analyst': { attentionTitle: 'Quality findings requiring investigation', contextTitle: 'Quality health by business domain', actionTitle: 'Investigate the highest-priority quality issue', actionHref: '/profiling/explorer', metrics: [
      { label: 'Quality score', value: pct(data.confidence), detail: 'Latest scored profiling evidence', href: '/data-quality', icon: 'gauge' },
      { label: 'Material findings', value: String(data.materialFindings), detail: `${data.highFindings} critical or high`, href: '/profiling/explorer', icon: 'alert' },
      { label: 'Failed quality controls', value: String(data.failedControls), detail: 'Failed quality rule executions', href: '/data-quality/rules', icon: 'activity' },
      { label: 'Profiled datasets', value: `${data.coverage}%`, detail: 'Current completed profiling coverage', href: '/profiling/explorer', icon: 'check' }], aiStarters: ['Why did quality change for this dataset?', 'Show top quality issues and root causes', 'Compare quality across business domains', 'Which quality dimension is weakest?', 'Recommend evidence-backed improvements'] },
  }
  return views[slug]
}

function trendDelta(points: LandingTrendPoint[]) { return points.length < 2 ? null : points[points.length - 1].value - points[0].value }
function TrendChart({ points }: { points: LandingTrendPoint[] }) {
  if (!points.length) return <div className={`${inset} grid min-h-52 place-items-center p-5 text-sm text-slate-500`}>No scored trend evidence is available for this scope.</div>
  const width = 620, height = 190, left = 18, top = 14, usableWidth = width - 36, usableHeight = height - 42
  const coords = points.map((point, index) => ({ x: left + (points.length === 1 ? usableWidth / 2 : (index / (points.length - 1)) * usableWidth), y: top + (1 - Math.max(0, Math.min(1, point.value))) * usableHeight }))
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
  return <div className={`${inset} overflow-hidden p-3`}><svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="Data confidence trend">{[0.25, 0.5, 0.75, 1].map(value => { const y = top + (1 - value) * usableHeight; return <line key={value} x1={left} x2={width-left} y1={y} y2={y} stroke="rgba(148,163,184,.12)" /> })}<path d={path} fill="none" stroke="rgb(34 211 238)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{coords.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r="5" fill="rgb(45 212 191)" stroke="rgb(6 20 38)" strokeWidth="3" />)}{points.map((point,index)=><text key={point.label} x={coords[index].x} y={height-8} textAnchor="middle" fill="rgb(148 163 184)" fontSize="11">{point.label}</text>)}</svg></div>
}
function aiHref(prompt: string, data: RoleLandingData) { const params = new URLSearchParams(); if (data.defaultProjectId) params.set('projectId', data.defaultProjectId); if (data.selectedDatasetId) params.set('datasetId', data.selectedDatasetId); params.set('prompt', prompt); return `/ai-insights?${params.toString()}` }
function KpiLink({ item }: { item: MetricCard }) { return <Link href={item.href} data-track-recent="true" data-recent-label={item.label} className={`${surface} ${interactive} group block p-4`}><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">{metricIcon(item.icon)}</span><ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-300" /></div><p className="mt-4 text-2xl font-black text-white">{item.value}</p><p className="mt-1 text-sm font-bold text-slate-200">{item.label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p></Link> }
function EvidenceTile({ href, icon, label, value, detail }: { href: string; icon: ReactNode; label: string; value: string; detail: string }) { return <Link href={href} data-track-recent="true" data-recent-label={label} className={`${inset} ${interactive} block p-4`}><div className="flex items-start justify-between gap-3"><span className="text-cyan-300">{icon}</span><ArrowRight className="h-4 w-4 text-slate-500" /></div><p className="mt-3 text-xl font-black text-white">{value}</p><p className="mt-1 text-sm font-bold text-slate-200">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></Link> }

export function RoleLandingPage({ persona, data, userLabel, canAdmin=false }: { persona: PersonaDefinition; data: RoleLandingData; userLabel: string; canAdmin?: boolean }) {
  const orgRole = canAdmin ? 'ADMIN' : null
  const homeHref = `/home/${persona.slug}`
  const safeHref = (href: string, fallback='/catalog') => canAccessWorkspaceHref(persona.slug, href, orgRole) ? href : canAccessWorkspaceHref(persona.slug, fallback, orgRole) ? fallback : homeHref
  const view = personaView(persona.slug, data)
  const visibleNav = persona.nav.filter(item => canAccessWorkspaceHref(persona.slug, item.href, orgRole))
  const metrics = view.metrics.map(item => ({ ...item, href: safeHref(item.href) }))
  const findings = data.topFindings.slice(0,3).map(item => ({ ...item, href: safeHref(item.href, '/issues') }))
  const activity = data.activity.map(item => ({ ...item, href: safeHref(item.href, '/issues') }))
  const impacts = data.businessImpact.map(item => ({ ...item, href: safeHref(item.href, '/catalog') }))
  const selectedDataset = data.datasets.find(dataset => dataset.id === data.selectedDatasetId) ?? null
  const selectedDatasetHref = selectedDataset ? `/catalog/dataset/${encodeURIComponent(selectedDataset.id)}` : '/catalog'
  const delta = trendDelta(data.trend)
  const datasetFilters = persona.slug === 'metadata-analyst' || persona.slug === 'data-quality-analyst'
  const dimensionFilters = persona.slug === 'data-quality-analyst'
  const evidenceHref = safeHref('/profiling/explorer', '/issues')
  const primaryFinding = findings[0]

  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto grid max-w-[1680px] gap-5 px-3 py-3 lg:grid-cols-[245px_minmax(0,1fr)] lg:px-5 lg:py-5">
    <aside className={`${surface} hidden min-h-[calc(100vh-40px)] p-4 lg:flex lg:flex-col`}>
      <Link href={homeHref} className={`flex items-center gap-3 rounded-2xl px-2 py-2 ${focus}`}><span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600"><ShieldCheck className="h-5 w-5" /></span><span><span className="block text-lg font-black text-white">DataNexus AI</span><span className="block text-[10px] text-slate-500">Trusted data. Better decisions.</span></span></Link>
      <nav className="mt-6 space-y-1.5">{visibleNav.map((item,index)=><Link key={item.href} href={item.href} data-track-recent="true" data-recent-label={item.label} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold ${focus} ${index===0?'bg-blue-600/20 text-blue-200 ring-1 ring-blue-400/20':'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}><span>{item.label}</span><ArrowRight className="h-3.5 w-3.5 opacity-50" /></Link>)}</nav>
      <Link href={homeHref} className={`${inset} ${interactive} mt-5 block p-3`}><p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-300">My role</p><p className="mt-2 text-sm font-bold text-white">{persona.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{persona.focus}</p></Link>
      <div className="mt-5"><p className="px-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Quick links</p><div className="mt-2 space-y-1">{visibleNav.slice(1,6).map(item=><Link key={item.href} href={item.href} data-track-recent="true" data-recent-label={item.label} className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.05] hover:text-white ${focus}`}><span>{item.label}</span><ArrowRight className="h-3 w-3" /></Link>)}</div></div>
      <div className="mt-4"><LandingRecentlyViewed /></div>
      <section className="mt-3 rounded-[22px] border border-violet-400/35 bg-gradient-to-br from-violet-600/20 via-blue-600/15 to-cyan-500/10 p-3 shadow-[0_0_30px_rgba(99,102,241,0.15)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/20 text-violet-200"><Bot className="h-6 w-6" /></span><div><p className="text-sm font-black text-white">DataNexus AI Agent</p><p className="text-[10px] text-violet-200/70">{persona.title} copilot</p></div></div><div className="mt-3 space-y-1.5">{view.aiStarters.map(prompt=><Link key={prompt} href={aiHref(prompt,data)} data-track-recent="true" data-recent-label={prompt} className={`flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/10 px-2.5 py-2 text-[11px] font-semibold leading-4 text-slate-200 hover:border-cyan-300/30 hover:bg-white/[0.06] ${focus}`}><span>{prompt}</span><ArrowRight className="h-3 w-3 shrink-0 text-cyan-300" /></Link>)}</div><Link href={aiHref(view.aiStarters[0],data)} className={`${button} mt-3 w-full bg-gradient-to-r from-violet-600 to-blue-600 text-white`}>Ask DataNexus AI <ArrowRight className="h-4 w-4" /></Link></section>
      {canAdmin?<Link href="/admin" className={`${button} mt-4 w-full border border-white/10 bg-white/[0.04] text-slate-300`}><Settings className="h-4 w-4" />Administration</Link>:null}
      <p className="mt-auto px-2 pt-6 text-[10px] text-slate-600">DataNexus AI · role-aware governed evidence</p>
    </aside>

    <section className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4 px-2 py-2"><div><p className="text-sm font-semibold text-cyan-300">{persona.title}</p><h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">Good day, {userLabel}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{persona.primaryQuestion}</p></div><form action="/catalog" method="get" className="flex min-w-[280px] max-w-md flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-[#08182b] px-3 py-2 sm:flex-none"><Search className="h-4 w-4 text-slate-500"/><input name="q" aria-label="Search DataNexus catalog" placeholder="Search governed data..." className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"/><button className={`rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white ${focus}`}>Search</button></form></header>

      <section className={`${surface} mt-4 grid gap-5 p-5 lg:grid-cols-[minmax(300px,.8fr)_1.2fr] lg:p-6`}><Link href={safeHref('/data-quality', evidenceHref)} data-track-recent="true" data-recent-label={persona.labels.confidence} className={`${interactive} flex items-center gap-5 rounded-2xl p-2`}><div className="grid h-36 w-36 shrink-0 place-items-center rounded-full bg-[conic-gradient(rgb(45,212,191)_var(--score),rgba(30,41,59,.75)_0)] p-3" style={{'--score':data.confidence===null?'0%':`${Math.round(data.confidence*100)}%`} as CSSProperties}><div className="grid h-full w-full place-items-center rounded-full bg-[#07182a] text-center"><div><p className="text-4xl font-black text-white">{pct(data.confidence)}</p><p className="mt-1 max-w-20 text-[10px] font-bold leading-4 text-slate-400">{persona.labels.confidence}</p></div></div></div><div><p className="text-xs font-black uppercase tracking-[0.15em] text-cyan-300">Current evidence</p><p className="mt-2 text-xl font-black text-white">{data.coverage}% profiling coverage</p>{delta===null?<p className="mt-2 text-sm text-slate-400">Trend will appear as comparable scored evidence accumulates.</p>:<p className={`mt-2 text-sm font-bold ${delta>=0?'text-emerald-300':'text-rose-300'}`}>{delta>=0?'+':''}{Math.round(delta*100)} pts across the selected trend window</p>}<p className="mt-2 text-xs text-slate-500">Open the evidence behind this confidence score.</p></div></Link><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(item=><KpiLink key={item.label} item={item}/>)}</div></section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><article className={`${surface} p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Trend</p><h2 className="mt-1 text-lg font-black text-white">Data confidence trend</h2></div><form method="get" action={homeHref} className="flex flex-wrap items-center gap-2"><select name="domain" defaultValue={data.selectedDomain} aria-label="Business domain" className={`rounded-xl border border-white/10 bg-[#07182a] px-3 py-2 text-xs font-semibold ${focus}`}><option value="overall">All business domains</option>{data.domains.map(domain=><option key={domain.name} value={domain.name}>{domain.name}</option>)}</select>{datasetFilters?<select name="datasetId" defaultValue={data.selectedDatasetId} aria-label="Dataset" className={`max-w-[190px] rounded-xl border border-white/10 bg-[#07182a] px-3 py-2 text-xs font-semibold ${focus}`}><option value="">All datasets</option>{data.datasets.map(dataset=><option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select>:null}{dimensionFilters?<select name="dimension" defaultValue={data.selectedDimension} aria-label="Quality dimension" className={`rounded-xl border border-white/10 bg-[#07182a] px-3 py-2 text-xs font-semibold ${focus}`}><option value="overall">Overall</option><option value="completeness">Completeness</option><option value="validity">Validity</option><option value="accuracy">Accuracy</option><option value="uniqueness">Uniqueness</option></select>:null}<select name="range" defaultValue={data.selectedRange} aria-label="Time range" className={`rounded-xl border border-white/10 bg-[#07182a] px-3 py-2 text-xs font-semibold ${focus}`}><option value="30d">30 days</option><option value="90d">90 days</option><option value="180d">6 months</option><option value="365d">12 months</option></select><button className={`rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white ${focus}`}>Apply</button></form></div><div className="mt-4"><TrendChart points={data.trend}/></div></article>
        <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">{persona.labels.changes}</p><h2 className="mt-1 text-lg font-black text-white">Key changes and evidence</h2></div><Link href={evidenceHref} className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link></div><div className="mt-4 space-y-2">{activity.slice(0,4).map(item=><Link key={item.id} href={item.href} data-track-recent="true" data-recent-label={item.label} className={`${inset} ${interactive} flex items-start gap-3 p-3`}><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${item.tone==='good'?'bg-emerald-400/10 text-emerald-300':item.tone==='warn'?'bg-rose-400/10 text-rose-300':'bg-blue-400/10 text-blue-300'}`}>{item.tone==='good'?<CheckCircle2 className="h-4 w-4"/>:item.tone==='warn'?<AlertTriangle className="h-4 w-4"/>:<Activity className="h-4 w-4"/>}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-200">{item.label}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{item.detail}</span></span><span className="text-[10px] text-slate-600">{item.when}</span></Link>)}{!activity.length?<p className={`${inset} p-4 text-sm text-slate-500`}>No recent governed evidence is available.</p>:null}</div></article></section>

      {selectedDataset&&datasetFilters?<section className={`${surface} mt-5 p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-violet-300">Dataset summary</p><h2 className="mt-1 text-lg font-black text-white">{selectedDataset.name}</h2><p className="mt-1 text-xs text-slate-500">{selectedDataset.domain} · {selectedDataset.certificationStatus} · {selectedDataset.criticality} criticality</p></div><Link href={selectedDataset.latestRunId?safeHref(`/profiling/explorer?runId=${encodeURIComponent(selectedDataset.latestRunId)}`,selectedDatasetHref):selectedDatasetHref} className={`${button} bg-violet-600 text-white`}>Open dataset evidence <ArrowRight className="h-4 w-4"/></Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{persona.slug==='data-quality-analyst'?<><EvidenceTile href={selectedDataset.latestRunId?safeHref(`/profiling/explorer?runId=${encodeURIComponent(selectedDataset.latestRunId)}`,selectedDatasetHref):selectedDatasetHref} icon={<Gauge className="h-5 w-5"/>} label="Completeness" value={numeric(selectedDataset.completeness)} detail="Latest scored evidence"/><EvidenceTile href={selectedDataset.latestRunId?safeHref(`/profiling/explorer?runId=${encodeURIComponent(selectedDataset.latestRunId)}`,selectedDatasetHref):selectedDatasetHref} icon={<CheckCircle2 className="h-5 w-5"/>} label="Validity" value={numeric(selectedDataset.validity)} detail="Latest scored evidence"/><EvidenceTile href={selectedDatasetHref} icon={<ClipboardCheck className="h-5 w-5"/>} label="Accuracy" value={numeric(selectedDataset.accuracy)} detail="Governed dataset evidence"/><EvidenceTile href={selectedDatasetHref} icon={<Layers3 className="h-5 w-5"/>} label="Uniqueness" value={numeric(selectedDataset.uniqueness)} detail="Governed dataset evidence"/></>:<><EvidenceTile href={safeHref('/glossary',selectedDatasetHref)} icon={<BookOpen className="h-5 w-5"/>} label="Glossary mappings" value={String(selectedDataset.approvedGlossaryMappings)} detail="Approved mappings for this dataset"/><EvidenceTile href={safeHref('/classification',selectedDatasetHref)} icon={<Tag className="h-5 w-5"/>} label="Classifications" value={String(selectedDataset.approvedClassifications)} detail="Approved classification evidence"/><EvidenceTile href={safeHref('/stewardship',selectedDatasetHref)} icon={<Users className="h-5 w-5"/>} label="Ownership" value={selectedDataset.hasOwner?'Assigned':'Missing'} detail="Business owner or steward assignment"/><EvidenceTile href={safeHref('/classification',selectedDatasetHref)} icon={<FileCheck2 className="h-5 w-5"/>} label="Critical data mappings" value={String(selectedDataset.cdeMappings)} detail="CDE mappings for this dataset"/></>}</div></section>:null}

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">{view.contextTitle}</h2><Link href="/catalog" className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead className="text-slate-500"><tr><th className="px-2 py-2">Business domain</th><th className="px-2 py-2">Datasets</th><th className="px-2 py-2">Confidence</th><th className="px-2 py-2">High findings</th><th/></tr></thead><tbody>{data.domains.slice(0,7).map(domain=><tr key={domain.name} className="border-t border-white/[0.06]"><td className="px-2 py-2.5 font-bold text-slate-200">{domain.name}</td><td className="px-2 py-2.5 text-slate-400">{domain.assets}</td><td className="px-2 py-2.5 text-slate-300">{pct(domain.confidence)}</td><td className="px-2 py-2.5 text-slate-300">{domain.highFindings}</td><td className="px-2 py-2.5 text-right"><Link href={`/catalog?q=${encodeURIComponent(domain.name)}`} aria-label={`Open ${domain.name} domain`} className={`inline-grid h-8 w-8 place-items-center rounded-lg text-blue-300 hover:bg-white/[0.06] ${focus}`}><ArrowRight className="h-4 w-4"/></Link></td></tr>)}</tbody></table>{!data.domains.length?<p className="p-4 text-sm text-slate-500">Business-domain evidence will appear as datasets are assigned to domains.</p>:null}</div></article>
        <div className="space-y-5"><article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">{view.attentionTitle}</h2><Link href="/issues" className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link></div><div className="mt-4 space-y-2">{findings.length?findings.map((finding,index)=><Link key={finding.id} href={finding.href} className={`${inset} ${interactive} flex items-start gap-3 p-3`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-400/10 text-xs font-black text-rose-300">{index+1}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-200">{finding.title}</span><span className="mt-1 line-clamp-2 block text-xs text-slate-500">{finding.description}</span></span><span className="rounded-lg bg-rose-400/10 px-2 py-1 text-[10px] font-bold text-rose-300">{finding.severity}</span></Link>):<p className={`${inset} p-4 text-sm text-slate-500`}>No material finding currently requires attention.</p>}</div></article>
          <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black text-white">Business impact</h2><Link href={safeHref('/lineage','/catalog')} className={`text-xs font-bold text-blue-300 ${focus}`}>{canAccessWorkspaceHref(persona.slug,'/lineage',orgRole)?'View lineage':'View governed data'}</Link></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{impacts.length?impacts.slice(0,4).map(item=><Link key={item.label} href={item.href} className={`${inset} ${interactive} flex items-center justify-between gap-3 p-3`}><span><span className="block text-xl font-black text-white">{item.count}</span><span className="text-xs text-slate-500">{item.label}</span></span><ArrowRight className="h-4 w-4 text-blue-300"/></Link>):<p className="col-span-full text-sm text-slate-500">No governed business-context links are available for the current scope.</p>}</div></article></div></section>

      <section className="mt-5 rounded-[22px] border border-violet-400/30 bg-gradient-to-r from-violet-700/25 via-blue-700/20 to-cyan-500/10 p-5"><div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><Sparkles className="h-6 w-6"/></span><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200">Decision / action</p><p className="mt-1 text-lg font-black text-white">{primaryFinding?.title??view.actionTitle}</p><p className="mt-1 max-w-3xl text-xs text-slate-400">{primaryFinding?.description??'No material finding currently requires a decision. Open the appropriate governed workspace to continue.'}</p></div></div><Link href={primaryFinding?.href??safeHref(view.actionHref)} className={`${button} bg-gradient-to-r from-violet-600 to-blue-600 text-white`}>{view.actionTitle}<ArrowRight className="h-4 w-4"/></Link></div></section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3"><article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="font-black text-white">Governance evidence</h2><Link href="/catalog" className={`text-xs font-bold text-blue-300 ${focus}`}>Explore</Link></div><div className="mt-4 grid grid-cols-2 gap-2"><EvidenceTile href="/catalog?q=CERTIFIED" icon={<ShieldCheck className="h-4 w-4"/>} label="Certified" value={String(data.certifiedDatasets)} detail="datasets"/><EvidenceTile href={safeHref('/classification','/catalog')} icon={<Tag className="h-4 w-4"/>} label="CDE mappings" value={String(data.cdeMappings)} detail="critical data"/><EvidenceTile href={safeHref('/glossary','/catalog')} icon={<BookOpen className="h-4 w-4"/>} label="Glossary" value={String(data.approvedGlossaryMappings)} detail="approved mappings"/><EvidenceTile href={safeHref('/classification','/catalog')} icon={<FileCheck2 className="h-4 w-4"/>} label="Classifications" value={String(data.approvedClassifications)} detail="approved evidence"/></div></article>
        <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="font-black text-white">Open governance decisions</h2><Link href={safeHref('/stewardship','/issues')} className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link></div><div className="mt-4 space-y-2"><Link href={safeHref('/stewardship','/issues')} className={`${inset} ${interactive} flex items-center justify-between p-3`}><span className="text-xs font-semibold text-slate-400">Certification requests</span><span className="text-lg font-black text-white">{data.pendingCertifications}</span></Link><Link href={safeHref('/audit','/issues')} className={`${inset} ${interactive} flex items-center justify-between p-3`}><span className="text-xs font-semibold text-slate-400">Control waivers</span><span className="text-lg font-black text-white">{data.pendingWaivers}</span></Link><Link href="/issues" className={`${inset} ${interactive} flex items-center justify-between p-3`}><span className="text-xs font-semibold text-slate-400">Unresolved issues</span><span className="text-lg font-black text-white">{data.unresolvedIssues}</span></Link></div></article>
        <article className={`${surface} p-5`}><div className="flex items-center justify-between gap-3"><h2 className="font-black text-white">Recent activity</h2><Link href={evidenceHref} className={`text-xs font-bold text-blue-300 ${focus}`}>View all</Link></div><div className="mt-4 space-y-2">{activity.slice(0,4).map(item=><Link key={item.id} href={item.href} className={`${inset} ${interactive} flex items-center justify-between gap-3 p-3`}><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-200">{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-slate-600">{item.detail}</span></span><span className="shrink-0 text-[10px] text-slate-600">{item.when}</span></Link>)}{!activity.length?<p className="text-xs text-slate-500">No recent governed activity is available.</p>:null}</div></article></section>
      <footer className={`${surface} mt-5 flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-slate-600`}><span>DataNexus AI · governed evidence translated into role-specific decisions.</span><Link href={safeHref(view.actionHref)} className={`font-bold text-cyan-300 ${focus}`}>Continue working <ArrowRight className="ml-1 inline h-3 w-3"/></Link></footer>
    </section>
  </div></main>
}
