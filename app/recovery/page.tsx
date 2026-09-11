import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { RecoveryActions } from './recovery-actions'

type RecoveryCase = {
  id: string
  project_id: string
  durable_job_id: string
  agent_run_id: string | null
  job_type: string
  classification: string
  recommended_action: string
  consent_requirement: string
  status: string
  failure_summary: string
  evidence: Record<string, unknown> | null
  occurrence_count: number
  first_detected_at: string
  last_detected_at: string
  resolved_at: string | null
}

type RecoveryAction = {
  id: string
  recovery_case_id: string
  action_type: string
  consent_source: string
  status: string
  outcome: Record<string, unknown> | null
  requested_at: string
  executed_at: string | null
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded'
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">None</span>
  return <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs leading-5">{JSON.stringify(value, null, 2)}</pre>
}

export default async function RecoveryPage() {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .schema('orchestration')
    .from('recovery_cases')
    .select('id, project_id, durable_job_id, agent_run_id, job_type, classification, recommended_action, consent_requirement, status, failure_summary, evidence, occurrence_count, first_detected_at, last_detected_at, resolved_at')
    .order('last_detected_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`Unable to load recovery cases: ${error.message}`)
  const cases = (data ?? []) as RecoveryCase[]
  const caseIds = cases.map((item) => item.id)
  let actions: RecoveryAction[] = []

  if (caseIds.length > 0) {
    const actionsResult = await supabase
      .schema('orchestration')
      .from('recovery_actions')
      .select('id, recovery_case_id, action_type, consent_source, status, outcome, requested_at, executed_at')
      .in('recovery_case_id', caseIds)
      .order('requested_at', { ascending: false })
    if (actionsResult.error) throw new Error(`Unable to load recovery actions: ${actionsResult.error.message}`)
    actions = (actionsResult.data ?? []) as RecoveryAction[]
  }

  const actionsByCase = new Map<string, RecoveryAction[]>()
  for (const action of actions) {
    const existing = actionsByCase.get(action.recovery_case_id) ?? []
    existing.push(action)
    actionsByCase.set(action.recovery_case_id, existing)
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Execution Recovery</h1>
            <p className="mt-2 text-sm text-muted-foreground">Evidence-backed recovery cases created only after durable execution exhausts its retry budget.</p>
          </div>
          <Link href="/agents" className="text-sm underline">AI Agents</Link>
        </div>

        <section className="rounded-xl border p-5 text-sm text-muted-foreground">
          The durable queue owns automatic retries. Recovery actions start only at terminal failure. A retry requires operator consent and grants one additional durable attempt. Rollback is never automatic here; the platform records a rollback-review request instead.
        </section>

        {cases.length === 0 ? (
          <section className="rounded-xl border p-6">
            <h2 className="font-semibold">No recovery cases</h2>
            <p className="mt-2 text-sm text-muted-foreground">No accessible durable jobs have exhausted their retry budget.</p>
          </section>
        ) : (
          <div className="space-y-5">
            {cases.map((item) => {
              const caseActions = actionsByCase.get(item.id) ?? []
              return (
                <article key={item.id} className="rounded-xl border p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border px-2 py-1">{item.status}</span>
                        <span className="rounded-full border px-2 py-1">{item.classification}</span>
                        <span className="rounded-full border px-2 py-1">{item.job_type}</span>
                      </div>
                      <h2 className="mt-3 text-lg font-semibold">{item.recommended_action.replaceAll('_', ' ')}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">{item.failure_summary}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Detected {formatDate(item.last_detected_at)}</p>
                      <p>Occurrences {item.occurrence_count}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border p-4 text-sm">
                      <p className="text-xs text-muted-foreground">Recovery case</p>
                      <p className="mt-1 break-all font-medium">{item.id}</p>
                      <p className="mt-3 text-xs text-muted-foreground">Durable job</p>
                      <p className="mt-1 break-all">{item.durable_job_id}</p>
                      {item.agent_run_id && (
                        <>
                          <p className="mt-3 text-xs text-muted-foreground">Agent run</p>
                          <Link href={`/agents/runs/${item.agent_run_id}`} className="mt-1 block break-all underline">{item.agent_run_id}</Link>
                        </>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">Consent</p>
                      <p className="mt-1">{item.consent_requirement}</p>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Evidence references</p>
                      <JsonBlock value={item.evidence} />
                    </div>
                  </div>

                  <div className="mt-5">
                    <RecoveryActions caseId={item.id} recommendedAction={item.recommended_action} status={item.status} />
                  </div>

                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm font-medium">Recovery action ledger ({caseActions.length})</summary>
                    <div className="mt-3 space-y-3">
                      {caseActions.length === 0 ? <p className="text-sm text-muted-foreground">No operator actions recorded.</p> : caseActions.map((action) => (
                        <div key={action.id} className="rounded-lg border p-4 text-sm">
                          <div className="flex flex-wrap justify-between gap-3">
                            <span className="font-medium">{action.action_type} · {action.status}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(action.requested_at)}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Consent: {action.consent_source}</p>
                          <div className="mt-3"><JsonBlock value={action.outcome} /></div>
                        </div>
                      ))}
                    </div>
                  </details>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
