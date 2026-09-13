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
  checkpoints?: { id: string; checkpoint_seq: number; checkpoint_kind: string }[]
  events?: { id: string; event_type: string; attempt: number | null }[]
  diagnosticWarnings?: string[]
  steps: Step[]
  attempts: {
    evidenceId: string
    stepId: string | null
    attempt: number | null
    status: string | null
    error_code: string | null
    started_at?: string | null
    completed_at?: string | null
  }[]
  historyCoverage: string
  nextOffset: number | null
}

type Props = {
  initialRuns: Run[]
  initialRunId?: string | null
  initialBranchId?: string | null
  initialAgents: MonitoringAgent[]
  initialDatasets: MonitoringDataset[]
  initialSnapshot?: Snapshot | null
  initialError?: string | null
  initialProjectId?: string
  projects?: { id: string; name: string }[]
  treeEnabled?: boolean
}

const STATE_ICONS: Record<string, string> = {
  running: '◔',
  complete: '✓',
  waiting: '◔',
  failed: '!',
  queued: 'Ⅱ',
  cancelled: '×',
  skipped: '–',
  unknown: '•',
}

const stateLabel = (state: string) => state === 'complete' ? 'Complete' : state.charAt(0).toUpperCase() + state.slice(1)
const isTerminal = (snapshot: Snapshot) => !snapshot.truncated && snapshot.runs.every(run => TERMINAL.has(run.status))
const timestamp = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString().replace('T', ' ').replace('.000Z', ' UTC')
    : 'Not recorded'

export function LivingJobMonitor({
  initialRuns,
  initialRunId,
  initialBranchId,
  initialAgents,
  initialDatasets,
  initialSnapshot = null,
  initialError = null,
  initialProjectId,
  projects = [],
  treeEnabled = true,
}: Props) {
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
  const refresh = useCallback(() => setRefreshKey(key => key + 1), [])

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 3000)
    return () => clearInterval(timer)
  }, [])

  const tree = useMonitorPoll<Snapshot>(
    runId ? `/api/monitoring/executions/${encodeURIComponent(runId)}?limit=${limit}` : null,
    3000,
    refreshKey,
    isTerminal,
  )
  const snapshot = tree.data ?? (initialSnapshot?.rootId === runId ? initialSnapshot : null)
  const summaries = useMonitorPoll<{ runs: Run[]; nextOffset: number | null }>(
    projectId ? `/api/monitoring/executions?projectId=${projectId}&offset=${rootOffset}&status=${filter}` : null,
    15000,
    refreshKey,
  )
  const runs = summaries.data?.runs ?? (rootOffset === 0 && !filter ? initialRuns.filter(run => run.project_id === projectId) : [])
  const rootId = snapshot?.rootId
  const selected = snapshot?.runs.find(run => run.id === selectedId)
  const detailResult = useMonitorPoll<Detail>(
    rootId && selectedId ? `/api/monitoring/executions/${rootId}/branches/${selectedId}?offset=${offset}` : null,
    5000,
    refreshKey,
    () => TERMINAL.has(selected?.status ?? ''),
  )
  const detail = detailResult.data

  useEffect(() => {
    if (!snapshot || selected) return
    if (snapshot.truncated && limit < 1000) setLimit(current => Math.min(1000, current + 100))
  }, [snapshot, selected, limit])

  const selectBranch = (id: string) => {
    setSelectedId(id)
    setOffset(0)
    setShowLogs(false)
    if (rootId) {
      const url = new URL(window.location.href)
      url.searchParams.set('run', rootId)
      url.searchParams.set('branch', id)
      window.history.replaceState(null, '', url)
    }
  }

  const selectRoot = (id: string) => {
    setRunId(id)
    setSelectedId(id)
    setLimit(100)
    setOffset(0)
    setShowLogs(false)
    const url = new URL(window.location.href)
    url.searchParams.set('run', id)
    url.searchParams.delete('branch')
    window.history.replaceState(null, '', url)
  }

  const selectProject = (id: string) => {
    setProjectId(id)
    setRootOffset(0)
    setRunId('')
    setSelectedId('')
    setShowLogs(false)
    setFilter('')
  }

  const stale = !!snapshot && (!isTerminal(snapshot) || !!tree.error) && now > 0 && now - (tree.receivedAt ?? Date.parse(snapshot.fetchedAt)) > 9000
  const progress = selected && snapshot ? runProgress(selected.id, snapshot) : null
  const currentRun: MonitoringRun | null = selected ? { ...selected, dataset_version_id: null, error_message: null } : null
  const selectedAgent = selected ? initialAgents.find(agent => agent.id === selected.agent_definition_id) : null
  const agents = selected ? [selectedAgent ?? { id: selected.agent_definition_id, name: selected.name ?? 'Agent', version: '', agent_key: '' }] : []
  const error = tree.error ?? (!snapshot && initialRunId === runId ? initialError : null)
  const counts = snapshot?.runs.reduce<Record<string, number>>((result, run) => {
    const state = displayState(run, snapshot)
    result[state] = (result[state] ?? 0) + 1
    return result
  }, {}) ?? {}

  const selectedState = selected && snapshot ? displayState(selected, snapshot) : 'unknown'
  const selectedColor = STATE_COLORS[selectedState]
  const selectedParent = selected?.parent_run_id ? snapshot?.runs.find(run => run.id === selected.parent_run_id) : null
  const unmetEdges = selected && snapshot ? snapshot.edges.filter(edge => edge.target === selected.id && !edge.satisfied) : []
  const blockedBy = unmetEdges.map(edge => snapshot?.runs.find(run => run.id === edge.source)?.name ?? (edge.external ? 'External prerequisite' : edge.source.slice(0, 8)))
  const selectedWaits = selected && snapshot ? snapshot.waits.filter(wait => wait.runId === selected.id) : []

  return <section className="living-monitor">
    <header className="tree-masthead">
      <div>
        <h1 className="tree-brand-title">JOB MONITOR</h1>
        <p className="tree-brand-subtitle">Living Tree · Recorded execution preview</p>
      </div>
      <div className="tree-masthead-right">
        <span className="tree-data-badge">Recorded data</span>
        <span className="tree-brand-motto">Data flows. Work happens. Greater outcomes.</span>
      </div>
    </header>

    <div className="tree-header">
      <div className="tree-header-copy">
        <div>
          <p className="tree-kicker">Execution controls</p>
          <p className="tree-header-title">Explore one governed execution tree at a time.</p>
        </div>
      </div>
      <div className="tree-controls">
        {projects.length
          ? <select aria-label="Monitoring project" value={projectId} onChange={event => selectProject(event.target.value)}>
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          : null}
        <select aria-label="Filter executions" value={filter} onChange={event => { setFilter(event.target.value); setRootOffset(0) }}>
          <option value="">All states</option>
          {['CREATED', 'QUEUED', 'RUNNING', 'WAITING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].map(state => <option key={state}>{state}</option>)}
        </select>
        <select aria-label="Select execution" value={runId} onChange={event => selectRoot(event.target.value)}>
          <option value="" disabled>Select execution</option>
          {!runs.some(run => run.id === runId) && runId ? <option value={runId}>Selected execution {runId.slice(0, 8)}</option> : null}
          {runs.map(run => <option key={run.id} value={run.id}>{run.status} · {run.id.slice(0, 8)}</option>)}
        </select>
        {treeEnabled ? <button onClick={() => setView(current => current === 'tree' ? 'list' : 'tree')}>{view === 'tree' ? 'List view' : 'Tree view'}</button> : null}
        <button onClick={refresh}>Refresh</button>
        <label className="tree-subtle"><input type="checkbox" checked={allLinks} onChange={event => setAllLinks(event.target.checked)}/> All dependencies</label>
        {rootOffset > 0 ? <button onClick={() => setRootOffset(current => Math.max(0, current - 25))}>Newer</button> : null}
        {summaries.data?.nextOffset != null ? <button onClick={() => setRootOffset(summaries.data!.nextOffset!)}>Older</button> : null}
      </div>
    </div>

    {summaries.error ? <p role="status" className="tree-warning">Execution list: {summaries.error}</p> : null}
    {error ? <p role="alert" className="tree-warning">{error}</p> : null}
    {stale ? <p role="status" className="tree-warning">Updates delayed. Showing the last recorded state and pausing execution animation.</p> : null}
    {snapshot?.warnings.map(warning => <p key={warning} className="tree-warning">{warning}</p>)}

    {snapshot
      ? <div className="tree-summary">
          <strong>{snapshot.runs[0]?.name ?? 'Root execution'} · {snapshot.runs[0]?.status}</strong>
          {Object.entries(counts).map(([state, count]) => <span key={state}>{count} {state}</span>)}
          <span>{snapshot.truncated ? 'Loaded evidence window' : 'Complete loaded hierarchy'}</span>
        </div>
      : null}

    {!runId
      ? <p className="tree-row">{runs.length ? 'Select an execution to inspect its Living Tree.' : 'No executions are available for this project and filter.'}</p>
      : !snapshot
        ? <p className="tree-row">{error ? 'Use Refresh to retry, or select another execution.' : 'Loading execution hierarchy…'}</p>
        : <div className="tree-grid">
            <div className="tree-visual-column">
              <div hidden={view !== 'tree'}>
                {treeEnabled ? <ExecutionTree key={rootId} snapshot={snapshot} selectedId={selectedId} onSelect={selectBranch} stale={stale} allLinks={allLinks}/> : null}
              </div>

              {view === 'list'
                ? <div className="tree-list">
                    {snapshot.runs.map(run => {
                      const state = displayState(run, snapshot)
                      return <button key={run.id} onClick={() => selectBranch(run.id)} aria-pressed={run.id === selectedId}>
                        <span style={{ color: STATE_COLORS[state] }}>● </span>
                        {run.name} · {stateLabel(state)}
                        <span className="tree-subtle"> · {run.id.slice(0, 8)}</span>
                      </button>
                    })}
                  </div>
                : null}

              {snapshot.truncated && limit < 1000 ? <button className="tree-action" onClick={() => setLimit(current => Math.min(1000, current + 100))}>Load more runs</button> : null}
              {snapshot.truncated && limit === 1000 ? <p className="tree-warning">Maximum tree window loaded. Branch diagnostics remain available from the selected job.</p> : null}
            </div>

            <aside className="tree-panel" aria-label="Selected branch details">
              {selected
                ? <>
                    <div className="tree-panel-header">
                      <p className="tree-kicker">Selected job</p>
                      <h3>{selected.name}</h3>
                      <span className="tree-status-pill" style={{ color: selectedColor }}>
                        <span className="tree-status-dot">{STATE_ICONS[selectedState] ?? '•'}</span>
                        {selectedState === 'waiting' && blockedBy.length ? 'Waiting on dependency' : stateLabel(selectedState)}
                      </span>

                      <dl className="tree-metadata">
                        <dt>Parent</dt>
                        <dd>{selectedParent?.name ?? (selected.id === snapshot.rootId ? 'Root execution' : 'Not recorded')}</dd>
                        <dt>Blocked by</dt>
                        <dd>{blockedBy.length ? blockedBy.join(', ') : 'No unmet prerequisite'}</dd>
                        <dt>Recorded state</dt>
                        <dd>{selected.status}</dd>
                        <dt>Started</dt>
                        <dd>{timestamp(selected.started_at)}</dd>
                        <dt>Finished</dt>
                        <dd>{timestamp(selected.completed_at)}</dd>
                        {selected.dataset_id ? <><dt>Dataset</dt><dd>{initialDatasets.find(dataset => dataset.id === selected.dataset_id)?.name ?? selected.dataset_id}</dd></> : null}
                      </dl>

                      {selectedWaits.map(wait => <p key={wait.reason} className="tree-subtle">Starts after: {wait.reason}</p>)}
                      {blockedBy.length ? <p className="tree-subtle">Starts when recorded prerequisites are satisfied.</p> : null}
                    </div>

                    <h4>Execution steps</h4>
                    {detailResult.error
                      ? <div role="alert" className="tree-warning">
                          <p>{detailResult.error}</p>
                          <button className="tree-action" onClick={refresh}>Retry branch details</button>
                        </div>
                      : detail
                        ? detail.steps.length
                          ? detail.steps.map(step => <div className="tree-row" key={step.id}>
                              <strong>{step.step_name}</strong>
                              <p>{step.status} · Attempt {step.attempt}</p>
                              <p className="tree-subtle">{timestamp(step.started_at)} to {timestamp(step.completed_at)}</p>
                              {step.error_code ? <p>{step.error_code}</p> : null}
                            </div>)
                          : <p className="tree-subtle">No execution steps were recorded for this branch.</p>
                        : <p role="status" className="tree-subtle">Loading execution steps…</p>}

                    <h4>Recorded progress</h4>
                    <p className="tree-subtle">{progress?.label ?? 'Progress evidence unavailable.'}</p>
                    {progress?.percent != null ? <progress aria-label="Planned step completion" value={progress.percent} max={100} style={{ width: '100%' }}/> : null}

                    <h4>Runtime evidence</h4>
                    {detail?.diagnosticWarnings?.map(warning => <p key={warning} className="tree-subtle">{warning}</p>)}
                    {detail?.checkpoints?.map(checkpoint => <p key={checkpoint.id} className="tree-subtle">Checkpoint {checkpoint.checkpoint_seq}: {checkpoint.checkpoint_kind}</p>)}
                    {detail?.events?.map(event => <p key={event.id} className="tree-subtle">{event.event_type}{event.attempt ? ` · Attempt ${event.attempt}` : ''}</p>)}

                    <h4>Previous attempt snapshots</h4>
                    {detailResult.error
                      ? <p className="tree-subtle">Attempt evidence is unavailable until branch diagnostics recover.</p>
                      : <p className="tree-subtle">{detail?.historyCoverage ?? 'Loading evidence…'}</p>}
                    {detail?.attempts.map(attempt => <div className="tree-row" key={attempt.evidenceId}>
                      Step {attempt.stepId?.slice(0, 8) ?? '?'} · Attempt {attempt.attempt ?? '?'} · {attempt.status ?? 'Unknown'}
                      <p className="tree-subtle">{timestamp(attempt.started_at)} to {timestamp(attempt.completed_at)}</p>
                      {attempt.error_code ? <p>{attempt.error_code}</p> : null}
                    </div>)}

                    <div className="tree-controls">
                      {offset > 0 ? <button onClick={() => setOffset(current => Math.max(0, current - 100))}>Previous details</button> : null}
                      {detail?.nextOffset != null ? <button onClick={() => setOffset(detail.nextOffset!)}>More details</button> : null}
                      <button onClick={() => setShowLogs(current => !current)}>{showLogs ? 'Hide execution details' : 'View execution details'}</button>
                    </div>
                  </>
                : <p className="tree-warning">Selected run is outside the loaded hierarchy. Authorized branch diagnostics remain available.</p>}
            </aside>
          </div>}

    <footer className="tree-legend">
      {(['running', 'complete', 'waiting', 'queued'] as const).map(state =>
        <span key={state} className="tree-legend-item">
          <span className="tree-legend-dot" style={{ color: STATE_COLORS[state] }}/>
          {stateLabel(state)}
        </span>
      )}
      <span className="tree-legend-item"><span className="tree-legend-rule"/>Dependency</span>
      <span className="tree-legend-separator"/>
      <span className="tree-footer-note">Solid branches show ownership. Dotted arrows show recorded prerequisites.</span>
      {snapshot ? <span className="tree-subtle">Fetched {timestamp(snapshot.fetchedAt)}</span> : null}
    </footer>

    <div className="tree-footer-brand">
      <span>From data to impact.</span>
      <span>A more trusted tomorrow.</span>
    </div>

    {currentRun
      ? <JobTermination
          key={currentRun.id}
          initialRuns={[currentRun]}
          initialAgents={agents}
          initialDatasets={initialDatasets}
          controlled
          onChanged={refresh}
          onOpenLogs={() => setShowLogs(true)}
        />
      : null}

    {showLogs && currentRun
      ? <section id="job-logs">
          <JobLogs key={currentRun.id} initialRuns={[currentRun]} initialAgents={agents} initialDatasets={initialDatasets} initialRunId={currentRun.id}/>
        </section>
      : null}
  </section>
}
