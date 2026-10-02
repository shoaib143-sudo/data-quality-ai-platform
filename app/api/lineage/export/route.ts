import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createClient } from '@/lib/supabase/server'
import { createXlsxWorkbook } from '@/lib/export/xlsx'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { canAccessWorkspace } from '@/lib/governance/workspace-access'

function text(value: unknown) { return typeof value === 'string' ? value : value == null ? '' : String(value) }

export async function GET() {
  try {
    const user = await requireApiUser()
    const landing = await resolveLandingAccess(user.id)
    if (!canAccessWorkspace(landing.persona, 'lineage', landing.organizationRole)) {
      return NextResponse.json({ error: 'Lineage export is not available for this persona.' }, { status: 403 })
    }
    const supabase = await createClient()

    const [mappingsResult, assetsResult, transformationsResult, catalogResult, findingsResult, issuesResult, alertsResult] = await Promise.all([
      supabase.schema('governance').from('lineage_column_mappings')
        .select('id,project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression,metadata,created_at')
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase.schema('governance').from('lineage_assets')
        .select('id,project_id,namespace,name,asset_type,dataset_id,metadata,last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(5000),
      supabase.schema('governance').from('lineage_transformations')
        .select('id,project_id,external_id,source_system,name,operation,logic_language,logic_hash,metadata,first_seen_at,last_seen_at')
        .order('last_seen_at', { ascending: false })
        .limit(5000),
      supabase.schema('governance').from('dataset_catalog').select('dataset_id,project_id,lifecycle_status,certification_status,criticality,tags,business_description,technical_owner_user_id,business_owner_user_id,steward_user_id,retention_days').limit(5000),
      supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,severity,finding_type,title,description,created_at').order('created_at',{ascending:false}).limit(5000),
      supabase.schema('governance').from('issues').select('id,project_id,dataset_id,status,severity,title,created_at').order('created_at',{ascending:false}).limit(5000),
      supabase.schema('profiling').from('observability_alerts').select('id,project_id,dataset_id,status,severity,category,title,last_observed_at').order('last_observed_at',{ascending:false}).limit(5000),
    ])
    for (const result of [mappingsResult, assetsResult, transformationsResult, catalogResult, findingsResult, issuesResult, alertsResult]) {
      if (result.error) throw new Error(result.error.message)
    }

    const mappings = mappingsResult.data ?? []
    const assets = assetsResult.data ?? []
    const transformations = transformationsResult.data ?? []
    const catalog = catalogResult.data ?? []
    const findings = findingsResult.data ?? []
    const issues = issuesResult.data ?? []
    const alerts = alertsResult.data ?? []
    const assetById = new Map(assets.map((row: any) => [String(row.id), row]))
    const transformationById = new Map(transformations.map((row: any) => [String(row.id), row]))

    const mappingRows = [
      ['Lineage Name','Source System','Source Namespace','Source Asset','Source Column','Source Data Type','Transformation Rule','Transformation Language','Target Namespace','Target Asset','Target Column','Target Data Type','Operation','Confidence','Evidence Source','Code Reference','First Seen','Last Seen','Version','Project ID','Transformation ID','Mapping ID','Notes'],
      ...mappings.map((mapping: any) => {
        const source = assetById.get(String(mapping.source_asset_id))
        const target = assetById.get(String(mapping.target_asset_id))
        const transformation = mapping.transformation_id ? transformationById.get(String(mapping.transformation_id)) : null
        const mappingMetadata = mapping.metadata && typeof mapping.metadata === 'object' ? mapping.metadata as Record<string, unknown> : {}
        const sourceMetadata = source?.metadata && typeof source.metadata === 'object' ? source.metadata as Record<string, unknown> : {}
        const targetMetadata = target?.metadata && typeof target.metadata === 'object' ? target.metadata as Record<string, unknown> : {}
        const transformationMetadata = transformation?.metadata && typeof transformation.metadata === 'object' ? transformation.metadata as Record<string, unknown> : {}
        return [
          text(transformation?.name || transformation?.external_id || mapping.id),
          text(transformation?.source_system),
          text(source?.namespace),
          text(source?.name),
          text(mapping.source_column),
          text(mappingMetadata.source_data_type ?? sourceMetadata.data_type),
          text(mapping.expression),
          text(transformation?.logic_language),
          text(target?.namespace),
          text(target?.name),
          text(mapping.target_column),
          text(mappingMetadata.target_data_type ?? targetMetadata.data_type),
          text(mapping.operation || transformation?.operation),
          text(mappingMetadata.confidence ?? transformationMetadata.confidence),
          text(mappingMetadata.evidence_source ?? transformationMetadata.evidence_source ?? transformation?.source_system),
          text(mappingMetadata.code_reference ?? transformationMetadata.code_reference),
          text(transformation?.first_seen_at ?? mapping.created_at),
          text(transformation?.last_seen_at ?? mapping.created_at),
          text(mappingMetadata.version ?? transformationMetadata.version ?? 'current'),
          text(mapping.project_id),
          text(mapping.transformation_id),
          text(mapping.id),
          text(mappingMetadata.notes ?? transformationMetadata.notes),
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
      ['Note', 'Only persisted governed mappings are exported as authoritative lineage evidence.'],
    ]

    const businessRows = [
      ['Dataset ID','Project ID','Lifecycle','Certification','Criticality','Tags','Business Description','Technical Owner','Business Owner','Steward','Retention Days'],
      ...catalog.map((row:any)=>[text(row.dataset_id),text(row.project_id),text(row.lifecycle_status),text(row.certification_status),text(row.criticality),Array.isArray(row.tags)?row.tags.join(', '):'',text(row.business_description),text(row.technical_owner_user_id),text(row.business_owner_user_id),text(row.steward_user_id),row.retention_days??'']),
    ]
    const qualityRows = [
      ['Finding ID','Profile Run ID','Severity','Category','Title','Description','Created At'],
      ...findings.map((row:any)=>[text(row.id),text(row.profile_run_id),text(row.severity),text(row.finding_type),text(row.title),text(row.description),text(row.created_at)]),
    ]
    const issueAlertRows = [
      ['Evidence Type','ID','Project ID','Dataset ID','Status','Severity','Category','Title','Observed At'],
      ...issues.map((row:any)=>['ISSUE',text(row.id),text(row.project_id),text(row.dataset_id),text(row.status),text(row.severity),'',text(row.title),text(row.created_at)]),
      ...alerts.map((row:any)=>['ALERT',text(row.id),text(row.project_id),text(row.dataset_id),text(row.status),text(row.severity),text(row.category),text(row.title),text(row.last_observed_at)]),
    ]

    const workbook = createXlsxWorkbook([
      { name: 'Summary', rows: summaryRows },
      { name: 'Source to Target Mapping', rows: mappingRows },
      { name: 'Transformations', rows: transformationRows },
      { name: 'Assets', rows: assetRows },
      { name: 'Business Metadata', rows: businessRows },
      { name: 'Data Quality Context', rows: qualityRows },
      { name: 'Issues and Alerts', rows: issueAlertRows },
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
