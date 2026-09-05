import Link from 'next/link'
import { Layers3, Radar } from 'lucide-react'
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

export default async function DiscoveryPage() {
  await requireUser()
  const supabase = await createClient()
  const [sources, runs, currentAssets] = await Promise.all([
    supabase
      .schema('catalog')
      .from('data_sources')
      .select('id,project_id,name,source_type,status')
      .in('status', ['ACTIVE', 'CONFIGURED'])
      .order('name'),
    supabase
      .schema('catalog')
      .from('discovery_runs')
      .select('id,project_id,source_id,status,assets_discovered,objects_observed,objects_added,objects_changed,objects_removed,objects_missing,objects_unchanged,catalog_revision_id,scope_version_id,consistency_mode,error_message,started_at,completed_at')
      .order('started_at', { ascending: false })
      .limit(200),
    supabase
      .schema('catalog')
      .from('current_catalog_source_assets')
      .select('source_id'),
  ])

  if (sources.error) throw new Error(`Unable to load discovery sources: ${sources.error.message}`)
  if (runs.error) throw new Error(`Unable to load discovery history: ${runs.error.message}`)
  if (currentAssets.error) throw new Error(`Unable to load current published catalog assets: ${currentAssets.error.message}`)

  const sourceRows = sources.data ?? []
  const currentAssetCounts = (currentAssets.data ?? []).reduce<Record<string, number>>((counts, asset) => {
    counts[asset.source_id] = (counts[asset.source_id] ?? 0) + 1
    return counts
  }, {})

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
        <DiscoveryManager sources={sourceRows} runs={runs.data ?? []} jobs={jobs} currentAssetCounts={currentAssetCounts} />
      </div>
    </main>
  )
}
