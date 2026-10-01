import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createClient } from '@/lib/supabase/server'
import { createXlsxWorkbook } from '@/lib/export/xlsx'

function text(value: unknown) { return typeof value === 'string' ? value : value == null ? '' : String(value) }

export async function GET() {
  try {
    await requireApiUser()
    const supabase = await createClient()

    const [mappingsResult, assetsResult, transformationsResult] = await Promise.all([
      supabase.schema('governance').from('lineage_column_mappings')
        .select('id,project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,created_at')
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase.schema('governance').from('lineage_assets')
        .select('id,project_id,namespace,name,asset_type,dataset_id,last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(5000),
      supabase.schema('governance').from('lineage_transformations')
        .select('id,project_id,external_id,source_system,name,operation,logic_language,logic_hash,last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(5000),
    ])
    for (const result of [mappingsResult, assetsResult, transformationsResult]) {
      if (result.error) throw new Error(result.error.message)
    }

    const mappings = mappingsResult.data ?? []
    const assets = assetsResult.data ?? []
    const transformations = transformationsResult.data ?? []
    const assetById = new Map(assets.map((row: any) => [String(row.id), row]))
    const transformationById = new Map(transformations.map((row: any) => [String(row.id), row]))

    const mappingRows = [
      ['Lineage Name','Source System','Source Namespace','Source Asset','Source Column','Transformation Rule','Transformation Language','Target Namespace','Target Asset','Target Column','Operation','Project ID','Transformation ID','Mapping ID','Observed At'],
      ...mappings.map((mapping: any) => {
        const source = assetById.get(String(mapping.source_asset_id))
        const target = assetById.get(String(mapping.target_asset_id))
        const transformation = mapping.transformation_id ? transformationById.get(String(mapping.transformation_id)) : null
        return [
          text(transformation?.name || transformation?.external_id || mapping.id),
          text(transformation?.source_system),
          text(source?.namespace),
          text(source?.name),
          text(mapping.source_column),
          text(mapping.expression),
          text(transformation?.logic_language),
          text(target?.namespace),
          text(target?.name),
          text(mapping.target_column),
          text(mapping.operation || transformation?.operation),
          text(mapping.project_id),
          text(mapping.transformation_id),
          text(mapping.id),
          text(mapping.created_at),
        ]
      }),
    ]

    const transformationRows = [
      ['Transformation','External ID','Source System','Operation','Logic Language','Logic Hash','Project ID','Last Seen'],
      ...transformations.map((row: any) => [
        text(row.name), text(row.external_id), text(row.source_system), text(row.operation),
        text(row.logic_language), text(row.logic_hash), text(row.project_id), text(row.last_seen_at),
      ]),
    ]

    const assetRows = [
      ['Asset','Namespace','Asset Type','Dataset ID','Project ID','Last Seen'],
      ...assets.map((row: any) => [
        text(row.name), text(row.namespace), text(row.asset_type), text(row.dataset_id),
        text(row.project_id), text(row.last_seen_at),
      ]),
    ]

    const summaryRows = [
      ['DataNexus Lineage Export','Value'],
      ['Generated At', new Date().toISOString()],
      ['Source to Target Mappings', mappings.length],
      ['Transformations', transformations.length],
      ['Assets', assets.length],
      ['Authority', 'Persisted governed lineage evidence visible to the authenticated user'],
      ['Note', 'DataNexus does not infer missing lineage from matching names.'],
    ]

    const workbook = createXlsxWorkbook([
      { name: 'Summary', rows: summaryRows },
      { name: 'Source to Target Mapping', rows: mappingRows },
      { name: 'Transformations', rows: transformationRows },
      { name: 'Assets', rows: assetRows },
    ])

    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(workbook, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="DataNexus-lineage-${stamp}.xlsx"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to export lineage.' }, { status: 500 })
  }
}
