import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const SOURCE_AUTHORITY_SEMANTIC='DERIVED_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_LIFECYCLE'
const JDBC_AUTHORITY_SEMANTIC='OBSERVED_JDBC_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_CONFIGURATION'
const JDBC_ACCEPTANCE_AUTHORITY='catalog.verify_jdbc_source_acceptance'

function csvCell(value: unknown) {
  const text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value)
  return `"${text.replaceAll('"','""')}"`
}

export async function GET(request: Request) {
  try {
    const user=await requireUser()
    const url=new URL(request.url)
    const projectId=(url.searchParams.get('projectId')??'').trim()
    const format=(url.searchParams.get('format')??'csv').toLowerCase()
    if(!projectId) return NextResponse.json({error:'projectId is required.'},{status:400})
    if(!['csv','json'].includes(format)) return NextResponse.json({error:'format must be csv or json.'},{status:400})

    const admin=createAdminClient()
    const {data:project,error:projectError}=await admin.schema('app').from('projects').select('id,name,organization_id').eq('id',projectId).maybeSingle()
    if(projectError||!project) return NextResponse.json({error:'Project not found.'},{status:404})
    const {data:membership,error:membershipError}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',user.id).maybeSingle()
    if(membershipError||!membership) return NextResponse.json({error:'Project access denied.'},{status:403})

    const [{data:datasets,error:datasetsError},{data:sources,error:sourcesError}]=await Promise.all([
      admin.schema('catalog').from('datasets').select('id,project_id,name,business_domain,source_identifier,data_source_id').eq('project_id',projectId).order('name'),
      admin.schema('catalog').from('data_sources').select('id,project_id,name,source_type,status').eq('project_id',projectId).order('name'),
    ])
    if(datasetsError) throw new Error(`Unable to load datasets: ${datasetsError.message}`)
    if(sourcesError) throw new Error(`Unable to load data sources: ${sourcesError.message}`)
    const datasetIds=(datasets??[]).map((dataset)=>dataset.id)
    const sourceIds=(sources??[]).map((source)=>source.id)

    const [{data:readiness,error:readinessError},{data:jdbcEvidence,error:jdbcEvidenceError}]=await Promise.all([
      sourceIds.length?admin.schema('catalog').from('source_operational_readiness').select('source_id,lifecycle_status,operational_state,has_observation_evidence,current_assets,latest_run_status,latest_run_completed_at,evidence_reason').in('source_id',sourceIds):Promise.resolve({data:[],error:null}),
      sourceIds.length?admin.schema('catalog').from('jdbc_discovery_evidence').select('source_id,evidence_state,current_assets,current_fields,namespace_count,completed_runs,identity_unique_and_complete,catalog_projection_complete,multi_namespace_observed,repeat_scan_evidence_present,repeat_scan_stable,authority_semantic').in('source_id',sourceIds):Promise.resolve({data:[],error:null}),
    ])
    if(readinessError) throw new Error(`Unable to load source readiness evidence: ${readinessError.message}`)
    if(jdbcEvidenceError) throw new Error(`Unable to load JDBC discovery evidence: ${jdbcEvidenceError.message}`)

    const readinessBySource=new Map((readiness??[]).map((row)=>[row.source_id,row]))
    const jdbcBySource=new Map((jdbcEvidence??[]).map((row)=>[row.source_id,row]))
    const sourceById=new Map((sources??[]).map((source)=>[source.id,source]))
    const sourceEvidence=(sources??[]).map((source)=>{
      const operational=readinessBySource.get(source.id)
      const jdbc=jdbcBySource.get(source.id)
      return {
        source_id:source.id,
        source_name:source.name,
        source_type:source.source_type,
        lifecycle_status:source.status,
        operational_state:operational?.operational_state??'UNOBSERVED',
        has_observation_evidence:operational?.has_observation_evidence??false,
        current_assets:operational?.current_assets??0,
        latest_discovery_status:operational?.latest_run_status??null,
        latest_discovery_at:operational?.latest_run_completed_at??null,
        evidence_reason:operational?.evidence_reason??'No governed operational evidence is available.',
        jdbc_evidence_state:jdbc?.evidence_state??null,
        jdbc_current_fields:jdbc?.current_fields??null,
        jdbc_namespace_count:jdbc?.namespace_count??null,
        jdbc_completed_runs:jdbc?.completed_runs??null,
        jdbc_identity_unique_and_complete:jdbc?.identity_unique_and_complete??null,
        jdbc_catalog_projection_complete:jdbc?.catalog_projection_complete??null,
        jdbc_multi_namespace_observed:jdbc?.multi_namespace_observed??null,
        jdbc_repeat_scan_evidence_present:jdbc?.repeat_scan_evidence_present??null,
        jdbc_repeat_scan_stable:jdbc?.repeat_scan_stable??null,
        source_authority_semantic:SOURCE_AUTHORITY_SEMANTIC,
        jdbc_authority_semantic:jdbc?.authority_semantic??null,
        jdbc_acceptance_authority:jdbc?JDBC_ACCEPTANCE_AUTHORITY:null,
      }
    })
    const sourceEvidenceById=new Map(sourceEvidence.map((row)=>[row.source_id,row]))

    const [{data:versions,error:versionsError},{data:catalogRows,error:catalogError},{data:alerts,error:alertsError},{data:issues,error:issuesError},{data:rules,error:rulesError},{data:classifications,error:classificationsError},{data:stewards,error:stewardsError}]=await Promise.all([
      datasetIds.length?admin.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number,status').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
      datasetIds.length?admin.schema('governance').from('dataset_catalog').select('dataset_id,lifecycle_status,certification_status,criticality,tags,retention_days').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
      datasetIds.length?admin.schema('profiling').from('observability_alerts').select('id,dataset_id,severity,status,category').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
      datasetIds.length?admin.schema('governance').from('issues').select('id,dataset_id,severity,status').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
      datasetIds.length?admin.schema('profiling').from('quality_rule_definitions').select('id,dataset_id,enabled,severity').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
      datasetIds.length?admin.schema('governance').from('dataset_classifications').select('id,dataset_id,status,column_name,label_id').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
      datasetIds.length?admin.schema('governance').from('stewardship_assignments').select('id,dataset_id,role,active').in('dataset_id',datasetIds):Promise.resolve({data:[],error:null}),
    ])
    for(const [label,error] of [['versions',versionsError],['catalog',catalogError],['alerts',alertsError],['issues',issuesError],['rules',rulesError],['classifications',classificationsError],['stewardship',stewardsError]] as const) if(error) throw new Error(`Unable to load ${label}: ${error.message}`)

    const versionIds=(versions??[]).map((version)=>version.id)
    const {data:runs,error:runsError}=versionIds.length?await admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,row_count,column_count,started_at,completed_at').in('dataset_version_id',versionIds).order('started_at',{ascending:false}):{data:[],error:null}
    if(runsError) throw new Error(`Unable to load profiling runs: ${runsError.message}`)
    const runIds=(runs??[]).map((run)=>run.id)
    const {data:scores,error:scoresError}=runIds.length?await admin.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score,completeness_score,uniqueness_score,validity_score,accuracy_score').in('profile_run_id',runIds):{data:[],error:null}
    if(scoresError) throw new Error(`Unable to load data quality scores: ${scoresError.message}`)

    const ruleIds=(rules??[]).map((rule)=>rule.id)
    const {data:ruleRuns,error:ruleRunsError}=ruleIds.length?await admin.schema('profiling').from('quality_rule_runs').select('rule_definition_id,status,started_at').in('rule_definition_id',ruleIds).order('started_at',{ascending:false}):{data:[],error:null}
    if(ruleRunsError) throw new Error(`Unable to load rule executions: ${ruleRunsError.message}`)

    const catalogByDataset=new Map((catalogRows??[]).map((row)=>[row.dataset_id,row]))
    const versionById=new Map((versions??[]).map((version)=>[version.id,version]))
    const scoreByRun=new Map((scores??[]).map((score)=>[score.profile_run_id,score]))
    const latestRunByDataset=new Map<string,any>()
    for(const run of runs??[]) {
      const datasetId=versionById.get(run.dataset_version_id)?.dataset_id
      if(datasetId&&!latestRunByDataset.has(datasetId)) latestRunByDataset.set(datasetId,run)
    }
    const latestRuleStatus=new Map<string,string>()
    for(const run of ruleRuns??[]) if(!latestRuleStatus.has(run.rule_definition_id)) latestRuleStatus.set(run.rule_definition_id,run.status)

    const reportRows=(datasets??[]).map((dataset)=>{
      const catalog=catalogByDataset.get(dataset.id)
      const latestRun=latestRunByDataset.get(dataset.id)
      const score=latestRun?scoreByRun.get(latestRun.id):null
      const datasetAlerts=(alerts??[]).filter((alert)=>alert.dataset_id===dataset.id&&alert.status!=='RESOLVED')
      const datasetIssues=(issues??[]).filter((issue)=>issue.dataset_id===dataset.id&&!['RESOLVED','CLOSED'].includes(String(issue.status).toUpperCase()))
      const datasetRules=(rules??[]).filter((rule)=>rule.dataset_id===dataset.id&&rule.enabled)
      const failedRules=datasetRules.filter((rule)=>latestRuleStatus.get(rule.id)==='FAILED')
      const datasetClassifications=(classifications??[]).filter((classification)=>classification.dataset_id===dataset.id)
      const datasetStewards=(stewards??[]).filter((assignment)=>assignment.dataset_id===dataset.id&&assignment.active)
      const source=dataset.data_source_id?sourceById.get(dataset.data_source_id):null
      const sourceEvidenceRow=dataset.data_source_id?sourceEvidenceById.get(dataset.data_source_id):null
      return {
        dataset_id:dataset.id,
        dataset_name:dataset.name,
        business_domain:dataset.business_domain??'',
        source_identifier:dataset.source_identifier??'',
        data_source_id:dataset.data_source_id??null,
        source_name:source?.name??null,
        source_type:source?.source_type??null,
        source_lifecycle_status:sourceEvidenceRow?.lifecycle_status??null,
        source_operational_state:sourceEvidenceRow?.operational_state??null,
        source_observation_evidence:sourceEvidenceRow?.has_observation_evidence??null,
        source_current_assets:sourceEvidenceRow?.current_assets??null,
        source_latest_discovery_status:sourceEvidenceRow?.latest_discovery_status??null,
        source_latest_discovery_at:sourceEvidenceRow?.latest_discovery_at??null,
        jdbc_evidence_state:sourceEvidenceRow?.jdbc_evidence_state??null,
        jdbc_namespace_count:sourceEvidenceRow?.jdbc_namespace_count??null,
        jdbc_repeat_scan_stable:sourceEvidenceRow?.jdbc_repeat_scan_stable??null,
        jdbc_identity_unique_and_complete:sourceEvidenceRow?.jdbc_identity_unique_and_complete??null,
        jdbc_catalog_projection_complete:sourceEvidenceRow?.jdbc_catalog_projection_complete??null,
        lifecycle_status:catalog?.lifecycle_status??'ACTIVE',
        certification_status:catalog?.certification_status??'UNCERTIFIED',
        criticality:catalog?.criticality??'MEDIUM',
        tags:Array.isArray(catalog?.tags)?catalog.tags.join('|'):'',
        retention_days:catalog?.retention_days??null,
        latest_profile_status:latestRun?.status??'NOT_RUN',
        latest_profile_at:latestRun?.completed_at??latestRun?.started_at??null,
        row_count:latestRun?.row_count??null,
        column_count:latestRun?.column_count??null,
        overall_quality_score:score?.overall_score??null,
        completeness_score:score?.completeness_score??null,
        uniqueness_score:score?.uniqueness_score??null,
        validity_score:score?.validity_score??null,
        accuracy_score:score?.accuracy_score??null,
        enabled_quality_rules:datasetRules.length,
        failed_quality_rules:failedRules.length,
        open_observability_alerts:datasetAlerts.length,
        high_or_critical_alerts:datasetAlerts.filter((alert)=>['HIGH','CRITICAL'].includes(String(alert.severity).toUpperCase())).length,
        open_remediation_issues:datasetIssues.length,
        approved_classifications:datasetClassifications.filter((classification)=>classification.status==='APPROVED').length,
        suggested_classifications:datasetClassifications.filter((classification)=>classification.status==='SUGGESTED').length,
        active_stewardship_assignments:datasetStewards.length,
      }
    })

    const generatedAt=new Date().toISOString()
    const jdbcSources=sourceEvidence.filter((source)=>source.source_type==='JDBC')
    const summary={
      project:{id:project.id,name:project.name},
      generated_at:generatedAt,
      datasets:reportRows.length,
      certified_datasets:reportRows.filter((row)=>row.certification_status==='CERTIFIED').length,
      datasets_with_open_alerts:reportRows.filter((row)=>row.open_observability_alerts>0).length,
      datasets_with_failed_rules:reportRows.filter((row)=>row.failed_quality_rules>0).length,
      open_remediation_issues:reportRows.reduce((sum,row)=>sum+row.open_remediation_issues,0),
      sources:sourceEvidence.length,
      observed_ready_sources:sourceEvidence.filter((source)=>source.operational_state==='OBSERVED_READY').length,
      unobserved_sources:sourceEvidence.filter((source)=>source.operational_state==='UNOBSERVED').length,
      jdbc_sources:jdbcSources.length,
      observed_jdbc_sources:jdbcSources.filter((source)=>source.has_observation_evidence).length,
      multi_namespace_jdbc_sources:jdbcSources.filter((source)=>source.jdbc_multi_namespace_observed===true).length,
      repeat_scan_stable_jdbc_sources:jdbcSources.filter((source)=>source.jdbc_repeat_scan_stable===true).length,
      source_authority_semantic:SOURCE_AUTHORITY_SEMANTIC,
      jdbc_authority_semantic:JDBC_AUTHORITY_SEMANTIC,
      jdbc_acceptance_authority:JDBC_ACCEPTANCE_AUTHORITY,
    }

    await writeGovernanceAudit({projectId,actorUserId:user.id,eventType:'GOVERNANCE_REPORT_EXPORTED',entityType:'PROJECT',entityId:projectId,metadata:{format,dataset_count:reportRows.length,source_count:sourceEvidence.length,observed_ready_sources:summary.observed_ready_sources}})

    if(format==='json') {
      return new NextResponse(JSON.stringify({summary,source_evidence:sourceEvidence,rows:reportRows},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="governance-report-${project.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${generatedAt.slice(0,10)}.json"`}})
    }

    const headers=Object.keys(reportRows[0]??{dataset_id:'',dataset_name:''})
    const csv=[headers.map(csvCell).join(','),...reportRows.map((row)=>headers.map((header)=>csvCell((row as Record<string,unknown>)[header])).join(','))].join('\n')
    return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="governance-report-${project.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${generatedAt.slice(0,10)}.csv"`}})
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to generate governance report.'},{status:500})
  }
}
