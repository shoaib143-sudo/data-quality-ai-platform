import Link from 'next/link'
import { Activity } from 'lucide-react'

import ProfilingDashboard from '@/app/profiling/profiling-dashboard'
import { canonicalizeDocumentPreview } from '@/lib/profiling/canonical-document-preview'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'

type SearchParams = Promise<{ runId?: string }>

export default async function ProfilingPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const supabase = await createClient()
  const requested = await searchParams
  const requestedRunId = requested.runId?.trim() || null

  const runQuery = supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,status,engine_name,engine_version,row_count,column_count,started_at,completed_at,dataset_version_id')

  const runResult = requestedRunId
    ? await runQuery.eq('id', requestedRunId).maybeSingle()
    : await runQuery.order('started_at', { ascending: false }).limit(1).maybeSingle()

  if (runResult.error) throw new Error(`Unable to load profiling run: ${runResult.error.message}`)
  const run = runResult.data

  if (!run) {
    return <main className="min-h-screen bg-slate-50 p-8 text-slate-950">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Activity className="h-7 w-7" /></div>
        <h1 className="mt-5 text-2xl font-black">No profiling evidence yet</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Run profiling on a governed dataset. Once the run persists evidence, this page will consolidate its summary, statistics, distributions, sensitive-data signals, outliers, duplicates and sample preview.</p>
        <Link href="/datasets" className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">Open datasets</Link>
      </div>
    </main>
  }

  const versionResult = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('dataset_id')
    .eq('id', run.dataset_version_id)
    .maybeSingle()
  if (versionResult.error || !versionResult.data) throw new Error(`Unable to resolve profiling dataset version: ${versionResult.error?.message ?? 'dataset version not found'}`)

  const datasetResult = await supabase
    .schema('catalog')
    .from('datasets')
    .select('id,name,description,business_domain')
    .eq('id', versionResult.data.dataset_id)
    .maybeSingle()
  if (datasetResult.error || !datasetResult.data) throw new Error(`Unable to resolve profiling dataset: ${datasetResult.error?.message ?? 'dataset not found'}`)

  const [columnsResult, metricsResult, distributionsResult, findingsResult, documentResult] = await Promise.all([
    supabase.schema('profiling').from('profile_columns')
      .select('id,column_name,source_type,inferred_type,semantic_type,nullable,total_count,non_null_count,null_count,distinct_count,distinct_percentage')
      .eq('profile_run_id', run.id)
      .order('ordinal_position'),
    supabase.schema('profiling').from('profile_metrics')
      .select('profile_column_id,metric_key,numeric_value,text_value,boolean_value,json_value')
      .eq('profile_run_id', run.id)
      .order('metric_key')
      .limit(3000),
    supabase.schema('profiling').from('profile_distributions')
      .select('profile_column_id,distribution_type,distribution')
      .eq('profile_run_id', run.id)
      .order('distribution_type')
      .limit(1500),
    supabase.schema('profiling').from('profile_findings')
      .select('id,profile_column_id,finding_type,severity,title,description,confidence')
      .eq('profile_run_id', run.id)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.schema('governance').from('documents')
      .select('id,file_name,file_type,content_type')
      .eq('profile_run_id', run.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (columnsResult.error) throw new Error(`Unable to load profiling columns: ${columnsResult.error.message}`)
  if (metricsResult.error) throw new Error(`Unable to load profiling metrics: ${metricsResult.error.message}`)
  if (distributionsResult.error) throw new Error(`Unable to load profiling distributions: ${distributionsResult.error.message}`)
  if (findingsResult.error) throw new Error(`Unable to load profiling findings: ${findingsResult.error.message}`)
  if (documentResult.error) throw new Error(`Unable to load governed sample document: ${documentResult.error.message}`)

  const chunksResult = documentResult.data
    ? await supabase.schema('governance').from('document_chunks')
        .select('chunk_index,content,character_count')
        .eq('document_id', documentResult.data.id)
        .order('chunk_index')
        .limit(50)
    : { data: [], error: null }

  if (chunksResult.error) throw new Error(`Unable to load governed sample evidence: ${chunksResult.error.message}`)

  const canonicalPreview = canonicalizeDocumentPreview(chunksResult.data ?? [], {
    documentPresent: Boolean(documentResult.data),
    maxSamples: 50,
  })

  const columns = (columnsResult.data ?? []) as any[]
  const metrics = [...((metricsResult.data ?? []) as any[])]
  const textColumn = columns.find((column) => String(column.column_name ?? '').toLowerCase() === 'text')
  if (textColumn && canonicalPreview.sensitiveEvidence.length && !metrics.some((metric) => metric.profile_column_id === textColumn.id && metric.metric_key === 'sensitive_match_rate')) {
    metrics.push({
      profile_column_id: textColumn.id,
      metric_key: 'sensitive_match_rate',
      numeric_value: 1,
      text_value: canonicalPreview.sensitiveEvidence.map((item) => `${item.type}:${item.count}`).join(','),
      boolean_value: null,
      json_value: canonicalPreview.sensitiveEvidence,
    })
  }

  const subtitleParts = [
    datasetResult.data.business_domain ? `Domain ${datasetResult.data.business_domain}` : null,
    documentResult.data?.file_name ?? null,
  ].filter(Boolean)

  return <ProfilingDashboard
    run={run}
    datasetName={datasetResult.data.name}
    datasetSubtitle={subtitleParts.length ? subtitleParts.join(' · ') : datasetResult.data.description}
    columns={columns as any}
    metrics={metrics as any}
    distributions={(distributionsResult.data ?? []) as any}
    findings={(findingsResult.data ?? []) as any}
    samples={canonicalPreview.samples}
  />
}
