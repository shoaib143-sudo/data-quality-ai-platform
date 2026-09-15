'use client'

import { useEffect, useMemo, useState } from 'react'

type ProjectOption = { id: string; name: string }
type Policy = {
  mode: 'OFF' | 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'
  enabled: boolean
  policyVersion: string
  maximumRiskTier: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  allowedAgentKeys: string[]
  allowedToolKeys: string[]
  allowedModelClasses: string[]
  allowedMutationClasses: string[]
  approvalRequiredActions: string[]
  autoRemediationEnabled: boolean
  autoRollbackEnabled: boolean
  maxExecutionBudget: number
  maxModelBudget: number
  maxRuntimeMs: number
  maxDatasetsChangedPerRun: number
  maxProjectsAffectedPerRun: number
  maxRemediationActionsPerHour: number
  maxConcurrentModelCalls: number
  emergencyStop: boolean
}

const defaultPolicy: Policy = {
  mode: 'OFF', enabled: false, policyVersion: '1.0', maximumRiskTier: 'NONE',
  allowedAgentKeys: [], allowedToolKeys: [], allowedModelClasses: [], allowedMutationClasses: [], approvalRequiredActions: [],
  autoRemediationEnabled: false, autoRollbackEnabled: false, maxExecutionBudget: 0, maxModelBudget: 0,
  maxRuntimeMs: 300000, maxDatasetsChangedPerRun: 0, maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 0, maxConcurrentModelCalls: 0, emergencyStop: false,
}

export function AutonomyConsole({ projects, executableProjectIds, manageableProjectIds }: {
  projects: ProjectOption[]
  executableProjectIds: string[]
  manageableProjectIds: string[]
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [policy, setPolicy] = useState<Policy>(defaultPolicy)
  const [coverage, setCoverage] = useState<Record<string, unknown> | null>(null)
  const [goal, setGoal] = useState('Run governed end-to-end Data Governance and AI assurance for this project.')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const canExecute = executableProjectIds.includes(projectId)
  const canManage = manageableProjectIds.includes(projectId)
  const project = useMemo(() => projects.find(row => row.id === projectId), [projects, projectId])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setBusy(true)
    fetch(`/api/agents/governance-orchestrator?projectId=${encodeURIComponent(projectId)}`)
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load orchestrator state.')
        if (!cancelled) {
          setPolicy(body.policy ?? defaultPolicy)
          setCoverage(body.latestCoverageRun ?? null)
          setMessage('')
        }
      })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to load orchestrator state.') })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [projectId])

  function chooseMode(mode: Policy['mode']) {
    setPolicy(current => ({
      ...current,
      mode,
      enabled: mode !== 'OFF',
      maximumRiskTier: mode === 'OFF' ? 'NONE' : current.maximumRiskTier === 'NONE' ? 'LOW' : current.maximumRiskTier,
      policyVersion: `ui-${Date.now()}`,
      allowedAgentKeys: mode === 'OFF' ? [] : Array.from(new Set([...current.allowedAgentKeys, 'governance_orchestrator_agent'])),
    }))
  }

  async function savePolicy() {
    if (!projectId || !canManage) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/agents/governance-orchestrator', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, ...policy }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to update autonomy policy.')
      setPolicy(body.policy)
      setMessage('Autonomy policy saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update autonomy policy.') }
    finally { setBusy(false) }
  }

  async function runOrchestrator() {
    if (!projectId || !canExecute || !goal.trim()) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/agents/governance-orchestrator', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, goal }),
      })
      const body = await response.json()
      if (!response.ok && response.status !== 202 && response.status !== 409) throw new Error(body.error || 'Orchestrator execution failed.')
      setCoverage(body)
      setMessage(body.status === 'SUCCEEDED' ? 'Orchestrator execution completed.' : `Orchestrator status: ${body.status ?? 'UNKNOWN'}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Orchestrator execution failed.') }
    finally { setBusy(false) }
  }

  if (projects.length === 0) {
    return <section className="rounded-xl border p-5 text-sm text-muted-foreground">No authorized projects are available for Autonomous Governance.</section>
  }

  const summary = (coverage?.summary ?? coverage) as Record<string, unknown> | null
  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="dn-workspace-panel rounded-xl border p-5 space-y-5">
        <div>
          <label className="text-sm font-medium" htmlFor="autonomy-project">Project</label>
          <select id="autonomy-project" value={projectId} onChange={event => setProjectId(event.target.value)} className="mt-2 w-full rounded-lg border bg-background px-3 py-2">
            {projects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>

        <div>
          <p className="text-sm font-medium">Operating mode</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => chooseMode(mode)} disabled={!canManage || busy}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${policy.mode === mode ? 'ring-2 ring-ring' : ''}`}>
                {mode.replaceAll('_',' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Max risk tier
            <select value={policy.maximumRiskTier} onChange={event => setPolicy(current => ({ ...current, maximumRiskTier: event.target.value as Policy['maximumRiskTier'] }))}
              disabled={!canManage || busy} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
              {['NONE','LOW','MEDIUM','HIGH','CRITICAL'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm">Max projects affected
            <input type="number" min={1} max={100} value={policy.maxProjectsAffectedPerRun}
              onChange={event => setPolicy(current => ({ ...current, maxProjectsAffectedPerRun: Number(event.target.value) }))}
              disabled={!canManage || busy} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.autoRemediationEnabled} onChange={event => setPolicy(current => ({ ...current, autoRemediationEnabled: event.target.checked }))} disabled={!canManage || busy} />Auto remediation</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.autoRollbackEnabled} onChange={event => setPolicy(current => ({ ...current, autoRollbackEnabled: event.target.checked }))} disabled={!canManage || busy} />Auto rollback</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.emergencyStop} onChange={event => setPolicy(current => ({ ...current, emergencyStop: event.target.checked }))} disabled={!canManage || busy} />Emergency stop</label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={savePolicy} disabled={!canManage || busy} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">Save policy</button>
          <span className="self-center text-xs text-muted-foreground">{canManage ? 'Admin policy authority available' : 'Read-only policy access'}</span>
        </div>
      </section>

      <section className="dn-workspace-panel rounded-xl border p-5 space-y-5">
        <div>
          <p className="text-sm font-medium">Execution goal</p>
          <textarea value={goal} onChange={event => setGoal(event.target.value)} rows={5} maxLength={2000} className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>
        <button type="button" onClick={runOrchestrator} disabled={!canExecute || busy || policy.mode === 'OFF'} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy ? 'Working…' : 'Run DataNexus Governance Orchestrator'}
        </button>
        {!canExecute && <p className="text-xs text-muted-foreground">You do not have agent execution permission for {project?.name ?? 'this project'}.</p>}
        {message && <p className="rounded-lg border p-3 text-sm">{message}</p>}
      </section>

      <section className="dn-workspace-panel rounded-xl border p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Capability coverage</h2><p className="text-xs text-muted-foreground">Independent certification requires canonical evidence for every mandatory capability.</p></div>
          <span className="rounded-full border px-3 py-1 text-xs">Mode: {policy.mode.replaceAll('_',' ')}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Accounting coverage" value={summary?.accountingCoveragePct} />
          <Metric label="Execution coverage" value={summary?.executionCoveragePct} />
          <Metric label="Certification coverage" value={summary?.certificationCoveragePct} />
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Certification eligible: {String(summary?.certificationEligible ?? false)} · Unaccounted: {String(summary?.unaccounted ?? 'n/a')} · Not measured: {String(summary?.notMeasured ?? summary?.not_measured_count ?? 'n/a')}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: unknown }) {
  const numeric = typeof value === 'number' ? value : Number(value)
  const display = Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : 'Not measured'
  return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{display}</p></div>
}
