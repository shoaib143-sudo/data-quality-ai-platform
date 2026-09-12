'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Loader2, MessageSquare, Plus, Save } from 'lucide-react'
import type { FindingsIssuesPresentation } from '@/lib/governance/persona-findings-issues-presentation'

type Project = { id: string; name: string; organization_id: string }
type Dataset = { id: string; project_id: string; name: string }
type Member = { organization_id: string; user_id: string; role: string }
type Comment = { id: string; comment: string; created_at: string; user_id: string | null }
type Issue = { id: string; project_id: string; dataset_id: string | null; title: string; description: string | null; severity: string; status: string; owner_user_id: string | null; due_at: string | null; resolution_summary: string | null; created_at: string; issue_comments: Comment[] }

const severityRank: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 }
const statusRank: Record<string, number> = { BLOCKED: 6, OPEN: 5, TRIAGED: 4, IN_PROGRESS: 3, RESOLVED: 2, CLOSED: 1 }

function issueComparator(focus: FindingsIssuesPresentation['primaryFocus']) {
  return (a: Issue, b: Issue) => {
    const unresolvedA = ['RESOLVED', 'CLOSED'].includes(a.status) ? 0 : 1
    const unresolvedB = ['RESOLVED', 'CLOSED'].includes(b.status) ? 0 : 1
    if (unresolvedA !== unresolvedB) return unresolvedB - unresolvedA
    if (focus === 'technical' || focus === 'remediation' || focus === 'decision') {
      const statusDelta = (statusRank[b.status] ?? 0) - (statusRank[a.status] ?? 0)
      if (statusDelta) return statusDelta
    }
    const severityDelta = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0)
    if (severityDelta) return severityDelta
    return b.created_at.localeCompare(a.created_at)
  }
}

export function IssueManager({ projects, datasets, members, initialIssues, manageableProjectIds, presentation }: {
  projects: Project[]
  datasets: Dataset[]
  members: Member[]
  initialIssues: Issue[]
  manageableProjectIds: string[]
  presentation: FindingsIssuesPresentation
}) {
  const manageable = useMemo(() => new Set(manageableProjectIds), [manageableProjectIds])
  const manageableProjects = projects.filter(project => manageable.has(project.id))
  const [issues, setIssues] = useState(initialIssues)
  const displayIssues = useMemo(() => [...issues].sort(issueComparator(presentation.primaryFocus)), [issues, presentation.primaryFocus])
  const [projectId, setProjectId] = useState(manageableProjects[0]?.id ?? '')
  const project = projects.find(p => p.id === projectId)
  const projectDatasets = datasets.filter(d => d.project_id === projectId)
  const [datasetId, setDatasetId] = useState(projectDatasets[0]?.id ?? '')
  const effectiveDatasetId = projectDatasets.some(d => d.id === datasetId) ? datasetId : projectDatasets[0]?.id ?? ''
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('MEDIUM')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const datasetById = useMemo(() => new Map(datasets.map(d => [d.id, d])), [datasets])

  async function refresh(changedProjectId: string) {
    const r = await fetch(`/api/issues?projectId=${encodeURIComponent(changedProjectId)}`)
    const p = await r.json()
    if (!r.ok) throw new Error(p.error ?? 'Unable to refresh issues.')
    setIssues(current => [...current.filter(issue => issue.project_id !== changedProjectId), ...(p.issues ?? [])])
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!manageable.has(projectId)) { setMessage('You do not have remediation authority for this project.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, datasetId: effectiveDatasetId || null, title, description, severity }) })
      const p = await r.json()
      if (!r.ok) throw new Error(p.error ?? 'Issue creation failed.')
      setTitle(''); setDescription(''); setMessage('Issue created.')
      await refresh(projectId)
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Issue creation failed.') } finally { setBusy(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const issue = issues.find(item => item.id === id)
    if (!issue || !manageable.has(issue.project_id)) throw new Error('You do not have remediation authority for this issue.')
    const r = await fetch(`/api/issues/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const p = await r.json()
    if (!r.ok) throw new Error(p.error ?? 'Issue update failed.')
    await refresh(issue.project_id)
  }

  async function comment(id: string, text: string) {
    const issue = issues.find(item => item.id === id)
    if (!issue || !manageable.has(issue.project_id)) throw new Error('You do not have remediation authority for this issue.')
    const r = await fetch(`/api/issues/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: text }) })
    const p = await r.json()
    if (!r.ok) throw new Error(p.error ?? 'Comment failed.')
    await refresh(issue.project_id)
  }

  const openCount = issues.filter(issue => !['RESOLVED', 'CLOSED'].includes(issue.status)).length
  const highCount = issues.filter(issue => ['CRITICAL', 'HIGH'].includes(issue.severity)).length

  return <div className={`mt-6 grid gap-6 ${manageableProjects.length ? 'lg:grid-cols-[0.75fr_1.25fr]' : 'lg:grid-cols-1'}`}>
    {manageableProjects.length ? <form onSubmit={create} className="rounded-3xl border border-white/10 bg-[#0a1d33] p-6 shadow-sm"><h2 className="text-xl font-bold text-white">Create remediation issue</h2><div className="mt-5 grid gap-3"><select value={projectId} onChange={e => { setProjectId(e.target.value); setDatasetId('') }} className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-slate-200">{manageableProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={effectiveDatasetId} onChange={e => setDatasetId(e.target.value)} className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-slate-200"><option value="">Project-level issue</option>{projectDatasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title" className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-slate-200"/><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description and business impact" rows={4} className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-slate-200"/><select value={severity} onChange={e => setSeverity(e.target.value)} className="rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-slate-200"><option>INFO</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 font-bold text-white hover:bg-amber-500 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}Create issue</button>{message ? <p className="text-sm text-slate-400">{message}</p> : null}</div></form> : null}
    <section className="rounded-3xl border border-white/10 bg-[#0a1d33] p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-white">{presentation.primaryFocus === 'discovery' ? 'Known issue evidence' : 'Prioritized issue queue'}</h2><p className="mt-1 text-xs text-slate-500">{openCount} open · {highCount} critical/high · ordered for {presentation.primaryFocus.replaceAll('-', ' ')}</p></div>{manageableProjects.length === 0 ? <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-bold text-blue-300">Read-only evidence</span> : null}</div><div className="mt-5 space-y-3">{displayIssues.map(issue => { const issueProject = projects.find(project => project.id === issue.project_id); const issueMembers = members.filter(member => member.organization_id === issueProject?.organization_id); return <IssueCard key={issue.id} issue={issue} datasetName={issue.dataset_id ? datasetById.get(issue.dataset_id)?.name ?? issue.dataset_id : 'Project'} members={issueMembers} canManage={manageable.has(issue.project_id)} presentation={presentation} onPatch={patch} onComment={comment}/> })}</div></section>
  </div>
}

function IssueCard({ issue, datasetName, members, canManage, presentation, onPatch, onComment }: { issue: Issue; datasetName: string; members: Member[]; canManage: boolean; presentation: FindingsIssuesPresentation; onPatch: (id: string, body: Record<string, unknown>) => Promise<void>; onComment: (id: string, text: string) => Promise<void> }) {
  const [comment, setComment] = useState('')
  const [resolution, setResolution] = useState(issue.resolution_summary ?? '')
  return <article className="rounded-2xl border border-white/[0.08] bg-[#08182b] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-200">{issue.title}</h3><span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-xs font-bold text-rose-300">{issue.severity}</span><span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-xs font-bold text-slate-400">{issue.status}</span></div><p className="mt-1 text-sm text-slate-400">{issue.description ?? 'No description.'}</p><p className="mt-2 text-xs text-slate-500">{datasetName} · opened {new Date(issue.created_at).toLocaleString()}</p>{presentation.showOwnership ? <p className="mt-1 text-xs text-slate-500">Owner: {issue.owner_user_id ? `${issue.owner_user_id.slice(0, 8)}…` : 'Unassigned'}</p> : null}{presentation.showTechnicalContext ? <p className="mt-1 font-mono text-[11px] text-slate-600">issue {issue.id} · project {issue.project_id}{issue.dataset_id ? ` · dataset ${issue.dataset_id}` : ''}</p> : null}</div>{canManage ? <div className="flex flex-wrap gap-2">{presentation.showOwnership ? <select defaultValue={issue.owner_user_id ?? ''} onChange={e => void onPatch(issue.id, { ownerUserId: e.target.value || null })} className="rounded-lg border border-white/10 bg-[#061426] px-2 py-1.5 text-xs text-slate-300"><option value="">Unassigned</option>{members.map(m => <option key={m.user_id + m.role} value={m.user_id}>{m.user_id.slice(0, 8)} · {m.role}</option>)}</select> : null}<select value={issue.status} onChange={e => void onPatch(issue.id, { status: e.target.value })} className="rounded-lg border border-white/10 bg-[#061426] px-2 py-1.5 text-xs text-slate-300"><option>OPEN</option><option>TRIAGED</option><option>IN_PROGRESS</option><option>BLOCKED</option><option>RESOLVED</option><option>CLOSED</option></select></div> : null}</div>{issue.resolution_summary ? <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05] p-3 text-sm text-slate-300"><span className="font-bold text-emerald-300">Resolution evidence:</span> {issue.resolution_summary}</div> : null}{canManage ? <><div className="mt-3 grid gap-2 rounded-xl border border-white/[0.06] bg-[#061426] p-3"><textarea value={resolution} onChange={e => setResolution(e.target.value)} rows={2} placeholder="Resolution summary / evidence narrative" className="rounded-lg border border-white/10 bg-[#08182b] px-3 py-2 text-sm text-slate-200"/><button onClick={() => void onPatch(issue.id, { resolutionSummary: resolution, status: 'RESOLVED', resolutionEvidence: { recorded_at: new Date().toISOString() } })} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Save className="h-3.5 w-3.5"/>Resolve with evidence</button></div><div className="mt-3 flex gap-2"><input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add comment" className="flex-1 rounded-lg border border-white/10 bg-[#061426] px-3 py-2 text-sm text-slate-200"/><button aria-label="Add comment" onClick={() => { if (comment.trim()) { void onComment(issue.id, comment); setComment('') } }} className="rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:border-cyan-400/30"><MessageSquare className="h-4 w-4"/></button></div></> : null}{issue.issue_comments?.length ? <div className="mt-3 space-y-1">{issue.issue_comments.slice(-3).map(c => <p key={c.id} className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-slate-400">{c.comment}</p>)}</div> : null}</article>
}
