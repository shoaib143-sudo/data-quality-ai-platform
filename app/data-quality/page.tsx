import Link from 'next/link'

import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type ProfileRun = {
  id: string
  dataset_version_id: string
  status: string
  row_count: number | null
  column_count: number | null
  summary: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  error_code: string | null
}

type DatasetVersion = {
  id: string
  dataset_id: string
  version_number: number
}

type Dataset = {
  id: string
  project_id: string
  name: string
}

type Score = {
  profile_run_id: string
  completeness_score: number | null
  uniqueness_score: number | null
  validity_score: number | null
  accuracy_score: number | null
  overall_score: number | null
}

type Finding = {
  id: string
  profile_run_id: string
  finding_type: string
  severity: string
  title: string
  description: string
  confidence: number | null
  recommendation: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function formatScore(value: number | null | undefined) {
  return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : 'Not available'
}

function formatDate(value: string | null) {
  if (!value) return 'Timestamp unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Timestamp unavailable' : date.toLocaleString()
}

function statusClass(status: string) {
  if (status === 'COMPLETED') return 'border-green-300'
  if (status === 'FAILED') return 'border-red-300'
  if (status === 'CANCELLED') return 'border-amber-300'
  return 'border-border'
}

export default async function DataQualityPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: profileRuns, error: runsError } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id, dataset_version_id, status, row_count, column_count, summary, started_at, completed_at, error_code')
    .order('started_at', { ascending: false })
    .limit(20)

  if (runsError) throw new Error(`Unable to load profiling runs: ${runsError.message}`)

  const runs = (profileRuns ?? []) as ProfileRun[]
  const runIds = runs.map((run) => run.id)
  const versionIds = runs.map((run) => run.dataset_version_id)

  const [scoresResult, findingsResult, versionsResult] = await Promise.all([
    runIds.length
      ? supabase.schema('profiling').from('data_quality_scores')
          .select('profile_run_id, completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score')
          .in('profile_run_id', runIds)
      : Promise.resolve({ data: [], error: null }),
    runIds.length
      ? supabase.schema('profiling').from('profile_findings')
          .select('id, profile_run_id, finding_type, severity, title, description, confidence, recommendation')
          .in('profile_run_id', runIds)
          .order('severity', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? supabase.schema('catalog').from('dataset_versions')
          .select('id, dataset_id, version_number')
          .in('id', versionIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (scoresResult.error) throw new Error(`Unable to load quality scores: ${scoresResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load quality findings: ${findingsResult.error.message}`)
  if (versionsResult.error) throw new Error(`Unable to load dataset versions: ${versionsResult.error.message}`)

  const versions = (versionsResult.data ?? []) as DatasetVersion[]
  const datasetIds = versions.map((version) => version.dataset_id)
  const { data: datasetRows, error: datasetsError } = datasetIds.length
    ? await supabase.schema('catalog').from('datasets').select('id, project_id, name').in('id', datasetIds)
    : { data: [], error: null }

  if (datasetsError) throw new Error(`Unable to load datasets: ${datasetsError.message}`)

  const scores = (scoresResult.data ?? []) as Score[]
  const findings = (findingsResult.data ?? []) as Finding[]
  const versionsById = new Map(versions.map((version) => [version.id, version]))
  const datasetsById = new Map((datasetRows ?? [] as Dataset[]).map((dataset) => [dataset.id, dataset as Dataset]))
  const scoresByRunId = new Map(scores.map((score) => [score.profile_run_id, score]))
  const findingsByRunId = new Map<string, Finding[]>()

  for (const finding of findings) {
    const existing = findingsByRunId.get(finding.profile_run_id) ?? []
    existing.push(finding)
    findingsByRunId.set(finding.profile_run_id, existing)
  }

  const completedRuns = runs.filter((run) => run.status === 'COMPLETED')
  const scoredRuns = completedRuns.filter((run) => typeof scoresByRunId.get(run.id)?.overall_score === 'number')
  const averageScore = scoredRuns.length
    ? scoredRuns.reduce((sum, run) => sum + (scoresByRunId.get(run.id)?.overall_score ?? 0), 0) / scoredRuns.length
    : null
  const materialFindingCount = findings.filter((finding) => ['HIGH', 'MEDIUM'].includes(finding.severity)).length

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard" className="text-sm underline">← Back to dashboard</Link>
          <Link href="/agents" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Open AI Agents</Link>
        </div>

        <header>
          <h1 className="text-3xl font-semibold">Data Quality</h1>
          <p className="mt-2 text-muted-foreground">
            Quality scores, findings, and investigation outcomes from the profiling lifecycle.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">Completed profiling runs</p>
            <p className="mt-2 text-3xl font-semibold">{completedRuns.length}</p>
          </div>
          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">Average quality score</p>
            <p className="mt-2 text-3xl font-semibold">{formatScore(averageScore)}</p>
          </div>
          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground">Material findings</p>
            <p className="mt-2 text-3xl font-semibold">{materialFindingCount}</p>
          </div>
        </section>

        {runs.length === 0 ? (
          <section className="rounded-xl border p-6">
            <h2 className="text-lg font-semibold">No profiling results yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Register a dataset and run the Profiling Agent to populate quality results and investigation evidence.
            </p>
            <Link href="/datasets" className="mt-4 inline-block rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
              Open datasets
            </Link>
          </section>
        ) : (
          <div className="space-y-6">
            {runs.map((run) => {
              const version = versionsById.get(run.dataset_version_id)
              const dataset = version ? datasetsById.get(version.dataset_id) : undefined
              const score = scoresByRunId.get(run.id)
              const runFindings = findingsByRunId.get(run.id) ?? []
              const investigation = asRecord(asRecord(run.summary).investigation)
              const recommendations = Array.isArray(investigation.recommendations) ? investigation.recommendations : []
              const rootCauses = Array.isArray(investigation.probable_root_causes) ? investigation.probable_root_causes : []

              return (
                <section key={run.id} className={`rounded-xl border p-6 ${statusClass(run.status)}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{dataset?.name ?? 'Unknown dataset'}</h2>
                        {version && <span className="rounded-full border px-2 py-1 text-xs">v{version.version_number}</span>}
                        <span className="rounded-full border px-2 py-1 text-xs">{run.status}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Run {run.id}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">Started {formatDate(run.started_at)}</div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Overall</p><p className="mt-1 font-semibold">{formatScore(score?.overall_score)}</p></div>
                    <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Completeness</p><p className="mt-1 font-semibold">{formatScore(score?.completeness_score)}</p></div>
                    <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Uniqueness</p><p className="mt-1 font-semibold">{formatScore(score?.uniqueness_score)}</p></div>
                    <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Validity</p><p className="mt-1 font-semibold">{formatScore(score?.validity_score)}</p></div>
                    <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Rows / columns</p><p className="mt-1 font-semibold">{run.row_count ?? '—'} / {run.column_count ?? '—'}</p></div>
                  </div>

                  {runFindings.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold">Quality findings</h3>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {runFindings.map((finding) => (
                          <div key={finding.id} className="rounded-lg border p-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-medium">{finding.finding_type}</span>
                              <span className="rounded-full border px-2 py-1 text-xs">{finding.severity}</span>
                            </div>
                            <h4 className="mt-2 font-medium">{finding.title}</h4>
                            <p className="mt-1 text-sm text-muted-foreground">{finding.description}</p>
                            {typeof finding.confidence === 'number' && (
                              <p className="mt-2 text-xs text-muted-foreground">Confidence {formatScore(finding.confidence)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(investigation).length > 0 && (
                    <div className="mt-6 rounded-xl border p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold">Investigation outcome</h3>
                        <span className="rounded-full border px-2 py-1 text-xs">Confidence {formatScore(typeof investigation.confidence === 'number' ? investigation.confidence : null)}</span>
                      </div>

                      {typeof investigation.technical_summary === 'string' && (
                        <p className="mt-3 text-sm">{investigation.technical_summary}</p>
                      )}

                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                        {typeof investigation.business_issue === 'string' && (
                          <div><p className="text-xs font-medium text-muted-foreground">Business issue</p><p className="mt-1 text-sm">{investigation.business_issue}</p></div>
                        )}
                        {typeof investigation.business_impact === 'string' && (
                          <div><p className="text-xs font-medium text-muted-foreground">Business impact</p><p className="mt-1 text-sm">{investigation.business_impact}</p></div>
                        )}
                        {typeof investigation.risk === 'string' && (
                          <div><p className="text-xs font-medium text-muted-foreground">Risk</p><p className="mt-1 text-sm">{investigation.risk}</p></div>
                        )}
                      </div>

                      {rootCauses.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-muted-foreground">Probable root causes</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                            {rootCauses.slice(0, 5).map((cause, index) => (
                              <li key={index}>{typeof cause === 'string' ? cause : JSON.stringify(cause)}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {recommendations.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-muted-foreground">Recommendations</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                            {recommendations.slice(0, 5).map((recommendation, index) => (
                              <li key={index}>{typeof recommendation === 'string' ? recommendation : JSON.stringify(recommendation)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {run.error_code && (
                    <p className="mt-5 text-sm text-red-700">Error: {run.error_code}</p>
                  )}
                </section>
              )
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Quality observations and investigation outputs are evidence from persisted profiling runs. Recommendations remain governed and approval-gated where action would affect production data or governance controls.
        </p>
      </div>
    </main>
  )
}
