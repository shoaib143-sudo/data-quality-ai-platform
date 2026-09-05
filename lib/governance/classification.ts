import { createAdminClient } from '@/lib/supabase/admin'

function classify(columnName:string){
  const value=columnName.toLowerCase()
  if(/(diagnosis|patient|medical|health|clinical|medication|procedure|insurance)/.test(value)) return 'PHI'
  if(/(card|pan|cvv|payment_card|credit_card)/.test(value)) return 'PCI'
  if(/(email|phone|mobile|name|address|dob|birth|passport|national_id|ssn|customer_id|person_id)/.test(value)) return 'PII'
  return null
}

export async function syncProfileClassifications(datasetVersionId:string,profileRunId:string){
  const admin=createAdminClient()
  const {data:version,error:versionError}=await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id',datasetVersionId).maybeSingle()
  if(versionError||!version)throw new Error(`Unable to resolve classification dataset version: ${versionError?.message??'not found'}`)
  const {data:dataset,error:datasetError}=await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',version.dataset_id).maybeSingle()
  if(datasetError||!dataset)throw new Error('Unable to resolve dataset for classification.')
  const [{data:columns,error:columnsError},{data:findings,error:findingsError},{data:labels,error:labelsError}]=await Promise.all([
    admin.schema('profiling').from('profile_columns').select('id,column_name').eq('profile_run_id',profileRunId),
    admin.schema('profiling').from('profile_findings').select('profile_column_id,finding_type,confidence,evidence').eq('profile_run_id',profileRunId),
    admin.schema('governance').from('classification_labels').select('id,code,category').eq('enabled',true),
  ])
  if(columnsError||findingsError||labelsError)throw new Error(columnsError?.message??findingsError?.message??labelsError?.message??'Classification evidence load failed.')
  const labelByCode=new Map((labels??[]).map(l=>[l.code,l]))
  const suggestions:Array<Record<string,unknown>>=[]
  for(const column of columns??[]){
    let code=classify(column.column_name)
    const finding=(findings??[]).find(f=>f.profile_column_id===column.id&&String(f.finding_type).toUpperCase().includes('SENSIT'))
    if(!code&&!finding)continue
    code=code??'PII'
    const label=labelByCode.get(code)
    if(!label)continue
    suggestions.push({
      project_id:dataset.project_id,dataset_id:dataset.id,column_name:column.column_name,label_id:label.id,status:'SUGGESTED',
      confidence:typeof finding?.confidence==='number'?finding.confidence:0.85,source:'PROFILING',
      evidence:{profile_run_id:profileRunId,finding_type:finding?.finding_type??null,detector:'governance_classification_sync'},
      updated_at:new Date().toISOString(),
    })
  }

  const {data:existingRows,error:existingError}=await admin.schema('governance').from('dataset_classifications')
    .select('id,column_name,label_id,status')
    .eq('dataset_id',dataset.id)
  if(existingError)throw new Error(`Unable to load existing classification decisions: ${existingError.message}`)
  const existingByKey=new Map((existingRows??[]).map(row=>[`${row.column_name??''}:${row.label_id}`,row]))

  let inserted=0
  let refreshed=0
  let preservedHumanDecisions=0
  for(const suggestion of suggestions){
    const key=`${String(suggestion.column_name??'')}:${String(suggestion.label_id??'')}`
    const existing=existingByKey.get(key)
    if(!existing){
      const {error}=await admin.schema('governance').from('dataset_classifications').insert(suggestion)
      if(error)throw new Error(`Unable to persist classification suggestion: ${error.message}`)
      inserted+=1
      continue
    }

    if(existing.status!=='SUGGESTED'){
      preservedHumanDecisions+=1
      continue
    }

    const {error}=await admin.schema('governance').from('dataset_classifications').update({
      confidence:suggestion.confidence,
      source:suggestion.source,
      evidence:suggestion.evidence,
      updated_at:suggestion.updated_at,
    }).eq('id',existing.id)
    if(error)throw new Error(`Unable to refresh classification suggestion: ${error.message}`)
    refreshed+=1
  }

  return {
    datasetId:dataset.id,
    profileRunId,
    suggestions:suggestions.length,
    inserted,
    refreshed,
    preservedHumanDecisions,
  }
}
