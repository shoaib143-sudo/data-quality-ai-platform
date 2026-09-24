'use client'

import Link from 'next/link'
import type {
  AutonomousJourneyInstruction,
  AutonomousWalkthroughMode,
} from '@/lib/orchestration/governance-autonomous-journey'

const phases: Record<AutonomousWalkthroughMode, readonly string[]> = {
  GOVERNED_AUTO: [
    'Select project', 'Review policy', 'Define objective', 'Submit run',
    'Human oversight', 'Review evidence', 'Independent certification',
  ],
  FULL_AUTONOMOUS: [
    'Select project', 'Set autonomy bounds', 'Define objective', 'Submit run',
    'Monitor agents', 'Review evidence', 'Independent certification',
  ],
}

export function AutonomousRunCoach({
  mode,
  instruction,
  projectName,
  policy,
  canManage,
  canExecute,
  runStatus,
  runId,
  executedCount,
  verifiedCount,
  refreshBusy,
  onRefreshRun,
}: {
  mode: AutonomousWalkthroughMode
  instruction: AutonomousJourneyInstruction
  projectName: string
  policy: {
    maximumRiskTier: string
    maxExecutionBudget: number
    maxModelBudget: number
    autoRemediationEnabled: boolean
    autoRollbackEnabled: boolean
    emergencyStop: boolean
  } | null
  canManage: boolean
  canExecute: boolean
  runStatus: string
  runId: string
  executedCount: number
  verifiedCount: number
  refreshBusy: boolean
  onRefreshRun: () => void
}) {
  const label = mode === 'GOVERNED_AUTO' ? 'GOVERNED_AUTO' : 'FULL_AUTONOMOUS'
  const description = mode === 'GOVERNED_AUTO'
    ? 'Policy-allowed low-risk automation with human oversight, intervention and approval for gated actions.'
    : 'Goal-driven agent coordination within saved risk, tool, budget, emergency-stop and approval boundaries.'
  const phaseNames = phases[mode]

  return <section aria-labelledby="autonomous-journey-heading"
    className="dn-workspace-panel overflow-hidden rounded-2xl border border-sky-300/50 lg:col-span-2">
    <div className="space-y-4 border-b border-sky-200/40 bg-sky-500/[0.045] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">Live operator walkthrough · {projectName || 'Select a project'}</p>
          <h2 id="autonomous-journey-heading" className="mt-1 text-xl font-semibold">{label} governance E2E</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description} Steps advance only when the actual saved policy, run status and persisted evidence support them.</p>
        </div>
        <span className="rounded-full border border-sky-300/60 px-3 py-1 text-xs font-semibold"
          aria-label={`Walkthrough step ${instruction.stepNumber} of ${instruction.totalSteps}`}>
          Step {instruction.stepNumber} of {instruction.totalSteps}
        </span>
      </div>

      <ol className="grid gap-1.5 sm:grid-cols-4 lg:grid-cols-7" aria-label={label + ' E2E progress'}>
        {phaseNames.map((phase, index) => {
          const current = instruction.stepNumber === index + 1
          const complete = instruction.stepNumber > index + 1 || (instruction.isTerminal && instruction.stepNumber === index + 1)
          return <li key={phase} aria-current={current && !instruction.isTerminal ? 'step' : undefined}
            className={'min-h-[4.25rem] rounded-lg border p-2 text-xs ' +
              (complete ? 'border-emerald-400/50 bg-emerald-500/[0.06]' : current ? 'border-sky-400 bg-sky-500/[0.07]' : 'border-border text-muted-foreground')}>
            <span className="block font-semibold">{index + 1}. {phase}</span>
            <span className="mt-1 block text-[11px]">{complete ? 'Checkpoint passed' : current ? 'Your next action' : 'Not yet reached'}</span>
          </li>
        })}
      </ol>

      <div className="rounded-xl border border-sky-300/50 bg-background p-4" role="status" aria-live="polite" aria-atomic="true">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Do this now</p>
        <h3 className="mt-1 text-lg font-semibold">{instruction.heading}</h3>
        <p className="mt-2 text-sm leading-relaxed">{instruction.instruction}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!instruction.isTerminal && <a href={instruction.target}
            className="inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Go to the required control
          </a>}
          <button type="button" onClick={onRefreshRun} disabled={refreshBusy}
            className="min-h-10 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50">
            {refreshBusy ? 'Refreshing…' : 'Refresh server checkpoints'}
          </button>
        </div>
      </div>
    </div>

    <div className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Persisted policy and execution checkpoints</h3>
        <span className="text-xs text-muted-foreground">{canManage ? 'Policy administrator' : 'Policy read-only'} · {canExecute ? 'Execution access' : 'No execution permission'}</span>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-3"><dt className="text-muted-foreground">Saved maximum risk</dt><dd className="mt-1 font-semibold">{policy?.maximumRiskTier ?? 'Unknown'}</dd></div>
        <div className="rounded-lg border p-3"><dt className="text-muted-foreground">Execution budget limit</dt><dd className="mt-1 font-semibold">{policy?.maxExecutionBudget ?? 'Unknown'}</dd></div>
        <div className="rounded-lg border p-3"><dt className="text-muted-foreground">Model budget limit</dt><dd className="mt-1 font-semibold">{policy?.maxModelBudget ?? 'Unknown'}</dd></div>
        <div className="rounded-lg border p-3"><dt className="text-muted-foreground">Automatic remediation</dt><dd className="mt-1 font-semibold">{policy?.autoRemediationEnabled ? 'Enabled' : 'Disabled'}</dd></div>
        <div className="rounded-lg border p-3"><dt className="text-muted-foreground">Automatic rollback</dt><dd className="mt-1 font-semibold">{policy?.autoRollbackEnabled ? 'Enabled' : 'Disabled'}</dd></div>
        <div className="rounded-lg border p-3"><dt className="text-muted-foreground">Emergency stop</dt><dd className="mt-1 font-semibold">{policy?.emergencyStop ? 'Active' : policy ? 'Clear' : 'Unknown'}</dd></div>
      </dl>
      {(policy?.maxExecutionBudget === 0 || policy?.maxModelBudget === 0) &&
        <p role="status" className="rounded-lg border border-amber-400/50 bg-amber-500/[0.06] p-3 text-xs">
          One or more saved budgets are zero. Any operation that requires positive budget must remain blocked; this walkthrough never changes budget limits.
        </p>}
      {policy?.emergencyStop && <p role="alert" className="rounded-lg border border-amber-400/50 p-3 text-sm">
        Emergency stop is active. Execution must stay blocked until an authorized administrator deliberately saves a permitted change.
      </p>}
      <p role="note" className="rounded-lg border border-amber-400/50 bg-amber-500/[0.04] p-3 text-xs">
        Scope boundary: unlike GUIDED selected-source dispatch, these two modes currently attach the latest project dataset versions when present. This walkthrough does not provide dataset-specific isolation or automatically authorize project-wide data access. Verify intended scope before submitting.
      </p>
      <p className="text-xs text-muted-foreground">
        Server run: {runId || 'None'} · Status: {runStatus || 'Not started'} · Executed: {executedCount}/75 · Independently verified: {verifiedCount}/75. Displayed progress is not evidence of certification.
      </p>
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/monitoring" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Open Job Monitor</Link>
        <Link href="/catalog" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Inspect project datasets</Link>
      </div>
    </div>
  </section>
}
