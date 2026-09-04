'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type InvestigationRecommendation = {
  action: string
  priority: string | null
  rationale: string | null
  approvalRequired: boolean
}

type InvestigationView = {
  approvalRequired: boolean
  risk: string | null
  confidence: number | null
  businessIssue: string | null
  businessImpact: string | null
  recommendations: InvestigationRecommendation[]
}

type WorkflowView = {
  id: string
  status: string
  currentStep: number
} | null

type OutcomeView = {
  status: string
  executionMode: string | null
  productionMutationPerformed: boolean
  verificationProfileRunId: string | null
  verificationJobId: string | null
  verificationRetryable: boolean
  qualityScoreDelta: number | null
  highSeverityFindingsDelta: number | null
} | null

type IssueView = {
  id: string
  title: string
  status: string
  severity: string
  resolutionSummary: string | null
}

function badge(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (match) => match.toUpperCase())
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'N/A'
  return `${Math.round(value * 100)}%`
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Request failed with status ${response.status}.`
    throw new Error(message)
  }
  return payload
}

export default function ProfilingGovernancePanel({
  profileRunId,
  profileRunStatus,
  investigation,
  workflow,
  outcome,
  issues,
}: {
  profileRunId: string
  profileRunStatus: string
  investigation: InvestigationView
  workflow: WorkflowView
  outcome: OutcomeView
  issues: IssueView[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runAction(label: string, action: () => Promise<Record<string, unknown>>) {
    setBusy(label)
    setMessage(null)
    setError(null)
    try {
      const result = await action()
      const status = typeof result.status === 'string'
        ? result.status
        : typeof result.remediationStatus === 'string'
          ? result.remediationStatus
          : null
      setMessage(status ? `${label}: ${badge(status)}` : `${label} completed.`)
      router.refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${label} failed.`)
    } finally {
      setBusy(null)
    }
  }

  const canStartApproval = profileRunStatus === 'COMPLETED' && investigation.approvalRequired && !workflow
  const canTrackRemediation = workflow?.status === 'APPROVED' && !outcome
  const canCheckVerification = workflow?.status === 'APPROVED' && Boolean(outcome)
  const canRetryVerification = workflow?.status === 'APPROVED' && outcome?.verificationRetryable === true

  return (
    <section className="rounded-xl border p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-semibold">Governed Investigation & Remediation</h2>
          <p className="mt-1 text-sm text-muted-foreground">Move this profiling run from investigation evidence into approval, tracked remediation, automatic re-profile verification, and learning.</p>
        </div>
        <Link href="/workflows" className="text-sm font-semibold text-violet-600 underline">Open Governance Workflows</Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Approval</div>
          <div className="mt-1 font-medium">{investigation.approvalRequired ? 'Required' : 'Not required'}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Risk</div>
          <div className="mt-1 font-medium">{investigation.risk ? badge(investigation.risk) : 'N/A'}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Confidence</div>
          <div className="mt-1 font-medium">{percent(investigation.confidence)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">Workflow</div>
          <div className="mt-1 font-medium">{workflow ? badge(workflow.status) : 'Not started'}</div>
        </div>
      </div>

      {(investigation.businessIssue || investigation.businessImpact) ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border p-4 text-sm">
            <div className="font-medium">Business issue</div>
            <p className="mt-2 text-muted-foreground">{investigation.businessIssue ?? 'Not stated.'}</p>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <div className="font-medium">Business impact</div>
            <p className="mt-2 text-muted-foreground">{investigation.businessImpact ?? 'Not stated.'}</p>
          </div>
        </div>
      ) : null}

      {investigation.recommendations.length ? (
        <div className="mt-4 rounded-lg border p-4">
          <div className="font-medium">Investigation recommendations</div>
          <div className="mt-3 space-y-2">
            {investigation.recommendations.map((recommendation) => (
              <div key={recommendation.action} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{badge(recommendation.action)}</strong>
                  <div className="flex gap-2 text-xs">
                    {recommendation.priority ? <span className="rounded-full border px-2 py-0.5">{badge(recommendation.priority)}</span> : null}
                    {recommendation.approvalRequired ? <span className="rounded-full border px-2 py-0.5">Approval required</span> : null}
                  </div>
                </div>
                {recommendation.rationale ? <p className="mt-2 text-muted-foreground">{recommendation.rationale}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {canStartApproval ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => runAction('Start governed approval', () => postJson('/api/profiling/approval', { profileRunId }))}
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'Start governed approval' ? 'Starting…' : 'Start governed approval'}
          </button>
        ) : null}
        {canTrackRemediation ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => runAction('Track remediation', () => postJson('/api/profiling/remediation', { workflowInstanceId: workflow.id }))}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'Track remediation' ? 'Creating…' : 'Track remediation'}
          </button>
        ) : null}
        {canCheckVerification ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => runAction('Check verification', () => postJson('/api/profiling/remediation/verify', { workflowInstanceId: workflow.id }))}
            className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'Check verification' ? 'Checking…' : 'Check verification'}
          </button>
        ) : null}
        {canRetryVerification ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => runAction('Retry automatic verification', () => postJson('/api/profiling/remediation/reprofile', { workflowInstanceId: workflow.id }))}
            className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'Retry automatic verification' ? 'Retrying…' : 'Retry automatic verification'}
          </button>
        ) : null}
      </div>

      {workflow?.status === 'RUNNING' ? (
        <p className="mt-3 text-sm text-muted-foreground">Approval is pending at workflow step {workflow.currentStep + 1}. Complete the policy approval in Governance Workflows.</p>
      ) : null}
      {workflow && !['RUNNING', 'APPROVED'].includes(workflow.status) ? (
        <p className="mt-3 text-sm text-muted-foreground">This workflow is {badge(workflow.status)}. A rejected or cancelled approval will not execute remediation.</p>
      ) : null}

      {outcome ? (
        <div className="mt-5 rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>Remediation outcome</strong>
            <span className="rounded-full border px-2 py-0.5 text-xs">{badge(outcome.status)}</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            <div><span className="text-muted-foreground">Execution:</span> {outcome.executionMode ? badge(outcome.executionMode) : 'N/A'}</div>
            <div><span className="text-muted-foreground">Production mutation:</span> {outcome.productionMutationPerformed ? 'Yes' : 'No'}</div>
            <div><span className="text-muted-foreground">Quality delta:</span> {outcome.qualityScoreDelta ?? 'Pending'}</div>
            <div><span className="text-muted-foreground">High severity delta:</span> {outcome.highSeverityFindingsDelta ?? 'Pending'}</div>
          </div>
          {outcome.verificationProfileRunId ? <div className="mt-2 break-all text-xs text-muted-foreground">Verification profile: {outcome.verificationProfileRunId}</div> : null}
          {outcome.verificationJobId ? <div className="mt-1 break-all text-xs text-muted-foreground">Verification job: {outcome.verificationJobId}</div> : null}
          {outcome.verificationRetryable ? <p className="mt-3 text-amber-700">Automatic verification needs retry after a technical failure.</p> : null}
        </div>
      ) : null}

      {issues.length ? (
        <div className="mt-5 rounded-lg border p-4">
          <div className="font-medium">Tracked remediation issues</div>
          <div className="mt-3 space-y-2">
            {issues.map((issue) => (
              <div key={issue.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{issue.title}</strong>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{badge(issue.status)} · {badge(issue.severity)}</span>
                </div>
                {issue.resolutionSummary ? <p className="mt-2 text-muted-foreground">Resolution: {issue.resolutionSummary}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
    </section>
  )
}
