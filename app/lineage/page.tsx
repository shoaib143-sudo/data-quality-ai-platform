import Link from 'next/link'
import { GitBranch, Layers3 } from 'lucide-react'
import { requireUser } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/server'
import { LineageExplorer, type DatasetEdge, type FieldMapping, type LineageField } from './lineage-explorer'

const asNumber=(value:unknown)=>{const parsed=typeof value==='number'?value:Number(value);return Number.isFinite(parsed)?parsed:null}
const normalizeUnit=(value:unknown)=>{const parsed=asNumber(value);if(parsed===null)return null;return parsed>1?parsed/100:parsed}
const normalizeScore100=(value:unknown)=>{const parsed=asNumber(value);if(parsed===null)return null;return parsed<=1?parsed*100:parsed}
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value))
const fieldKey=(datasetId:string|null,assetId:string,columnName:string)=>`${datasetId??`asset:${assetId}`}::${columnName.trim().toLowerCase()}`
const findingPenalty=(severity:string)=>({CRITICAL:20,HIGH:12,MEDIUM:6,LOW:2}[severity.toUpperCase()]??1)

export default async function LineagePage(){
  await requireUser()
  const supabase=await createClient()

  const [
    edgesResult,datasetsResult,sourcesResult,versionsResult,runsResult,assetsResult,transformationsResult,mappingsResult,
    termsResult,glossaryMappingsResult,stewardshipResult,certificationsResult,classificationsResult,labelsResult,
    contractsResult,contractVersionsResult,issuesResult,alertsResult,
  ]=await Promise.all([
    supabase.schema('governance').from('lineage_edges').select('*').order('created_at',{ascending:false}).limit(1000),
    supabase.schema('catalog').from('datasets').select('id,name,project_id').order('name'),
    supabase.schema('catalog').from('data_sources').select('id,name,project_id,source_type').order('name'),
    supabase.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number'),
    supabase.schema('profiling').from('profile_runs').select('id,dataset_version_id,status,started_at,completed_at').in('status',['COMPLETED','PARTIAL']).order('started_at',{ascending:false}).limit(1000),
    supabase.schema('governance').from('lineage_assets').select('id,project_id,namespace,name,asset_type,dataset_id').order('last_seen_at',{ascending:false}).limit(5000),
    supabase.schema('governance').from('lineage_transformations').select('id,source_system,name,operation,logic_language,transformation_logic,logic_hash,metadata,last_seen_at').order('last_seen_at',{ascending:false}).limit(2000),
    supabase.schema('governance').from('lineage_column_mappings').select('id,project_id,transformation_id,source_asset_id,source_column,target_asset_id,target_column,operation,expression').order('created_at',{ascending:false}).limit(10000),
    supabase.schema('governance').from('glossary_terms').select('id,project_id,term,definition,domain,status,owner_user_id').order('term'),
    supabase.schema('governance').from('glossary_mappings').select('id,term_id,dataset_id,column_name,confidence,approved,approved_by'),
    supabase.schema('governance').from('stewardship_assignments').select('id,project_id,dataset_id,user_id,role,accountability,active').eq('active',true),
    supabase.schema('governance').from('certification_requests').select('id,project_id,dataset_id,status,requested_at,decided_at').order('requested_at',{ascending:false}),
    supabase.schema('governance').from('dataset_classifications').select('id,project_id,dataset_id,column_name,label_id,status,confidence,source').order('updated_at',{ascending:false}),
    supabase.schema('governance').from('classification_labels').select('id,project_id,code,name,category').eq('enabled',true),
    supabase.schema('governance').from('data_contracts').select('id,project_id,dataset_id,name,status,current_version').order('updated_at',{ascending:false}),
    supabase.schema('governance').from('data_contract_versions').select('id,contract_id,version_number,status,critical_columns,effective_at').order('created_at',{ascending:false}),
    supabase.schema('governance').from('issues').select('id,project_id,dataset_id,profile_run_id,finding_id,title,severity,status').order('updated_at',{ascending:false}).limit(5000),
    supabase.schema('profiling').from('observability_alerts').select('id,project_id,dataset_id,profile_run_id,category,severity,title,status').order('last_observed_at',{ascending:false}).limit(5000),
  ])

  const baseResults=[edgesResult,datasetsResult,sourcesResult,versionsResult,runsResult,assetsResult,transformationsResult,mappingsResult,termsResult,glossaryMappingsResult,stewardshipResult,certificationsResult,classificationsResult,labelsResult,contractsResult,contractVersionsResult,issuesResult,alertsResult]
  for(const result of baseResults)if(result.error)throw new Error(result.error.message)

  const datasets=new Map((datasetsResult.data??[]).map((row:any)=>[row.id,row]))
  const sources=new Map((sourcesResult.data??[]).map((row:any)=>[row.id,row]))
  const versions=new Map((versionsResult.data??[]).map((row:any)=>[row.id,row]))
  const assets=new Map((assetsResult.data??[]).map((row:any)=>[row.id,row]))
  const transformations=new Map((transformationsResult.data??[]).map((row:any)=>[row.id,row]))
  const terms=new Map((termsResult.data??[]).map((row:any)=>[row.id,row]))
  const labels=new Map((labelsResult.data??[]).map((row:any)=>[row.id,row]))

  const latestRunByDataset=new Map<string,any>()
  for(const run of runsResult.data??[]){
    const version=versions.get(run.dataset_version_id)
    if(version&&!latestRunByDataset.has(version.dataset_id))latestRunByDataset.set(version.dataset_id,run)
  }
  const latestRunIds=[...latestRunByDataset.values()].map(run=>run.id)

  let profileColumns:any[]=[]
  let profileFindings:any[]=[]
  let profileMetrics:any[]=[]
  let qualityScores:any[]=[]
  if(latestRunIds.length){
    const [columnsResult,findingsResult,metricsResult,scoresResult]=await Promise.all([
      supabase.schema('profiling').from('profile_columns').select('id,profile_run_id,column_name,inferred_type,semantic_type,nullable,is_candidate_key,total_count,non_null_count,null_count,distinct_percentage').in('profile_run_id',latestRunIds).limit(20000),
      supabase.schema('profiling').from('profile_findings').select('id,profile_run_id,profile_column_id,severity,title').in('profile_run_id',latestRunIds).limit(20000),
      supabase.schema('profiling').from('profile_metrics').select('id,profile_run_id,profile_column_id,metric_key,numeric_value').in('profile_run_id',latestRunIds).in('metric_key',['null_rate','unique_rate','distinct_rate']).limit(50000),
      supabase.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').in('profile_run_id',latestRunIds),
    ])
    for(const result of [columnsResult,findingsResult,metricsResult,scoresResult])if(result.error)throw new Error(result.error.message)
    profileColumns=columnsResult.data??[]
    profileFindings=findingsResult.data??[]
    profileMetrics=metricsResult.data??[]
    qualityScores=scoresResult.data??[]
  }

  const profileColumnByDatasetField=new Map<string,any>()
  const datasetByRun=new Map<string,string>()
  for(const [datasetId,run] of latestRunByDataset)datasetByRun.set(run.id,datasetId)
  for(const column of profileColumns){const datasetId=datasetByRun.get(column.profile_run_id);if(datasetId)profileColumnByDatasetField.set(`${datasetId}::${String(column.column_name).toLowerCase()}`,column)}

  const metricsByColumn=new Map<string,Map<string,number>>()
  for(const metric of profileMetrics){if(!metric.profile_column_id)continue;const value=asNumber(metric.numeric_value);if(value===null)continue;const current=metricsByColumn.get(metric.profile_column_id)??new Map<string,number>();current.set(metric.metric_key,value);metricsByColumn.set(metric.profile_column_id,current)}
  const findingsByColumn=new Map<string,any[]>()
  for(const finding of profileFindings){if(!finding.profile_column_id)continue;const rows=findingsByColumn.get(finding.profile_column_id)??[];rows.push(finding);findingsByColumn.set(finding.profile_column_id,rows)}
  const qualityByRun=new Map(qualityScores.map(row=>[row.profile_run_id,normalizeScore100(row.overall_score)]))

  const glossaryByDataset=new Map<string,any[]>()
  for(const mapping of glossaryMappingsResult.data??[]){const rows=glossaryByDataset.get(mapping.dataset_id)??[];rows.push(mapping);glossaryByDataset.set(mapping.dataset_id,rows)}
  const stewardshipByDataset=new Map<string,any[]>()
  for(const assignment of stewardshipResult.data??[]){const rows=stewardshipByDataset.get(assignment.dataset_id)??[];rows.push(assignment);stewardshipByDataset.set(assignment.dataset_id,rows)}
  const certificationByDataset=new Map<string,any>()
  for(const certification of certificationsResult.data??[])if(!certificationByDataset.has(certification.dataset_id))certificationByDataset.set(certification.dataset_id,certification)
  const classificationsByDataset=new Map<string,any[]>()
  for(const classification of classificationsResult.data??[]){const rows=classificationsByDataset.get(classification.dataset_id)??[];rows.push(classification);classificationsByDataset.set(classification.dataset_id,rows)}
  const contractsByDataset=new Map<string,any[]>()
  for(const contract of contractsResult.data??[]){const rows=contractsByDataset.get(contract.dataset_id)??[];rows.push(contract);contractsByDataset.set(contract.dataset_id,rows)}
  const contractVersionByKey=new Map((contractVersionsResult.data??[]).map((version:any)=>[`${version.contract_id}:${version.version_number}`,version]))
  const issuesByDataset=new Map<string,any[]>()
  for(const issue of issuesResult.data??[]){if(!issue.dataset_id)continue;const rows=issuesByDataset.get(issue.dataset_id)??[];rows.push(issue);issuesByDataset.set(issue.dataset_id,rows)}
  const alertsByDataset=new Map<string,any[]>()
  for(const alert of alertsResult.data??[]){if(!alert.dataset_id)continue;const rows=alertsByDataset.get(alert.dataset_id)??[];rows.push(alert);alertsByDataset.set(alert.dataset_id,rows)}

  function buildField(assetId:string,columnName:string,datasetIdOverride:string|null=null,assetNameOverride:string|null=null):LineageField{
    const asset=assets.get(assetId)
    const datasetId=datasetIdOverride??asset?.dataset_id??null
    const dataset=datasetId?datasets.get(datasetId):null
    const latestRun=datasetId?latestRunByDataset.get(datasetId):null
    const profileColumn=datasetId?profileColumnByDatasetField.get(`${datasetId}::${columnName.toLowerCase()}`):null
    const metrics=profileColumn?metricsByColumn.get(profileColumn.id):null
    const findings=profileColumn?findingsByColumn.get(profileColumn.id)??[]:[]
    const nullRate=metrics?.has('null_rate')?normalizeUnit(metrics.get('null_rate')):profileColumn&&asNumber(profileColumn.total_count)!==null&&Number(profileColumn.total_count)>0?Number(profileColumn.null_count??0)/Number(profileColumn.total_count):null
    const completeness=nullRate===null?null:clamp(1-nullRate,0,1)
    const uniqueness=metrics?.has('unique_rate')?normalizeUnit(metrics.get('unique_rate')):null
    const datasetDqScore=latestRun?qualityByRun.get(latestRun.id)??null:null
    let dqScore:number|null=null
    if(completeness!==null){
      const base=profileColumn?.is_candidate_key&&uniqueness!==null?(completeness*70+uniqueness*30)*100:completeness*100
      const penalty=findings.reduce((sum:number,finding:any)=>sum+findingPenalty(String(finding.severity)),0)
      dqScore=clamp(base-Math.min(penalty,40),0,100)
    }else if(datasetDqScore!==null)dqScore=datasetDqScore

    const glossary=(datasetId?glossaryByDataset.get(datasetId)??[]:[]).filter((mapping:any)=>!mapping.column_name||String(mapping.column_name).toLowerCase()===columnName.toLowerCase()).map((mapping:any)=>{const term=terms.get(mapping.term_id);return term?{term:term.term,definition:term.definition??null,domain:term.domain??null,confidence:normalizeUnit(mapping.confidence),approved:Boolean(mapping.approved)}:null}).filter(Boolean) as LineageField['terms']
    const stakeholders=(datasetId?stewardshipByDataset.get(datasetId)??[]:[]).map((item:any)=>({role:item.role,accountability:item.accountability??null,userId:item.user_id}))
    const classifications=(datasetId?classificationsByDataset.get(datasetId)??[]:[]).filter((item:any)=>!item.column_name||String(item.column_name).toLowerCase()===columnName.toLowerCase()).map((item:any)=>{const label=labels.get(item.label_id);return label?{code:label.code,name:label.name,category:label.category??null,status:item.status,confidence:normalizeUnit(item.confidence)}:null}).filter(Boolean) as LineageField['classifications']
    const certificationRow=datasetId?certificationByDataset.get(datasetId):null
    const contracts=(datasetId?contractsByDataset.get(datasetId)??[]:[]).map((contract:any)=>{const version=contractVersionByKey.get(`${contract.id}:${contract.current_version}`);const criticalColumns=Array.isArray(version?.critical_columns)?version.critical_columns.map((value:unknown)=>String(value).toLowerCase()):[];return{name:contract.name,status:contract.status,version:contract.current_version??null,critical:criticalColumns.includes(columnName.toLowerCase())}})
    const findingIds=new Set(findings.map((finding:any)=>finding.id))
    const issues=(datasetId?issuesByDataset.get(datasetId)??[]:[]).filter((item:any)=>!['RESOLVED','CLOSED'].includes(String(item.status).toUpperCase())&&(!item.finding_id||findingIds.has(item.finding_id))).map((item:any)=>({severity:item.severity,status:item.status,title:item.title}))
    const observability=(datasetId?alertsByDataset.get(datasetId)??[]:[]).filter((item:any)=>!['RESOLVED','CLOSED'].includes(String(item.status).toUpperCase())).map((item:any)=>({severity:item.severity,status:item.status,category:item.category,title:item.title}))

    return {
      key:fieldKey(datasetId,assetId,columnName),
      projectId:asset?.project_id??dataset?.project_id??null,
      datasetId,
      datasetName:dataset?.name??asset?.name??assetNameOverride??'External asset',
      assetName:assetNameOverride??(asset?.namespace?`${asset.namespace} · ${asset.name}`:asset?.name??dataset?.name??'Profiled dataset'),
      columnName,
      dqScore,
      datasetDqScore,
      dqMethod:dqScore===null?null:'Field DQ derives from latest profile completeness, candidate-key uniqueness when applicable, and latest finding severity. Dataset DQ is shown separately.',
      profileRunId:latestRun?.id??null,
      profiledAt:latestRun?.completed_at??latestRun?.started_at??null,
      inferredType:profileColumn?.inferred_type??null,
      semanticType:profileColumn?.semantic_type??null,
      nullable:typeof profileColumn?.nullable==='boolean'?profileColumn.nullable:null,
      candidateKey:Boolean(profileColumn?.is_candidate_key),
      completeness,
      uniqueness,
      distinctPercentage:asNumber(profileColumn?.distinct_percentage),
      findings:findings.map((finding:any)=>({severity:finding.severity,title:finding.title})),
      terms:glossary,
      stakeholders,
      classifications,
      certification:certificationRow?{status:certificationRow.status,requestedAt:certificationRow.requested_at??null,decidedAt:certificationRow.decided_at??null}:null,
      contracts,
      issues,
      observability,
    }
  }

  const fieldMap=new Map<string,LineageField>()
  const fieldMappings:FieldMapping[]=[]
  for(const mapping of mappingsResult.data??[]){
    if(!mapping.source_asset_id||!mapping.target_asset_id||!mapping.source_column||!mapping.target_column)continue
    const sourceAsset=assets.get(mapping.source_asset_id)
    const targetAsset=assets.get(mapping.target_asset_id)
    const sourceKey=fieldKey(sourceAsset?.dataset_id??null,mapping.source_asset_id,mapping.source_column)
    const targetKey=fieldKey(targetAsset?.dataset_id??null,mapping.target_asset_id,mapping.target_column)
    if(!fieldMap.has(sourceKey))fieldMap.set(sourceKey,buildField(mapping.source_asset_id,mapping.source_column))
    if(!fieldMap.has(targetKey))fieldMap.set(targetKey,buildField(mapping.target_asset_id,mapping.target_column))
    const transformation=transformations.get(mapping.transformation_id)
    fieldMappings.push({id:mapping.id,sourceFieldKey:sourceKey,targetFieldKey:targetKey,operation:mapping.operation??transformation?.operation??null,expression:mapping.expression??null,transformationName:transformation?.name??null,sourceSystem:transformation?.source_system??null,logicLanguage:transformation?.logic_language??null})
  }

  for(const column of profileColumns){
    const datasetId=datasetByRun.get(column.profile_run_id)
    if(!datasetId)continue
    const columnName=String(column.column_name)
    const syntheticAssetId=`profile:${datasetId}`
    const key=fieldKey(datasetId,syntheticAssetId,columnName)
    if(!fieldMap.has(key))fieldMap.set(key,buildField(syntheticAssetId,columnName,datasetId,datasets.get(datasetId)?.name??'Profiled dataset'))
  }

  const label=(type:string,id:string)=>{
    if(type==='DATA_SOURCE')return sources.get(id)?.name??id.slice(0,8)
    if(type==='DATASET')return datasets.get(id)?.name??id.slice(0,8)
    if(type==='DATASET_VERSION'){const version=versions.get(id);return version?`${datasets.get(version.dataset_id)?.name??'Dataset'} v${version.version_number}`:id.slice(0,8)}
    if(type==='PROFILE_RUN'){const datasetId=datasetByRun.get(id);return datasetId?`Profile · ${datasets.get(datasetId)?.name??id.slice(0,8)}`:`Profile ${id.slice(0,8)}`}
    if(type==='EXTERNAL_ASSET'){const asset=assets.get(id);return asset?`${asset.namespace?`${asset.namespace} · `:''}${asset.name}`:`External ${id.slice(0,8)}`}
    return `${type} ${id.slice(0,8)}`
  }
  const datasetEdges:DatasetEdge[]=(edgesResult.data??[]).map((edge:any)=>({id:edge.id,sourceLabel:label(edge.source_type,edge.source_id),sourceType:edge.source_type,targetLabel:label(edge.target_type,edge.target_id),targetType:edge.target_type,relationship:edge.relationship,transformationName:edge.transformation_id?transformations.get(edge.transformation_id)?.name??null:null}))

  return <main className="min-h-screen bg-slate-50 text-slate-950"><div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
    <nav className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-5 py-3 shadow-sm"><Link href="/dashboard" className="flex items-center gap-3 font-bold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="h-5 w-5"/></span>Data Governance PowerHouse</Link><div className="flex flex-wrap gap-2 text-sm"><Link href="/catalog" className="rounded-xl px-3 py-2 font-semibold text-blue-600 hover:bg-blue-50">Catalog</Link><Link href="/glossary" className="rounded-xl px-3 py-2 font-semibold text-blue-600 hover:bg-blue-50">Glossary</Link><Link href="/data-quality" className="rounded-xl px-3 py-2 font-semibold text-blue-600 hover:bg-blue-50">Data Quality</Link><Link href="/lineage/impact" className="rounded-xl px-3 py-2 font-semibold text-violet-600 hover:bg-violet-50">Impact analysis</Link><Link href="/lineage/ingest" className="rounded-xl bg-violet-600 px-3 py-2 font-semibold text-white">Ingest lineage</Link></div></nav>
    <header className="rounded-3xl border border-violet-100 bg-white p-7 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><GitBranch className="h-6 w-6"/></span><div><h1 className="text-3xl font-black">Governance Intelligence Lineage Explorer</h1><p className="mt-1 max-w-4xl text-sm text-slate-500">Trace fields end to end and overlay Data Quality, business meaning, stakeholders, classifications, certifications, contracts, issues, observability and profiling evidence in one governed view.</p></div></div></header>
    <LineageExplorer fields={[...fieldMap.values()]} mappings={fieldMappings} edges={datasetEdges} stats={{edges:datasetEdges.length,datasets:datasets.size,assets:assets.size,transformations:transformations.size,mappedColumns:fieldMappings.length}}/>
  </div></main>
}
