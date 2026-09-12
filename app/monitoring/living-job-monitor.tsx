'use client'

import { useCallback, useEffect, useState } from 'react'
import { displayState, runProgress, TERMINAL, type Run, type Snapshot, type Step } from '@/lib/monitoring/execution-contract'
import { ExecutionTree, STATE_COLORS } from './execution-tree'
import { useMonitorPoll } from './use-monitor-poll'
import { JobLogs } from './job-logs'
import { JobTermination } from './job-termination'
import type { MonitoringAgent, MonitoringDataset, MonitoringRun } from './job-monitor'
import './execution-tree.css'

type Detail = {
  checkpoints?: {id: string; checkpoint_seq: number; checkpoint_kind: string}[]
  events?: {id: string; event_type: string; attempt: number | null}[]
  diagnosticWarnings?: string[]; steps: Step[]
  attempts: {evidenceId: string; stepId: string | null; attempt: number | null; status: string | null; error_code: string | null; started_at?: string | null; completed_at?: string | null}[]
  historyCoverage: string; nextOffset: number | null
}
type Props = {
  initialRuns: Run[]; initialRunId?: string | null; initialBranchId?: string | null
  initialAgents: MonitoringAgent[]; initialDatasets: MonitoringDataset[]
  initialSnapshot?: Snapshot | null; initialError?: string | null; initialProjectId?: string
  projects?: {id: string; name: string}[]; treeEnabled?: boolean
}
const isTerminal = (snapshot: Snapshot) => !snapshot.truncated && snapshot.runs.every(run => TERMINAL.has(run.status))
const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Not recorded'

export function LivingJobMonitor({initialRuns, initialRunId, initialBranchId, initialAgents, initialDatasets, initialSnapshot = null, initialError = null, initialProjectId, projects = [], treeEnabled = true}: Props) {
  const [projectId, setProjectId] = useState(initialProjectId ?? initialSnapshot?.runs[0]?.project_id ?? initialRuns[0]?.project_id ?? '')
  const [runId, setRunId] = useState(initialSnapshot?.rootId ?? initialRunId ?? initialRuns[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState(initialBranchId ?? initialRunId ?? initialRuns[0]?.id ?? '')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(100)
  const [view, setView] = useState<'tree' | 'list'>(treeEnabled ? 'tree' : 'list')
  const [allLinks, setAllLinks] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState(0)
  const [rootOffset, setRootOffset] = useState(0)
  const [filter, setFilter] = useState('')
  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 3000); return () => clearInterval(timer) }, [])
  const tree = useMonitorPoll<Snapshot>(runId ? `/api/monitoring/executions/${encodeURIComponent(runId)}?limit=${limit}` : null, 3000, refreshKey, isTerminal)
  const snapshot = tree.data ?? (initialSnapshot?.rootId === runId ? initialSnapshot : null)
  const summaries = useMonitorPoll<{runs: Run[]; nextOffset: number | null}>(projectId ? `/api/monitoring/executions?projectId=${projectId}&offset=${rootOffset}&status=${filter}` : null, 15000, refreshKey)
  const runs = summaries.data?.runs ?? (rootOffset === 0 && !filter ? initialRuns.filter(r => r.project_id === projectId) : [])
  const rootId = snapshot?.rootId
  const selected = snapshot?.runs.find(r => r.id === selectedId)
  const detailResult = useMonitorPoll<Detail>(rootId && selectedId ? `/api/monitoring/executions/${rootId}/branches/${selectedId}?offset=${offset}` : null, 5000, refreshKey, () => TERMINAL.has(selected?.status ?? ''))
  const detail = detailResult.data
  useEffect(() => {
    if (!snapshot || selected) return
    if (snapshot.truncated && limit < 1000) setLimit(l => Math.min(1000, l + 100))
    // Preserve a deep-linked child even outside the visible window. Its authorized
    // detail endpoint can still be inspected; never silently select a different job.
  }, [snapshot, selected, limit])
  const selectBranch = (id: string) => {
    setSelectedId(id); setOffset(0); setShowLogs(false)
    if (rootId) { const url = new URL(window.location.href); url.searchParams.set('run', rootId); url.searchParams.set('branch', id); window.history.replaceState(null, '', url) }
  }
  const selectRoot = (id: string) => {
    setRunId(id); setSelectedId(id); setLimit(100); setOffset(0); setShowLogs(false)
    const url = new URL(window.location.href); url.searchParams.set('run', id); url.searchParams.delete('branch'); window.history.replaceState(null, '', url)
  }
  const selectProject = (id: string) => { setProjectId(id); setRootOffset(0); setRunId(''); setSelectedId(''); setShowLogs(false); setFilter('') }
  const stale = !!snapshot && (!isTerminal(snapshot) || !!tree.error) && now > 0 && now - (tree.receivedAt ?? Date.parse(snapshot.fetchedAt)) > 9000
  const progress = selected && snapshot ? runProgress(selected.id, snapshot) : null
  const currentRun: MonitoringRun | null = selected ? {...selected, dataset_version_id: null, error_message: null} : null
  const selectedAgent = selected ? initialAgents.find(a => a.id === selected.agent_definition_id) : null
  const agents = selected ? [selectedAgent ?? {id: selected.agent_definition_id, name: selected.name ?? 'Agent', version: '', agent_key: ''}] : []
  const error = tree.error ?? (!snapshot && initialRunId === runId ? initialError : null)
  const counts = snapshot?.runs.reduce<Record<string, number>>((result, run) => { const state = displayState(run, snapshot); result[state] = (result[state] ?? 0) + 1; return result }, {}) ?? {}
  return <section className="living-monitor">
    <header className="tree-header"><div><p className="tree-kicker">DataNexus AI / Operations</p><h2>Living Tree</h2><p className="tree-subtle">One tree per execution. Every branch is a recorded agent run.</p></div><div className="tree-controls">
      {projects.length ? <select aria-label="Monitoring project" value={projectId} onChange={e => selectProject(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}
      <select aria-label="Filter executions" value={filter} onChange={e => {setFilter(e.target.value); setRootOffset(0)}}><option value="">All states</option>{['CREATED','QUEUED','RUNNING','WAITING','SUCCEEDED','FAILED','CANCELLED'].map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Select execution" value={runId} onChange={e => selectRoot(e.target.value)}><option value="" disabled>Select execution</option>{!runs.some(r => r.id === runId) && runId ? <option value={runId}>Selected execution {runId.slice(0,8)}</option> : null}{runs.map(r => <option key={r.id} value={r.id}>{r.status} · {r.id.slice(0,8)}</option>)}</select>
      {treeEnabled ? <button onClick={() => setView(v => v === 'tree' ? 'list' : 'tree')}>{view === 'tree' ? 'List view' : 'Tree view'}</button> : null}<button onClick={refresh}>Refresh</button>
      <label className="tree-subtle"><input type="checkbox" checked={allLinks} onChange={e => setAllLinks(e.target.checked)}/> All dependencies</label>
      {rootOffset > 0 ? <button onClick={() => setRootOffset(o => Math.max(0,o-25))}>Newer executions</button> : null}{summaries.data?.nextOffset != null ? <button onClick={() => setRootOffset(summaries.data!.nextOffset!)}>Older executions</button> : null}
    </div></header>
    {summaries.error ? <p role="status" className="tree-warning">Execution list: {summaries.error}</p> : null}
    {error ? <p role="alert" className="tree-warning">{error}</p> : null}
    {stale ? <p role="status" className="tree-warning">Updates delayed. Showing last recorded state; animation paused.</p> : null}
    {snapshot?.warnings.map(w => <p key={w} className="tree-warning">{w}</p>)}
    {snapshot ? <div className="tree-summary"><strong>Execution: {snapshot.runs[0]?.status}</strong>{Object.entries(counts).map(([state, count]) => <span key={state}>{count} {state}</span>)}<span>{snapshot.truncated ? 'Loaded window' : 'Loaded hierarchy'}</span></div> : null}
    {!runId ? <p className="tree-row">{runs.length ? 'Select an execution to inspect its tree.' : 'No executions available for this project and filter.'}</p> : !snapshot ? <p className="tree-row">{error ? 'Use Refresh to retry, or select another execution.' : 'Loading execution hierarchy…'}</p> : <div className="tree-grid">
      <div><div hidden={view !== 'tree'}>{treeEnabled ? <ExecutionTree key={rootId} snapshot={snapshot} selectedId={selectedId} onSelect={selectBranch} stale={stale} allLinks={allLinks}/> : null}</div>
        {view === 'list' ? <div className="tree-list">{snapshot.runs.map(r => <button key={r.id} onClick={() => selectBranch(r.id)} aria-pressed={r.id === selectedId}><span style={{color: STATE_COLORS[displayState(r,snapshot)]}}>● </span>{r.name} · {displayState(r,snapshot)} <span className="tree-subtle">{r.id.slice(0,8)}</span></button>)}</div> : null}
        {snapshot.truncated && limit < 1000 ? <button className="tree-action" onClick={() => setLimit(l => Math.min(1000,l+100))}>Load more runs</button> : null}
        {snapshot.truncated && limit === 1000 ? <p className="tree-warning">Maximum tree window loaded. Branch diagnostics remain available by run link.</p> : null}
      </div>
      <aside className="tree-panel" aria-label="Selected branch details">
        {selected ? <><p className="tree-kicker">Selected job</p><h3>{selected.name}</h3><p style={{color:STATE_COLORS[displayState(selected,snapshot)]}}>{displayState(selected,snapshot).toUpperCase()}</p><p className="tree-subtle">Recorded state: {selected.status}</p><p className="tree-subtle" style={{overflowWrap:'anywhere'}}>Run: {selected.id}</p>
          <p className="tree-subtle">Started: {timestamp(selected.started_at)}</p><p className="tree-subtle">Finished: {timestamp(selected.completed_at)}</p>
          {selected.dataset_id ? <p className="tree-subtle">Dataset: {initialDatasets.find(d => d.id === selected.dataset_id)?.name ?? selected.dataset_id}</p> : null}
          {snapshot.waits.filter(w => w.runId === selected.id).map(w => <p key={w.reason}>Recorded wait: {w.reason}</p>)}
          {snapshot.edges.filter(e => e.target === selected.id).map(e => <p key={e.id}>{e.satisfied ? 'Satisfied' : 'Prerequisite unmet'}: {snapshot.runs.find(r => r.id === e.source)?.name ?? `${e.external ? 'External job/run' : 'Run'} ${e.source}`} ({e.condition === 'SUCCESS' ? 'must succeed' : 'must finish'})</p>)}
          <h4>Recorded progress</h4><p>{progress?.label}</p>{progress?.percent != null ? <progress aria-label="Planned step completion" value={progress.percent} max={100} style={{width:'100%'}}/> : null}
          {selected.error_code ? <p className="tree-warning">{selected.error_code}</p> : null}
        </> : <p className="tree-warning">Selected run is outside the loaded hierarchy. Available details are shown below.</p>}
        <h4>Execution steps</h4>{detailResult.error ? <p role="alert">{detailResult.error}</p> : null}{detail ? (detail.steps.length ? detail.steps.map(s => <div className="tree-row" key={s.id}><strong>{s.step_name}</strong><p>{s.status} · Attempt {s.attempt}</p><p className="tree-subtle">{timestamp(s.started_at)} to {timestamp(s.completed_at)}</p>{s.error_code ? <p>{s.error_code}</p> : null}</div>) : <p>No steps recorded on this page.</p>) : <p>Loading details…</p>}
        <h4>Runtime evidence</h4>{detail?.diagnosticWarnings?.map(w => <p key={w}>{w}</p>)}{detail?.checkpoints?.map(c => <p key={c.id}>Checkpoint {c.checkpoint_seq}: {c.checkpoint_kind}</p>)}{detail?.events?.map(e => <p key={e.id}>{e.event_type}{e.attempt ? ` · Attempt ${e.attempt}` : ''}</p>)}
        <h4>Previous attempt snapshots</h4><p className="tree-subtle">{detail?.historyCoverage ?? 'Loading evidence…'}</p>{detail?.attempts.map(a => <div className="tree-row" key={a.evidenceId}>Step {a.stepId?.slice(0,8) ?? '?'} · Attempt {a.attempt ?? '?'} · {a.status ?? 'Unknown'}<p className="tree-subtle">{timestamp(a.started_at)} to {timestamp(a.completed_at)}</p>{a.error_code ? <p>{a.error_code}</p> : null}</div>)}
        <div className="tree-controls">{offset > 0 ? <button onClick={() => setOffset(o => Math.max(0,o-100))}>Previous details</button> : null}{detail?.nextOffset != null ? <button onClick={() => setOffset(detail.nextOffset!)}>More details</button> : null}{selected ? <button onClick={() => setShowLogs(v => !v)}>{showLogs ? 'Hide' : 'Open'} diagnostics</button> : null}</div>
      </aside></div>}
    <footer className="tree-legend">{Object.entries(STATE_COLORS).map(([state,color]) => <span key={state}><span style={{color}}>● </span>{state}</span>)}<span>Dotted arrows: prerequisites</span><span>Solid branches: ownership</span>{snapshot ? <span>Fetched {timestamp(snapshot.fetchedAt)}</span> : null}</footer>
    {currentRun ? <JobTermination key={currentRun.id} initialRuns={[currentRun]} initialAgents={agents} initialDatasets={initialDatasets} controlled onChanged={refresh} onOpenLogs={() => setShowLogs(true)}/> : null}
    {showLogs && currentRun ? <section id="job-logs"><JobLogs key={currentRun.id} initialRuns={[currentRun]} initialAgents={agents} initialDatasets={initialDatasets} initialRunId={currentRun.id}/></section> : null}
  </section>
}
