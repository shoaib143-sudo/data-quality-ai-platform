import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

const severities=new Set(['INFO','LOW','MEDIUM','HIGH','CRITICAL'])
const dimensions=new Set(['COMPLETENESS','UNIQUENESS','VALIDITY','ACCURACY','CONSISTENCY','TIMELINESS'])
const operators=new Set(['LTE','GTE','EQ','NEQ'])
const ruleTypes=new Set(['METRIC_THRESHOLD','REQUIRED','REGEX','UNIQUE','RANGE','IN_SET','ROW_UNIQUE'])

function text(value:unknown){return typeof value==='string'?value.trim():''}
function number(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?parsed:null}

async function requireProject(projectId:string,userId:string){
  const admin=createAdminClient()
  const {data:project}=await admin.schema('app').from('projects').select('id,organization_id').eq('id',projectId).maybeSingle()
  if(!project)return null
  const {data:membership}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  return membership?{admin,project,membership}:null
}

export async function GET(request:Request){
  const user=await requireUser()
  const url=new URL(request.url)
  const projectId=text(url.searchParams.get('projectId'))
  const datasetId=text(url.searchParams.get('datasetId'))
  const admin=createAdminClient()
  let query=admin.schema('profiling').from('quality_rule_definitions').select('*').order('created_at',{ascending:false})
  if(projectId) query=query.eq('project_id',projectId)
  if(datasetId) query=query.eq('dataset_id',datasetId)
  const {data,error}=await query
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({rules:data??[]})
}

export async function POST(request:Request){
  const user=await requireUser()
  const body=await request.json()
  const projectId=text(body.projectId)
  const datasetId=text(body.datasetId)
  const datasetVersionId=text(body.datasetVersionId)||null
  const columnName=text(body.columnName)||null
  const name=text(body.name)
  const description=text(body.description)||null
  const dimension=text(body.dimension).toUpperCase()||'VALIDITY'
  const severity=text(body.severity).toUpperCase()||'MEDIUM'
  const ruleType=text(body.ruleType).toUpperCase()||'METRIC_THRESHOLD'
  const metricKey=text(body.metricKey)||`custom_${ruleType.toLowerCase()}`
  const operator=text(body.operator).toUpperCase()||'LTE'
  const threshold=number(body.threshold)
  const ruleConfig=body.ruleConfig&&typeof body.ruleConfig==='object'&&!Array.isArray(body.ruleConfig)?body.ruleConfig:{}
  if(!projectId||!datasetId||!name||!ruleTypes.has(ruleType)||!severities.has(severity)||!dimensions.has(dimension)||!operators.has(operator)){
    return NextResponse.json({error:'projectId, datasetId, name and valid rule attributes are required.'},{status:400})
  }
  const access=await requireProject(projectId,user.id)
  if(!access)return NextResponse.json({error:'Project access denied.'},{status:403})
  const {admin}=access
  const {data:dataset}=await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',datasetId).eq('project_id',projectId).maybeSingle()
  if(!dataset)return NextResponse.json({error:'Dataset not found in project.'},{status:404})
  const ruleKey=text(body.ruleKey)||`CUSTOM_${ruleType}_${columnName??'DATASET'}_${crypto.randomUUID().slice(0,8)}`
  const payload={
    project_id:projectId,dataset_id:datasetId,dataset_version_id:datasetVersionId,column_name:columnName,
    rule_key:ruleKey,name,description,dimension,severity,metric_key:metricKey,operator,threshold,
    enabled:body.enabled!==false,origin:'USER',rule_type:ruleType,rule_config:ruleConfig,created_by:user.id,updated_at:new Date().toISOString(),
  }
  const {data,error}=await admin.schema('profiling').from('quality_rule_definitions').insert(payload).select('*').single()
  if(error)return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({rule:data},{status:201})
}
