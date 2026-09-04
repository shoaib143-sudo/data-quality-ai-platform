import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

function boundedLimit(value: string | null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(5, Math.min(100, Math.trunc(parsed))) : 25
}

export async function GET(request: Request) {
  try {
    await requireUser()
    const limit = boundedLimit(new URL(request.url).searchParams.get('limit'))
    const supabase = await createClient()
    const { data, error } = await supabase
      .schema('profiling')
      .from('profile_runs')
      .select('id,dataset_version_id,status,engine_name,engine_version,row_count,column_count,started_at,completed_at,error_code')
      .order('started_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)

    const versionIds = [...new Set((data ?? []).map((run) => run.dataset_version_id).filter(Boolean))]
    const { data: versions, error: versionError } = versionIds.length
      ? await supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number').in('id', versionIds)
      : { data: [], error: null }
    if (versionError) throw new Error(versionError.message)

    const datasetIds = [...new Set((versions ?? []).map((version) => version.dataset_id).filter(Boolean))]
    const { data: datasets, error: datasetError } = datasetIds.length
      ? await supabase.schema('catalog').from('datasets').select('id,name,project_id').in('id', datasetIds)
      : { data: [], error: null }
    if (datasetError) throw new Error(datasetError.message)

    const versionById = new Map((versions ?? []).map((version) => [version.id, version]))
    const datasetById = new Map((datasets ?? []).map((dataset) => [dataset.id, dataset]))
    const runs = (data ?? []).map((run) => {
      const version = versionById.get(run.dataset_version_id)
      const dataset = version ? datasetById.get(version.dataset_id) : null
      return {
        id: run.id,
        projectId: dataset?.project_id ?? null,
        datasetId: dataset?.id ?? null,
        datasetName: dataset?.name ?? 'Unknown dataset',
        datasetVersionId: run.dataset_version_id,
        versionNumber: version?.version_number ?? null,
        status: run.status,
        engineName: run.engine_name,
        engineVersion: run.engine_version,
        rowCount: run.row_count,
        columnCount: run.column_count,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        errorCode: run.error_code,
      }
    })

    return NextResponse.json({ runs, limit })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load profiling runs' }, { status: 500 })
  }
}
