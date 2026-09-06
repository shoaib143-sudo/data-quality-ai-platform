import Link from 'next/link'
import { AlertTriangle, Layers3, Radar } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DiscoveryManager } from './discovery-manager'

type DiscoveryJobRow = {
  id: string
  project_id: string
  entity_id: string | null
  status: string
  attempts: number
  max_attempts: number
  priority: number
  lease_owner: string | null
  lease_expires_at: string | null
  last_error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function readinessTone(state: string) {
  if (state === 'OBSERVED_READY') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (state === 'DISCOVERY_IN_PROGRESS') return 'border-blue-200 bg-blue-50 text-blue-800'
  if (state === 'LAST_DISCOVERY_FAILED' || state === 'EVIDENCE_INCONSISTENT') return 'border-red-200 bg-red-50 text-red-800'
  if (state === 'OBSERVED_EMPTY') return 'border-amber-200 bg-amber-50 text-amber-900'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function jdbcEvidenceTone(state: string) {
  if (state === 'REPEAT_SCAN_STABLE') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (state === 'SINGLE_SCAN_EVIDENCE' || state === 'REPEAT_SCAN_CHANGED') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (state === 'EVIDENCE_INCONSISTENT') return 'border-red-200 bg-red-50 text-red-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export default async function DiscoveryPage() {
  await requireUser()
  const supabase = await createClient()
  const [sources, runs, currentAssets, readiness, jdbcEvidence] = await Promise.all([
    supabase
      .schema('catalog')
      .from('data_sources')
      .select('id,project_id,name,source_type,status')
      .in('status', ['ACTIVE', 'CONFIGURED'])
      .order('name'),
    supabase
      .schema('catalog')
      .from('discovery_runs')
      .select('id,project_id,source_id,status,assets_discovered,objects_observed,objects_added,objects_changed,objects_removed,objects_missing,objects_unchanged,catalog_revision_id,scope_version_id,consistency_mode,error_message,started_at,completed_at,schema_snapshot')
      .order('started_at', { ascending: false })
      .limit(200),
    supabase
      .schema('catalog')
      .from('current_catalog_source_assets')
      .select('source_id'),
    supabase
      .schema('catalog')
      .from('source_operational_readiness')
      .select('source_id,source_name,source_type,lifecycle_status,operational_state,has_observation_evidence,current_assets,latest_run_status,latest_run_completed_at,evidence_reason')
      .order('source_name'),
    supabase
      .schema('catalog')
      .from('jdbc_discovery_evidence')
      .select('source_id,source_name,lifecycle_status,operational_state,evidence_state,current_assets,current_fields,namespace_count,completed_runs,latest_revision_number,previous_revision_number,identity_unique_and_complete,catalog_projection_complete,multi_namespace_observed,repeat_scan_evidence_present,repeat_scan_stable,authority_semantic')
      .order('source_name'),
  ])

  if (sources.error) throw new Error(`Unable to load discovery sources: ${sources.error.message}`)
  if (runs.error) throw new Error(`Unable to load discovery history: ${runs.error.message}`)
  if (currentAssets.error) throw new Error(`Unable to load current published catalog assets: ${currentAssets.error.message}`)
  if (readiness.error) throw new Error(`Unable to load source operational readiness: ${readiness.error.message}`)
  if (jdbcEvidence.error) throw new Error(`Unable to load JDBC discovery evidence: ${jdbcEvidence.error.message}`)

  const sourceRows = sources.data ?? []
  const runRows = runs.data ?? []
  const readinessRows = readiness.data ?? []
  const jdbcEvidenceRows = jdbcEvidence.data ?? []
  const currentAssetCounts = (currentAssets.data ?? []).reduce<Record<string, number>>((counts, asset) => {
    counts[asset.source_id] = (counts[asset.source_id] ?? 0) + 1
    return counts
  }, {})

  const sourceNameById = new Map(sourceRows.map(source => [source.id, source.name]))
  const latestRunBySource = new Map<string, (typeof runRows)[number]>()
  for (const run of runRows) if (!latestRunBySource.has(run.source_id)) latestRunBySource.set(run.source_id, run)
  const enrichmentBlockers = [...latestRunBySource.values()].flatMap(run => {
    const snapshot = record(run.schema_snapshot)
    const lineage = record(record(snapshot.enrichments).lineage)
    if (text(lineage.status).toUpperCase() !== 'BLOCKED') return []
    const legacyBlocker = record(lineage.blocker)
    return [{
      sourceId: run.source_id,
      sourceName: sourceNameById.get(run.source_id) ?? run.source_id,
      code: text(lineage.blocker_code) || text(legacyBlocker.code) || text(snapshot.lineage_enrichment_blocker) || 'EXTERNAL_ENRICHMENT_BLOCKED',
      resource: text(lineage.blocker_resource) || text(legacyBlocker.resource),
      permission: text(lineage.blocker_permission) || text(legacyBlocker.permission),
      message: text(lineage.blocker_detail) || text(legacyBlocker.message),
    }]
  })

  let jobs: DiscoveryJobRow[] = []
  if (sourceRows.length) {
    const admin = createAdminClient()
    const jobResult = await admin
      .schema('orchestration')
      .from('job_queue')
      .select('id,project_id,entity_id,status,attempts,max_attempts,priority,lease_owner,lease_expires_at,last_error,created_at,started_at,completed_at,updated_at')
      .eq('job_type', 'DISCOVERY')
      .in('entity_id', sourceRows.map((source) => source.id))
      .order('created_at', { ascending: false })
      .limit(300)
    if (jobResult.error) throw new Error(`Unable to load discovery worker jobs: ${jobResult.error.message}`)
    jobs = (jobResult.data ?? []) as DiscoveryJobRow[]
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mb-6 flex items-center justify-between rounded-2xl border bg-white px-5 py-3 shadow-sm">
          <Link href="/dashboard" className="flex items-center gap-3 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5" /></span>
            Data Governance PowerHouse
          </Link>
          <Link href="/catalog" className="text-sm font-semibold text-blue-600">Catalog</Link>
        </nav>
        <header className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Radar className="h-6 w-6" /></span>
            <div>
              <h1 className="text-3xl font-black">Metadata Discovery</h1>
              <p className="mt-1 text-sm text-slate-500">Full scoped reconciliation publishes only complete, trusted catalog revisions. Partial scans never replace the last known-good catalog state.</p>
            </div>
          </div>
        </header>
        {enrichmentBlockers.length ? <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><h2 className="font-black">External enrichment blockers</h2><p className="mt-1 text-sm text-amber-800">The physical catalog revision is published and remains trusted. The enrichments below are unavailable because an authoritative external dependency denied access.</p></div></div>
          <div className="mt-4 grid gap-3">{enrichmentBlockers.map(blocker => <div key={`${blocker.sourceId}:${blocker.code}`} className="rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">{blocker.sourceName} · Lineage enrichment</p><code className="rounded bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900">{blocker.code}</code></div>
            <p className="mt-2 text-amber-900">{blocker.message || (blocker.resource && blocker.permission ? `Requires ${blocker.permission} on ${blocker.resource}.` : 'The authoritative provider dependency must be made accessible before this enrichment can complete.')}</p>
            {blocker.resource || blocker.permission ? <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-amber-700"><div><dt className="inline font-bold">Resource: </dt><dd className="inline font-mono">{blocker.resource || '—'}</dd></div><div><dt className="inline font-bold">Required permission: </dt><dd className="inline font-mono">{blocker.permission || '—'}</dd></div></dl> : null}
          </div>)}</div>
        </section> : null}
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-black">Source operational evidence</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Lifecycle shows whether a source is configured or active. Operational evidence is derived separately from real discovery runs and current physical catalog assets; it never rewrites source lifecycle state.</p></div>
            <p className="text-xs font-semibold text-slate-500">{readinessRows.filter(row => row.operational_state === 'OBSERVED_READY').length} observed ready · {readinessRows.filter(row => row.operational_state === 'UNOBSERVED').length} unobserved</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{readinessRows.map(row => <article key={row.source_id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{row.source_name}</p><p className="mt-0.5 text-xs text-slate-500">{row.source_type}</p></div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${readinessTone(row.operational_state)}`}>{row.operational_state}</span></div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="font-bold text-slate-500">Lifecycle</dt><dd className="mt-0.5">{row.lifecycle_status}</dd></div><div><dt className="font-bold text-slate-500">Current assets</dt><dd className="mt-0.5">{row.current_assets}</dd></div><div><dt className="font-bold text-slate-500">Latest discovery</dt><dd className="mt-0.5">{row.latest_run_status || 'None'}</dd></div><div><dt className="font-bold text-slate-500">Evidence</dt><dd className="mt-0.5">{row.has_observation_evidence ? 'Observed' : 'Not observed'}</dd></div></dl>
            <p className="mt-3 text-xs leading-5 text-slate-500">{row.evidence_reason}</p>
          </article>)}</div>
        </section>
        {jdbcEvidenceRows.length ? <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-black">JDBC discovery evidence</h2><p className="mt-1 max-w-4xl text-sm text-slate-500">Observed physical metadata proves namespace breadth, stable identities, catalog projection, and repeat-scan behavior. Acceptance remains enforced separately by the production JDBC acceptance verifier, including connection and secret-boundary checks.</p></div>
            <p className="text-xs font-semibold text-slate-500">{jdbcEvidenceRows.filter(row => row.multi_namespace_observed).length} multi-namespace · {jdbcEvidenceRows.filter(row => row.repeat_scan_stable).length} repeat-scan stable</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{jdbcEvidenceRows.map(row => <article key={row.source_id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{row.source_name}</p><p className="mt-0.5 text-xs text-slate-500">Lifecycle {row.lifecycle_status} · Operational {row.operational_state || 'UNOBSERVED'}</p></div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${jdbcEvidenceTone(row.evidence_state)}`}>{row.evidence_state}</span></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><div><dt className="font-bold text-slate-500">Assets</dt><dd className="mt-0.5 text-base font-black">{row.current_assets}</dd></div><div><dt className="font-bold text-slate-500">Fields</dt><dd className="mt-0.5 text-base font-black">{row.current_fields}</dd></div><div><dt className="font-bold text-slate-500">Namespaces</dt><dd className="mt-0.5 text-base font-black">{row.namespace_count}</dd></div><div><dt className="font-bold text-slate-500">Completed scans</dt><dd className="mt-0.5 text-base font-black">{row.completed_runs}</dd></div></dl>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3"><p className={`rounded-xl border px-3 py-2 font-bold ${row.multi_namespace_observed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>Multiple namespaces: {row.multi_namespace_observed ? 'Observed' : 'Not proven'}</p><p className={`rounded-xl border px-3 py-2 font-bold ${row.repeat_scan_stable ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : row.repeat_scan_evidence_present ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>Repeat scan: {row.repeat_scan_stable ? 'Stable' : row.repeat_scan_evidence_present ? 'Changed' : 'Not yet proven'}</p><p className={`rounded-xl border px-3 py-2 font-bold ${row.identity_unique_and_complete && row.catalog_projection_complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>Stable identities: {row.identity_unique_and_complete && row.catalog_projection_complete ? 'Complete' : 'Evidence mismatch'}</p></div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Latest revision {row.latest_revision_number ?? 'none'} · Previous revision {row.previous_revision_number ?? 'none'} · {row.authority_semantic}</p>
          </article>)}</div>
        </section> : null}
        <DiscoveryManager sources={sourceRows} runs={runRows} jobs={jobs} currentAssetCounts={currentAssetCounts} />
      </div>
    </main>
  )
}
