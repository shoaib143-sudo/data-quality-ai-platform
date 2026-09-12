import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleAlert, GitBranch, Layers3, ShieldCheck } from 'lucide-react'
import { hasProjectCapability } from '@/lib/auth/authorize'
import { loadGovernedIncident } from '@/lib/governance/governed-incident-reader'
import { buildGovernedIncidentView } from '@/lib/governance/governed-incident-view'
import type { GovernedIncident } from '@/lib/governance/governed-incident'
import type { IncidentComponentDefinition } from '@/lib/governance/incident-component-registry'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

function label(value: string | null | undefined) {
  return value ? value.replaceAll('_', ' ').toLowerCase() : 'not recorded'
}

function Metric({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-[#08182b] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{title}</p><p className="mt-2 text-xl font-black text-white">{value}</p>{detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}</div>
}

function Section({ definition, children }: { definition: IncidentComponentDefinition; children: React.ReactNode }) {
  return <section id={definition.id} className="rounded-3xl border border-white/10 bg-[#0a1d33] p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-white">{definition.id.replaceAll('-', ' ')}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{definition.purpose}</p></div><span className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em] text-slate-500">read only · authority external</span></div><div className="mt-5">{children}</div></section>
}

function EvidenceList({ incident, authority }: { incident: GovernedIncident; authority?: string }) {
  const evidence = authority ? incident.evidence.filter(item => item.authority === authority) : incident.evidence
  if (!evidence.length) return <p className="text-sm text-slate-500">No governed evidence of this type is linked to the incident.</p>
  return <div className="space-y-2">{evidence.map((item, index) => <div key={`${item.sourceTable}:${item.sourceId}:${item.kind}:${index}`} className="rounded-xl border border-white/[0.06] bg-[#08182b] px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[.1em] text-cyan-300">{item.authority}</span><span className="text-xs font-bold text-slate-300">{item.kind.replaceAll('_', ' ')}</span><span className="text-[10px] text-slate-600">{item.deterministic ? 'deterministic evidence' : 'advisory/probabilistic evidence'}</span></div><p className="mt-2 break-all font-mono text-[11px] text-slate-500">{item.sourceTable} · {item.sourceId}</p>{item.observedAt ? <p className="mt-1 text-[11px] text-slate-600">Observed {new Date(item.observedAt).toLocaleString()}</p> : null}</div>)}</div>
}

function IncidentComponent({ definition, incident, canManage }: { definition: IncidentComponentDefinition; incident: GovernedIncident; canManage: boolean }) {
  const truth = incident.truth
  switch (definition.id) {
    case 'incident-summary':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-3"><Metric title="Lifecycle" value={label(truth.lifecycleState)} detail="Derived only from governed issue/remediation/verification state."/><Metric title="Issue state" value={label(truth.issueStatus)}/><Metric title="Severity" value={truth.severity}/></div><div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#08182b] p-4"><p className="font-bold text-slate-200">{incident.title}</p><p className="mt-2 text-sm leading-6 text-slate-400">{incident.description ?? 'No governed description recorded.'}</p></div></Section>
    case 'trust-summary':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-3"><Metric title="Verification required" value={incident.verification.required ? 'Yes' : 'No'}/><Metric title="Verification state" value={label(incident.verification.status)}/><Metric title="Lifecycle" value={label(truth.lifecycleState)} detail="This view does not infer certification or fitness for use beyond linked evidence."/></div></Section>
    case 'risk-summary':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-3"><Metric title="Governed severity" value={truth.severity}/><Metric title="Linked impacts" value={String(incident.impactEvidence.length)}/><Metric title="Root-cause evidence" value={String(incident.rootCauseEvidence.length)} detail="Advisory causes remain labelled advisory."/></div></Section>
    case 'issue-queue':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-3"><Metric title="Issue state" value={label(truth.issueStatus)}/><Metric title="Owner" value={truth.ownerUserId ? `${truth.ownerUserId.slice(0, 8)}…` : 'Unassigned'}/><Metric title="Mutation authority" value={canManage ? 'Authorized separately' : 'Read only'} detail="Persona presentation never grants remediation authority."/></div></Section>
    case 'evidence-panel':
      return <Section definition={definition}><EvidenceList incident={incident}/></Section>
    case 'root-cause-panel':
      return <Section definition={definition}>{incident.rootCauseEvidence.length ? <div className="space-y-3">{incident.rootCauseEvidence.map((cause, index) => <div key={`${cause.sourceId}:${index}`} className="rounded-2xl border border-white/[0.06] bg-[#08182b] p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-slate-200">{cause.explanation}</span>{cause.advisory ? <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[.1em] text-amber-300">advisory</span> : null}</div><p className="mt-2 text-xs text-slate-500">{cause.authority} · {cause.sourceTable} · confidence {cause.confidence ?? 'not recorded'}</p></div>)}</div> : <p className="text-sm text-slate-500">No root-cause evidence is linked. The presentation layer will not invent one.</p>}</Section>
    case 'lineage-impact':
      return <Section definition={definition}>{incident.impactEvidence.length ? <div className="space-y-2">{incident.impactEvidence.map((impact, index) => <div key={`${impact.sourceId}:${impact.assetId}:${index}`} className="rounded-xl border border-white/[0.06] bg-[#08182b] px-4 py-3"><p className="font-bold text-slate-200">{impact.assetName ?? impact.assetId}</p><p className="mt-1 text-xs text-slate-500">{impact.assetType} · {impact.relationship ?? 'linked impact'} · distance {impact.distance ?? 'n/a'} · risk {impact.riskScore ?? 'n/a'}</p></div>)}</div> : <p className="text-sm text-slate-500">No authoritative lineage or business-context impact is linked to this incident.</p>}</Section>
    case 'decision-card':
      return <Section definition={definition}><div className="rounded-2xl border border-blue-400/10 bg-blue-400/[0.04] p-4"><p className="font-bold text-blue-200">Decision context</p><p className="mt-2 text-sm leading-6 text-slate-400">Current owner: {truth.ownerUserId ? `${truth.ownerUserId.slice(0, 8)}…` : 'unassigned'}. Current issue state: {label(truth.issueStatus)}. Any approval or mutation remains governed by the workspace authorization layer.</p></div></Section>
    case 'remediation-plan':
      return <Section definition={definition}>{incident.remediationEvidence.length ? <div className="space-y-2">{incident.remediationEvidence.map((item, index) => <div key={`${item.sourceId}:${index}`} className="rounded-xl border border-white/[0.06] bg-[#08182b] px-4 py-3"><p className="font-bold text-slate-200">{item.action ?? item.kind.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500">Status {label(item.status)}{item.workflowInstanceId ? ` · workflow ${item.workflowInstanceId}` : ''}</p></div>)}</div> : <p className="text-sm text-slate-500">No governed remediation outcome is linked yet.</p>}</Section>
    case 'verification-panel':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Required" value={incident.verification.required ? 'Yes' : 'No'}/><Metric title="Status" value={label(incident.verification.status)}/><Metric title="Quality delta" value={incident.verification.qualityScoreDelta == null ? 'N/A' : String(incident.verification.qualityScoreDelta)}/><Metric title="High-severity delta" value={incident.verification.highSeverityFindingsDelta == null ? 'N/A' : String(incident.verification.highSeverityFindingsDelta)}/></div><div className="mt-4 rounded-2xl border border-white/[0.06] bg-[#08182b] p-4 text-xs text-slate-500"><p>Baseline run: <span className="font-mono">{incident.verification.sourceRunId ?? 'not linked'}</span></p><p className="mt-1">Verification run: <span className="font-mono">{incident.verification.verificationRunId ?? 'not linked'}</span></p>{incident.verification.verifiedAt ? <p className="mt-1">Verified {new Date(incident.verification.verifiedAt).toLocaleString()}</p> : null}</div></Section>
    case 'control-status':
      return <Section definition={definition}><EvidenceList incident={incident} authority="CONTROL"/></Section>
    case 'execution-state':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-3"><Metric title="Lifecycle" value={label(truth.lifecycleState)}/><Metric title="Issue state" value={label(truth.issueStatus)}/><Metric title="Verification" value={label(incident.verification.status)}/></div></Section>
    case 'quality-trend':
      return <Section definition={definition}><div className="grid gap-3 sm:grid-cols-2"><Metric title="Quality score delta" value={incident.verification.qualityScoreDelta == null ? 'N/A' : String(incident.verification.qualityScoreDelta)} detail="Only persisted remediation comparison evidence is shown."/><Metric title="High-severity findings delta" value={incident.verification.highSeverityFindingsDelta == null ? 'N/A' : String(incident.verification.highSeverityFindingsDelta)}/></div></Section>
    case 'governance-history':
      return <Section definition={definition}><EvidenceList incident={incident}/></Section>
    default:
      return null
  }
}

export default async function GovernedIncidentPage({ params }: { params: Promise<{ issueId: string }> }) {
  const user = await requireUser()
  const { issueId } = await params
  const supabase = await createClient()
  const landing = await resolveLandingAccess(user.id)

  const issueResult = await supabase.schema('governance').from('issues')
    .select('id,project_id')
    .eq('id', issueId)
    .maybeSingle()
  if (issueResult.error) throw new Error(issueResult.error.message)
  if (!issueResult.data) notFound()

  const projectId = String(issueResult.data.project_id)
  const projectResult = await supabase.schema('app').from('projects')
    .select('id,organization_id,name')
    .eq('id', projectId)
    .eq('organization_id', landing.organizationId)
    .maybeSingle()
  if (projectResult.error) throw new Error(projectResult.error.message)
  if (!projectResult.data) notFound()

  const incident = await loadGovernedIncident({ projectId, issueId })
  if (!incident) notFound()
  const view = buildGovernedIncidentView(incident, landing.persona)
  const canManage = await hasProjectCapability(user.id, projectId, 'issues.manage')

  return <main className="min-h-screen bg-[#061426] text-slate-100"><div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1d33] px-5 py-3"><Link href="/issues" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white"><ArrowLeft className="h-4 w-4"/>Issues</Link><Link href="/home" className="flex items-center gap-2 font-bold text-white"><Layers3 className="h-5 w-5 text-cyan-300"/>DataNexus AI</Link></nav>

    <header className="rounded-3xl border border-white/10 bg-[#0a1d33] p-7 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-cyan-300">{view.plan.persona.replaceAll('-', ' ')}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-slate-400">{view.plan.abstraction}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.12em] text-slate-400">policy v{view.presentationPolicyVersion}</span></div><h1 className="mt-4 text-3xl font-black text-white">{incident.title}</h1><p className="mt-3 text-base leading-7 text-slate-300">{view.plan.primaryQuestion}</p><p className="mt-3 text-sm leading-6 text-slate-500">{incident.description ?? 'No governed incident description recorded.'}</p></div><div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-emerald-300"><ShieldCheck className="h-4 w-4"/>Governed incident</div><p className="mt-2 text-xs text-slate-500">{incident.truthBoundary} · {incident.authorizationBoundary}</p><p className="mt-1 text-xs text-slate-600">{canManage ? 'Mutation authority independently verified' : 'Read-only evidence access'}</p></div></div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Lifecycle" value={label(incident.truth.lifecycleState)}/><Metric title="Severity" value={incident.truth.severity}/><Metric title="Issue state" value={label(incident.truth.issueStatus)}/><Metric title="Verification" value={label(incident.verification.status)}/></div>
      <div className="mt-5 flex flex-wrap gap-2">{view.plan.actionEmphasis.map(item => <span key={item} className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-300">{item.replaceAll('-', ' ')}</span>)}</div>
    </header>

    <div className="mt-6 grid gap-5">{view.components.map(definition => <IncidentComponent key={definition.id} definition={definition} incident={incident} canManage={canManage}/>)}</div>

    <footer className="mt-6 rounded-2xl border border-white/[0.07] bg-[#08182b] p-4 text-xs text-slate-600"><div className="flex flex-wrap items-center gap-2"><GitBranch className="h-3.5 w-3.5"/><span>Issue {incident.truth.issueId}</span><span>·</span><span>Project {projectResult.data.name}</span><span>·</span><span>Evidence v{incident.evidenceVersion}</span>{view.plan.evidenceDepth === 'technical' || view.plan.evidenceDepth === 'diagnostic' ? <><span>·</span><span className="break-all font-mono">truth {view.truthFingerprint}</span></> : null}</div><p className="mt-2 flex items-center gap-1.5"><CircleAlert className="h-3.5 w-3.5"/>Presentation changes by persona; severity, issue state, evidence, ownership and verification truth do not.</p>{incident.truth.lifecycleState === 'VERIFIED_RESOLVED' ? <p className="mt-2 flex items-center gap-1.5 text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5"/>Resolution is backed by authoritative verification evidence.</p> : null}</footer>
  </div></main>
}
