'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GuidedRunCoach } from './guided-run-coach'
import type { GuidedReadiness } from '@/lib/orchestration/governance-guided-readiness'
import { nextGuidedInstruction } from '@/lib/orchestration/governance-guided-journey'

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

type ReportingPreference = {
  enabled: boolean
  persona: 'EXECUTIVE' | 'GOVERNANCE_COUNCIL' | 'DATA_STEWARD' | 'AUDIT'
  depth: 'EXECUTIVE' | 'GOVERNANCE' | 'AUDIT'
}

const governedAgents = [
  'governance_orchestrator_agent',
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
]

const defaultPolicy: Policy = {
  mode: 'OFF', enabled: false, policyVersion: '1.0', maximumRiskTier: 'NONE',
  allowedAgentKeys: [], allowedToolKeys: [], allowedModelClasses: [], allowedMutationClasses: [], approvalRequiredActions: [],
  autoRemediationEnabled: false, autoRollbackEnabled: false, maxExecutionBudget: 0, maxModelBudget: 0,
  maxRuntimeMs: 300000, maxDatasetsChangedPerRun: 0, maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 0, maxConcurrentModelCalls: 0, emergencyStop: false,
}

const defaultReporting: ReportingPreference = { enabled: false, persona: 'EXECUTIVE', depth: 'EXECUTIVE' }

const modeGuidance: Record<Policy['mode'], { label: string; category: string; description: string }> = {
  OFF: { label: 'Off', category: 'Manual', description: 'Autonomous execution is disabled. Operations require explicit user-driven actions.' },
  GUIDED: { label: 'Guided', category: 'Assisted / Human-in-the-loop', description: 'Eligible work can be prepared automatically, but execution requires governed approval.' },
  GOVERNED_AUTO: { label: 'Governed auto', category: 'Automated / Human-on-the-loop', description: 'Policy-approved low-risk work can run automatically while operators retain stop and oversight controls.' },
  FULL_AUTONOMOUS: { label: 'Full autonomous', category: 'Autonomous goal-driven', description: 'The orchestrator may pursue the submitted goal within deterministic policy, risk, budget, tool, and approval boundaries.' },
}

export function AutonomyConsole({ projects, executableProjectIds, manageableProjectIds, certifiableProjectIds, initialProjectId }: {
  projects: ProjectOption[]
  executableProjectIds: string[]
  manageableProjectIds: string[]
  certifiableProjectIds: string[]
  initialProjectId?: string
}) {
  const [projectId, setProjectId] = useState(projects.some(row => row.id === initialProjectId) ? initialProjectId! : projects[0]?.id ?? '')
  const [policy, setPolicy] = useState<Policy>(defaultPolicy)
  const [persistedPolicy, setPersistedPolicy] = useState<Policy | null>(null)
  const [readiness, setReadiness] = useState<GuidedReadiness | null>(null)
  const [guidedSourceId, setGuidedSourceId] = useState('')
  const [readinessBusy, setReadinessBusy] = useState(false)
  const [readinessError, setReadinessError] = useState('')
  const readinessRequest = useRef(0)
  const [coverage, setCoverage] = useState<Record<string, unknown> | null>(null)
  const [latestReport, setLatestReport] = useState<Record<string, unknown> | null>(null)
  const [reporting, setReporting] = useState<ReportingPreference>(defaultReporting)
  const [goal, setGoal] = useState('Run governed end-to-end Data Governance and AI assurance for exactly the selected source scope. Do not include other project datasets.')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const canExecute = executableProjectIds.includes(projectId)
  const canManage = manageableProjectIds.includes(projectId)
  const canCertify = certifiableProjectIds.includes(projectId)
  const project = useMemo(() => projects.find(row => row.id === projectId), [projects, projectId])
  const hasUnsavedPolicyEdits = !persistedPolicy || JSON.stringify(policy) !== JSON.stringify(persistedPolicy)
  const persistedGuidedReady = persistedPolicy?.mode === 'GUIDED' && persistedPolicy.enabled
    && !persistedPolicy.emergencyStop && !hasUnsavedPolicyEdits

  const refreshReadiness = useCallback(async () => {
    const requestId = ++readinessRequest.current
    setReadiness(null)
    setReadinessError('')
    if (!projectId) return
    setReadinessBusy(true)
    try {
      const sourceQuery = guidedSourceId ? `&sourceId=${encodeURIComponent(guidedSourceId)}` : ''
      const response = await fetch(`/api/agents/governance-orchestrator/guided-readiness?projectId=${encodeURIComponent(projectId)}${sourceQuery}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not check selected source tables.')
      if (requestId === readinessRequest.current) {
        setReadiness(body as GuidedReadiness)
        // Source selection is always a deliberate user action, not an implicit test fixture.
      }
    } catch (error) {
      if (requestId === readinessRequest.current) {
        setReadiness(null)
        setReadinessError(error instanceof Error ? error.message : 'Could not verify sources.')
      }
    } finally {
      if (requestId === readinessRequest.current) setReadinessBusy(false)
    }
  }, [projectId, guidedSourceId])

  useEffect(() => {
    void refreshReadiness()
    return () => { readinessRequest.current += 1 }
  }, [refreshReadiness])

  const refreshRunState = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/agents/governance-orchestrator?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to refresh the run.')
      setCoverage(body.latestCoverageRun ?? null)
      setLatestReport(body.latestReport ?? null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to refresh the run.')
    }
  }, [projectId])

  useEffect(() => {
    const status = String(coverage?.status ?? '')
    if (!['WAITING_APPROVAL', 'RUNNING'].includes(status)) return
    const timer = window.setInterval(() => { void refreshRunState() }, 10000)
    return () => window.clearInterval(timer)
  }, [coverage?.status, refreshRunState])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setBusy(true)
    setPersistedPolicy(null)
    setGuidedSourceId('')
    setReadiness(null)
    setCoverage(null)
    fetch(`/api/agents/governance-orchestrator?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Unable to load orchestrator state.')
        if (!cancelled) {
          setPolicy(body.policy ?? defaultPolicy)
          setPersistedPolicy(body.policy ?? defaultPolicy)
          setCoverage(body.latestCoverageRun ?? null)
          setLatestReport(body.latestReport ?? null)
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
      allowedAgentKeys: mode === 'OFF' ? [] : Array.from(new Set([...current.allowedAgentKeys, ...governedAgents])),
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
      setPersistedPolicy(body.policy)
      setMessage('Autonomy policy saved. This does not submit or approve a governance run.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update autonomy policy.') }
    finally { setBusy(false) }
  }

  async function runOrchestrator() {
    if (!projectId || !canExecute || !goal.trim()) return
    if (policy.mode === 'GUIDED' && (!persistedGuidedReady || (guidedSourceId !== '' && (!readiness?.ready || !readiness.scopes[0]?.scopeVersionId)))) {
      setMessage('GUIDED execution requires a saved safe policy. If you explicitly selected a source, its readiness must also pass.')
      return
    }
    if (!persistedPolicy || hasUnsavedPolicyEdits || !persistedPolicy.enabled || persistedPolicy.emergencyStop) {
      setMessage('Execution blocked. Load and save an enabled policy without an active emergency stop.')
      return
    }
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/agents/governance-orchestrator', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          projectId, goal, reporting,
          ...(persistedPolicy.mode === 'GUIDED' && guidedSourceId ? { sourceScopeVersionId: readiness?.scopes[0]?.scopeVersionId } : {}),
        }),
      })
      const body = await response.json()
      if (!response.ok && response.status !== 202 && response.status !== 409) throw new Error(body.error || 'Orchestrator execution failed.')
      setCoverage({ ...body, mode: body.policy?.mode ?? persistedPolicy.mode })
      setMessage(body.status === 'SUCCEEDED'
        ? reporting.enabled
          ? 'Orchestrator execution completed. Reporting is opted in and will use canonical persisted evidence only.'
          : 'Orchestrator execution completed. Reporting was not requested for this run.'
        : `Orchestrator status: ${body.status ?? 'UNKNOWN'}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Orchestrator execution failed.') }
    finally { setBusy(false) }
  }

  async function certify() {
    const orchestratorRunId = typeof coverage?.orchestratorRunId === 'string'
      ? coverage.orchestratorRunId
      : typeof coverage?.id === 'string' ? coverage.id : ''
    if (!projectId || !canCertify || !orchestratorRunId) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/agents/governance-orchestrator/certify', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId, orchestratorRunId }),
      })
      const body = await response.json()
      setCoverage(current => ({ ...(current ?? {}), ...body, summary: body.summary ?? current?.summary }))
      if (!response.ok) throw new Error(body.error || `Certification result: ${body.assessmentState ?? 'NOT_ASSESSED'}.`)
      setMessage('Independent canonical certification passed.')
      await refreshRunState()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Independent certification failed.') }
    finally { setBusy(false) }
  }

  if (projects.length === 0) {
    return <section className="rounded-xl border p-5 text-sm text-muted-foreground">No authorized projects are available for Autonomous Governance.</section>
  }

  const summary = (coverage?.summary ?? coverage) as Record<string, unknown> | null
  const reportPayload = latestReport && typeof latestReport.report === 'object' && latestReport.report !== null
    ? latestReport.report as Record<string, unknown>
    : null
  const orchestratorRunId = typeof coverage?.orchestratorRunId === 'string'
    ? coverage.orchestratorRunId
    : typeof coverage?.id === 'string' ? coverage.id : ''
  const summaryRow = summary ?? {}
  const guidedInstruction = nextGuidedInstruction({
    projectId,
    readinessLoaded: readiness !== null,
    readinessReady: readiness?.ready === true,
    persistedMode: persistedPolicy?.mode ?? 'OFF',
    persistedEnabled: persistedPolicy?.enabled === true,
    persistedEmergencyStop: persistedPolicy?.emergencyStop !== false,
    hasUnsavedPolicyEdits,
    canExecute,
    goal,
    runId: orchestratorRunId,
    runMode: typeof coverage?.mode === 'string' ? coverage.mode : null,
    runStatus: typeof coverage?.status === 'string' ? coverage.status : null,
    executedCount: Number(summaryRow.executed ?? 0),
    verifiedCount: Number(summaryRow.verified ?? 0),
    certificationEligible: summaryRow.certificationEligible === true,
    assessmentState: typeof (coverage?.decision_trace as Record<string, unknown> | undefined)?.assessment_state === 'string'
      ? String((coverage?.decision_trace as Record<string, unknown>).assessment_state)
      : null,
  })
  const executionBlocked = !persistedPolicy || hasUnsavedPolicyEdits || !persistedPolicy.enabled
    || persistedPolicy.emergencyStop || policy.mode === 'OFF'
    || (policy.mode === 'GUIDED' && guidedSourceId !== '' && (!readiness?.ready || !readiness.scopes[0]?.scopeVersionId))
    || !goal.trim() || ['WAITING_APPROVAL', 'RUNNING', 'SUCCEEDED'].includes(String(coverage?.status ?? ''))
  const certificationReady = summaryRow.certificationEligible === true && coverage?.status === 'SUCCEEDED'
    && (coverage?.decision_trace as Record<string, unknown> | undefined)?.assessment_state !== 'PASS'
  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      {(policy.mode === 'GUIDED' || persistedPolicy?.mode === 'GUIDED' || persistedPolicy?.mode === 'OFF' || !persistedPolicy)
        && <GuidedRunCoach
          instruction={guidedInstruction}
          projectName={project?.name ?? ''}
          readiness={readiness}
          readinessBusy={readinessBusy}
          readinessError={readinessError}
          onRefreshReadiness={() => { void refreshReadiness() }}
          onChooseSource={sourceId => setGuidedSourceId(sourceId)}
          sourceSelectionDisabled={['WAITING_APPROVAL', 'RUNNING'].includes(String(coverage?.status ?? ''))}
          onChooseGuided={() => chooseMode('GUIDED')}
          canManage={canManage}
          emergencyStop={persistedPolicy?.emergencyStop === true}
        />}
      <section className="dn-workspace-panel rounded-xl border p-5 space-y-5">
        <div>
          <label className="text-sm font-medium" htmlFor="autonomy-project">Project</label>
          <select id="autonomy-project" value={projectId} onChange={event => {
            const nextId = event.target.value
            setProjectId(nextId)
            const url = new URL(window.location.href)
            url.searchParams.set('projectId', nextId)
            window.history.replaceState(null, '', url.pathname + url.search)
          }} className="mt-2 w-full rounded-lg border bg-background px-3 py-2">
            {projects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </div>

        <div id="autonomy-mode" className="scroll-mt-24">
          <p className="text-sm font-medium" id="operating-mode-label">Operating mode</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-labelledby="operating-mode-label">
            {(['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS'] as const).map(mode => (
              <button key={mode} type="button" onClick={() => chooseMode(mode)} disabled={!canManage || busy}
                aria-pressed={policy.mode === mode}
                aria-describedby="operating-mode-help"
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${policy.mode === mode ? 'ring-2 ring-ring' : ''}`}>
                {modeGuidance[mode].label}
              </button>
            ))}
          </div>
          <div id="operating-mode-help" className="mt-3 rounded-lg border p-3" aria-live="polite">
            <p className="text-xs font-medium">{modeGuidance[policy.mode].category}</p>
            <p className="mt-1 text-xs text-muted-foreground">{modeGuidance[policy.mode].description}</p>
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
          {hasUnsavedPolicyEdits && <span className="self-center text-xs text-amber-700 dark:text-amber-300">Unsaved policy changes. Execution stays blocked.</span>}
        </div>
      </section>

      <section className="dn-workspace-panel rounded-xl border p-5 space-y-5">
        <div id="guided-execution-goal" className="scroll-mt-24">
          <label htmlFor="governance-execution-goal" className="text-sm font-medium">Execution goal</label>
          <textarea id="governance-execution-goal" value={goal} onChange={event => setGoal(event.target.value)} rows={5} maxLength={2000} className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={reporting.enabled} onChange={event => setReporting(current => ({ ...current, enabled: event.target.checked }))} />
            Generate governance outcome report for this execution
          </label>
          <p className="text-xs text-muted-foreground">Optional and opt-in. Reports may only use canonical persisted evidence and omit unsupported claims.</p>
          {reporting.enabled && <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Audience
              <select value={reporting.persona} onChange={event => setReporting(current => ({ ...current, persona: event.target.value as ReportingPreference['persona'] }))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                <option value="EXECUTIVE">CDO / Executive</option>
                <option value="GOVERNANCE_COUNCIL">Governance Council</option>
                <option value="DATA_STEWARD">Data Steward</option>
                <option value="AUDIT">Audit</option>
              </select>
            </label>
            <label className="text-sm">Reporting depth
              <select value={reporting.depth} onChange={event => setReporting(current => ({ ...current, depth: event.target.value as ReportingPreference['depth'] }))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2">
                <option value="EXECUTIVE">Executive</option>
                <option value="GOVERNANCE">Governance</option>
                <option value="AUDIT">Audit</option>
              </select>
            </label>
          </div>}
        </div>

        <div id="guided-run-action" className="scroll-mt-24 flex flex-wrap gap-2">
          <button type="button" onClick={runOrchestrator} disabled={!canExecute || busy || executionBlocked} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? 'Working…' : 'Run DataNexus Governance Orchestrator'}
          </button>
          <button id="guided-certification-action" type="button" onClick={certify} disabled={!canCertify || busy || !orchestratorRunId || !certificationReady} className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
            Independent certification
          </button>
        </div>
        {!canExecute && <p className="text-xs text-muted-foreground">You do not have agent execution permission for {project?.name ?? 'this project'}.</p>}
        {!canCertify && <p className="text-xs text-muted-foreground">Certification requires separate certification.review authority.</p>}
        <button type="button" onClick={() => { void refreshRunState(); void refreshReadiness() }} disabled={busy} className="min-h-10 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">Refresh run and source status</button>
        {message && <p id="guided-runtime" className="scroll-mt-24 rounded-lg border p-3 text-sm" role="status" aria-live="polite">{message}</p>}
        {!message && <div id="guided-runtime" className="scroll-mt-24 rounded-lg border p-3 text-xs text-muted-foreground" role="status" aria-live="polite">Latest server-reported run: {String(coverage?.status ?? 'None')}. Submitting a request never counts as approval or independent certification.</div>}
      </section>

      {reportPayload && <section className="dn-workspace-panel rounded-xl border p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{String(reportPayload.title ?? 'Governance Outcome Report')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{String(reportPayload.openingSummary ?? '')}</p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs">Evidence-backed report</span>
        </div>
        <p className="mt-4 text-sm">{String(reportPayload.unresolvedStatement ?? '')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{String(reportPayload.assuranceStatement ?? '')}</p>
      </section>}

      <section id="guided-capability-coverage" className="dn-workspace-panel scroll-mt-24 rounded-xl border p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">Canonical capability coverage</h2><p className="text-xs text-muted-foreground">PASS requires exactly 75 executed capabilities and 75 independently verified capabilities with canonical run-scoped evidence.</p></div>
          <span className="rounded-full border px-3 py-1 text-xs">Mode: {policy.mode.replaceAll('_',' ')}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Accounting coverage" value={summary?.accountingCoveragePct} />
          <Metric label="Execution coverage" value={summary?.executionCoveragePct} />
          <Metric label="Certification coverage" value={summary?.certificationCoveragePct} />
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Certification eligible: {String(summary?.certificationEligible ?? false)} · Unaccounted: {String(summary?.unaccounted ?? 'n/a')} · Blocked: {String(summary?.blocked ?? 'n/a')} · Failed: {String(summary?.failed ?? 'n/a')}
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
