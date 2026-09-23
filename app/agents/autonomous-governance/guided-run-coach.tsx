'use client'

import Link from 'next/link'
import type { GuidedReadiness, GuidedTableStatus } from '@/lib/orchestration/governance-guided-readiness'
import type { GuidedJourneyInstruction } from '@/lib/orchestration/governance-guided-journey'

const phases = [
  'Select project',
  'Verify tables',
  'Activate GUIDED',
  'Submit goal',
  'Human approval',
  'Review evidence',
  'Independent certification',
] as const

const tableInstructions: Record<GuidedTableStatus, string> = {
  NOT_DISCOVERED: 'Discover this source table before onboarding.',
  NOT_REGISTERED: 'Register this discovered table as a dataset.',
  VERSION_NOT_AVAILABLE: 'Create or finish an AVAILABLE dataset version.',
  EXECUTION_SOURCE_MISSING: 'Bind and activate its profiling execution source.',
  REGISTERED_READY: 'Registered and bound; live connectivity is not yet proven.',
}

export function GuidedRunCoach({
  instruction,
  projectName,
  readiness,
  readinessBusy,
  readinessError,
  onRefreshReadiness,
  onChooseSource,
  sourceSelectionDisabled,
  onChooseGuided,
  canManage,
  emergencyStop,
}: {
  instruction: GuidedJourneyInstruction
  projectName: string
  readiness: GuidedReadiness | null
  readinessBusy: boolean
  readinessError: string
  onRefreshReadiness: () => void
  onChooseSource: (sourceId: string) => void
  sourceSelectionDisabled: boolean
  onChooseGuided: () => void
  canManage: boolean
  emergencyStop: boolean
}) {
  return <section aria-labelledby="guided-journey-heading" className="dn-workspace-panel overflow-hidden rounded-2xl border border-sky-300/50 p-0 lg:col-span-2">
    <div className="border-b border-sky-200/40 bg-sky-500/[0.045] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Interactive walkthrough · Human-in-the-loop</p>
          <h2 id="guided-journey-heading" className="mt-1 text-xl font-semibold">GUIDED governance E2E</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Follow the instructions on this screen as a signed-in DataNexus user. Checkpoints are read from your actual project, run and evidence, not marked complete by clicking Next.
          </p>
        </div>
        <span className="rounded-full border border-sky-300/60 px-3 py-1 text-xs font-semibold" aria-label={'Walkthrough step ' + instruction.stepNumber + ' of 7'}>
          Step {instruction.stepNumber} of {instruction.totalSteps}
        </span>
      </div>
      <ol className="mt-5 grid gap-1.5 sm:grid-cols-4 lg:grid-cols-7" aria-label="GUIDED E2E progress">
        {phases.map((phase, index) => {
          const stage = index + 1
          const complete = instruction.stepNumber > stage
          const current = instruction.stepNumber === stage
          return <li key={phase} aria-current={current ? 'step' : undefined}
            className={'min-h-[4.25rem] rounded-lg border p-2 text-xs ' +
              (complete ? 'border-emerald-400/50 bg-emerald-500/[0.06]' : current ? 'border-sky-400 bg-sky-500/[0.07]' : 'border-border text-muted-foreground')}>
            <span className="block font-semibold">{stage}. {phase}</span>
            <span className="mt-1 block text-[11px]">{complete ? 'Checkpoint passed' : current ? 'Your next action' : 'Not yet reached'}</span>
          </li>
        })}
      </ol>
      <div className="mt-4 rounded-xl border border-sky-300/50 bg-background p-4" role="status" aria-live="polite" aria-atomic="true">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Do this now</p>
        <h3 className="mt-1 text-lg font-semibold">{instruction.heading}</h3>
        <p className="mt-2 text-sm leading-relaxed">{instruction.instruction}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!instruction.isTerminal && <a href={instruction.target} className="inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Go to the required control
          </a>}
          {instruction.step === 'SAVE_GUIDED_POLICY' && canManage && <button type="button" onClick={onChooseGuided} className="min-h-10 rounded-lg border border-sky-400 px-4 py-2 text-sm font-medium">
            Select GUIDED mode
          </button>}
          {(instruction.step === 'VERIFY_SOURCES' || instruction.step === 'REVIEW_FAILURE') && <button type="button" onClick={onRefreshReadiness} disabled={readinessBusy} className="min-h-10 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
            {readinessBusy ? 'Checking…' : 'Refresh source readiness'}
          </button>}
        </div>
      </div>
      {emergencyStop && <p className="mt-3 rounded-lg border border-amber-400/50 bg-amber-500/[0.06] p-3 text-sm" role="alert">
        Safety lock active: emergency stop remains enabled. Only an authorized administrator should clear it deliberately when the preflight is ready. Saving GUIDED while the stop is active must not launch a run.
      </p>}
    </div>
    <div id="guided-source-preflight" className="scroll-mt-24 space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Actual source and dataset preflight</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {projectName || 'Choose a project'} · Current authoritative source selections, dataset versions and active profiling bindings.
          </p>
        </div>
        <button type="button" onClick={onRefreshReadiness} disabled={readinessBusy} className="min-h-10 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">
          {readinessBusy ? 'Checking…' : 'Recheck'}
        </button>
      </div>
      {readiness && (readiness.sourceOptions?.length ?? 0) > 0 && <label htmlFor="guided-source-select" className="block text-sm font-semibold">Select source for this E2E test
        <select id="guided-source-select" value={readiness.selectedSourceId ?? ''} onChange={event => onChooseSource(event.target.value)} disabled={sourceSelectionDisabled || readinessBusy}
          className="mt-2 min-h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-50">
          {(readiness.sourceOptions ?? []).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Only this source's current selected tables are checked and included in the GUIDED capability evidence ledger.</span>
      </label>}
      {readinessError && <p role="alert" className="rounded-lg border border-red-400/50 p-3 text-sm">{readinessError}. No E2E execution may start until preflight succeeds.</p>}
      {!readiness && !readinessError && <p role="status" className="text-sm text-muted-foreground">{readinessBusy ? 'Checking server-side source readiness…' : 'Readiness has not been measured.'}</p>}
      {readiness && <>
        <div className={'rounded-lg border p-3 text-sm ' + (readiness.ready ? 'border-emerald-400/50 bg-emerald-500/[0.04]' : 'border-amber-400/50 bg-amber-500/[0.05]')}>
          <span className="font-semibold">{readiness.ready ? 'Registration preflight ready' : 'Registration preflight incomplete'}</span>
          {' · '}{readiness.readyCount} of {readiness.expectedCount} selected tables have current discovery evidence, an AVAILABLE dataset version and an active execution binding. Live connector read and profiling still need to be tested.
        </div>
        {readiness.scopes.some(scope => scope.mode !== 'SELECTED') && <p className="text-xs" role="alert">This source has an unbounded selection. Choose a different, explicitly enumerated scope or narrow this one before the GUIDED test.</p>}
        {readiness.tables.length > 0 && <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[540px] text-left text-xs">
            <caption className="sr-only">Server-verified selected tables for the GUIDED execution</caption>
            <thead className="bg-muted/50"><tr><th scope="col" className="p-3">Selected table</th><th scope="col" className="p-3">Registration</th><th scope="col" className="p-3">Next action</th></tr></thead>
            <tbody className="divide-y">
              {readiness.tables.map(table => <tr key={table.sourceId + ':' + table.qualifiedName}>
                <td className="max-w-[340px] break-all p-3 font-medium">{table.qualifiedName}</td>
                <td className="p-3">{table.status.replaceAll('_', ' ')}</td>
                <td className="p-3 text-muted-foreground">{tableInstructions[table.status]}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
        {readiness.scopes.length === 0 && <p className="text-xs" role="alert">No active selected source scope was found for this project. Discover and configure a source before proceeding.</p>}
      </>}
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/catalog/discovery" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Open Discovery</Link>
        <Link href="/catalog" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Open Data Catalog</Link>
        <Link href="/catalog/physical-assets" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Review and request asset promotions</Link>
        <Link href="/monitoring" className="rounded-lg border px-3 py-2 font-medium hover:bg-muted">Open Job Monitor</Link>
      </div>
      <p className="text-xs text-muted-foreground">These checks cannot grant approvals or certify a run. Any missing table, failed job or unavailable external connector remains a visible blocker.</p>
    </div>
  </section>
}
