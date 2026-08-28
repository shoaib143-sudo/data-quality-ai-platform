'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type RunLog = { id: string; agent_run_id: string; agent_run_step_id: string | null; level: string; event_type: string; message: string; details: Record<string, unknown>; created_at: string }
type Run = { id: string; status: string; created_at: string; agent_definition_id: string; dataset_id: string | null }
type Agent = { id: string; name: string; version: string }
type Dataset = { id: string; name: string }
const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'LIFECYCLE', 'TOOL', 'METRIC', 'DATABASE']

function formatTimestamp(value: string) { return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Singapore' }).format(new Date(value)) }
function levelClass(level: string) { if (level === 'ERROR') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400'; if (level === 'WARN') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400'; if (level === 'LIFECYCLE') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400'; return 'border-border bg-muted/50 text-muted-foreground' }

export function JobLogs({ initialRuns, initialAgents, initialDatasets }: { initialRuns: Run[]; initialAgents: Agent[]; initialDatasets: Dataset[] }) {
  const [runId, setRunId] = useState(initialRuns[0]?.id ?? '')
  const [logs, setLogs] = useState<RunLog[]>([])
  const [level, setLevel] = useState('ALL')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(Boolean(initialRuns[0]))
  const [message, setMessage] = useState<string | null>(null)
  const agents = useMemo(() => new Map(initialAgents.map((agent) => [agent.id, agent])), [initialAgents])
  const datasets = useMemo(() => new Map(initialDatasets.map((dataset) => [dataset.id, dataset])), [initialDatasets])

  const load = useCallback(async () => {
    if (!runId) return
    setLoading(true); setMessage(null)
    try { const response = await fetch(`/api/agents/runs/${runId}/logs`, { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? 'Unable to load logs.'); setLogs(payload.logs ?? []) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load logs.') }
    finally { setLoading(false) }
  }, [runId])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => logs.filter((log) => { const q = search.trim().toLowerCase(); return (level === 'ALL' || log.level === level) && (!q || `${log.event_type} ${log.message}`.toLowerCase().includes(q)) }), [logs, level, search])
  function selectedLabel(run: Run) { const agent = agents.get(run.agent_definition_id); const dataset = run.dataset_id ? datasets.get(run.dataset_id) : null; return `${agent ? `${agent.name} v${agent.version}` : 'Agent run'} · ${dataset?.name ?? 'Dataset unavailable'} · ${run.status}` }
  async function downloadDiagnostics() { const response = await fetch(`/api/agents/runs/${runId}/logs`, { cache: 'no-store' }); const payload = await response.json(); if (!response.ok) { setMessage(payload.error ?? 'Unable to export diagnostics.'); return }; const selected = initialRuns.find((run) => run.id === runId); const blob = new Blob([JSON.stringify({ run: selected ?? { id: runId }, exportedAt: new Date().toISOString(), logs: payload.logs }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `agent-run-${runId}-diagnostics.json`; anchor.click(); URL.revokeObjectURL(url) }

  return <div className="rounded-2xl border bg-card shadow-sm">
    <div className="flex flex-col gap-4 border-b p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-semibold">Execution logs & diagnostics</h3><p className="mt-1 text-xs text-muted-foreground">Inspect structured executor events, errors, tool activity, and lifecycle transitions.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Refresh logs</button><button type="button" onClick={() => void downloadDiagnostics()} disabled={!runId} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">Download diagnostics</button></div></div><select aria-label="Run to inspect" value={runId} onChange={(e) => setRunId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">{initialRuns.map((run) => <option key={run.id} value={run.id}>{selectedLabel(run)}</option>)}</select></div>
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs…" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" /><select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Log level" className="rounded-lg border bg-background px-3 py-2 text-sm">{LEVELS.map((item) => <option key={item}>{item}</option>)}</select></div>
    {message && <div className="border-b px-4 py-3 text-xs text-red-600">{message}</div>}
    <div className="max-h-[480px] overflow-auto">{loading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading execution logs…</div> : filtered.length === 0 ? <div className="p-8 text-center"><p className="font-medium">No matching logs</p><p className="mt-1 text-xs text-muted-foreground">No structured events have been captured for this run yet.</p></div> : <div className="divide-y">{filtered.map((log) => <div key={log.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[150px_90px_minmax(0,1fr)] sm:items-start"><time className="text-xs text-muted-foreground">{formatTimestamp(log.created_at)}</time><span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${levelClass(log.level)}`}>{log.level}</span><div className="min-w-0"><p className="text-sm">{log.message}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{log.event_type}</p>{Object.keys(log.details ?? {}).length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-muted-foreground">Details</summary><pre className="mt-2 overflow-auto rounded-lg bg-muted p-3 text-[10px]">{JSON.stringify(log.details, null, 2)}</pre></details>}</div></div>)}</div>}</div>
  </div>
}
