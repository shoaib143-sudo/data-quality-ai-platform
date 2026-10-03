import { createAdminClient } from '@/lib/supabase/admin'
import { discoverNativeHierarchy } from '@/lib/connectors/native-hierarchy-discovery'
import { validateDataSourceForProfiling } from '@/lib/profiling/source-validation'
import { enqueueDurableJob } from '@/lib/orchestration/queue'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function record(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function text(value:unknown){return typeof value==='string'?value.trim():''}
function safeError(error:unknown){
  const raw=error instanceof Error?error.message:String(error??'Source health check failed.')
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]')
    .replace(/(password|passwd|token|secret|credential|api[_-]?key)=([^\s;&]+)/gi,'$1=[REDACTED]')
    .replace(/jdbc:[^\s]+/gi,'jdbc:[REDACTED]')
    .slice(0,500)
}

export async function checkSourceConnectionHealth(sourceId:string){
  const admin=createAdminClient()
  const {data:source,error}=await admin.schema('catalog').from('data_sources')
    .select('id,project_id,name,source_type,status,connection_metadata')
    .eq('id',sourceId).maybeSingle()
  if(error||!source)throw new Error(`Unable to resolve source health target: ${error?.message??'not found'}`)
  const metadata=record(source.connection_metadata)
  const checkedAt=new Date().toISOString()
  let health:Record<string,unknown>

  try{
    const sourceType=String(source.source_type).toUpperCase()
    if(sourceType==='JDBC'){
      const jdbcUrl=text(metadata.jdbc_url??metadata.jdbcUrl??metadata.url)
      const credentialRef=text(metadata.credential_ref??metadata.credentialRef??metadata.secret_ref??metadata.secretRef)
      if(!jdbcUrl||!credentialRef)throw new Error('JDBC health check requires governed connection and credential references.')
      const hierarchy=await discoverNativeHierarchy({jdbcUrl,credentialRef})
      health={
        status:'HEALTHY',
        checked_at:checkedAt,
        check_type:'SCHEDULED_HEARTBEAT',
        database_product:hierarchy.databaseProduct,
        database_version:hierarchy.databaseVersion,
        hierarchy_node_count:hierarchy.nodes.length,
        hierarchy_truncated:hierarchy.truncated,
      }
    }else if(sourceType==='FILE'||sourceType==='CSV'){
      const {data:dataset,error:datasetError}=await admin.schema('catalog').from('datasets')
        .select('id,source_identifier').eq('data_source_id',source.id).order('created_at').limit(1).maybeSingle()
      if(datasetError)throw new Error(datasetError.message)
      if(!dataset?.source_identifier){
        health={status:'NO_TARGET',checked_at:checkedAt,check_type:'SCHEDULED_HEARTBEAT',reason:'No bound dataset source identifier is available for validation.'}
      }else{
        const validation=await validateDataSourceForProfiling(admin,source,dataset.source_identifier)
        health={
          status:validation.valid?'HEALTHY':'UNHEALTHY',
          checked_at:checkedAt,
          check_type:'SCHEDULED_HEARTBEAT',
          checks:validation.checks,
          warnings:validation.warnings.slice(0,10),
          errors:validation.errors.map(item=>safeError(item)).slice(0,10),
        }
      }
    }else{
      health={status:'UNSUPPORTED',checked_at:checkedAt,check_type:'SCHEDULED_HEARTBEAT',reason:`No active source-health adapter is registered for ${sourceType}.`}
    }
  }catch(cause){
    health={status:'UNHEALTHY',checked_at:checkedAt,check_type:'SCHEDULED_HEARTBEAT',error:safeError(cause)}
  }

  const {error:updateError}=await admin.schema('catalog').from('data_sources').update({
    connection_metadata:{...metadata,connection_health:health},
    updated_at:checkedAt,
  }).eq('id',source.id).eq('project_id',source.project_id)
  if(updateError)throw new Error(`Unable to persist source health evidence: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId:source.project_id,
    actorUserId:null,
    actorType:'SYSTEM',
    eventType:'SOURCE_CONNECTION_HEALTH_CHECKED',
    entityType:'DATA_SOURCE',
    entityId:source.id,
    metadata:{source_type:source.source_type,status:health.status,checked_at:checkedAt,check_type:'SCHEDULED_HEARTBEAT'},
  })

  return {sourceId:source.id,projectId:source.project_id,status:health.status,checkedAt,health}
}

export async function enqueueRecurringSourceHealthChecks(limit=100){
  const enabled=process.env.SOURCE_HEALTH_CHECKS_ENABLED?.trim().toLowerCase()==='true'
  if(!enabled)return {enabled:false,queued:0,reused:0}

  const admin=createAdminClient()
  const {data:sources,error}=await admin.schema('catalog').from('data_sources')
    .select('id,project_id,source_type,status').in('status',['ACTIVE','CONFIGURED']).order('updated_at').limit(Math.max(1,Math.min(limit,500)))
  if(error)throw new Error(`Unable to load source health targets: ${error.message}`)

  const hourKey=new Date().toISOString().slice(0,13)
  let queued=0,reused=0
  for(const source of sources??[]){
    const job=await enqueueDurableJob({
      projectId:source.project_id,
      jobType:'OBSERVABILITY',
      entityId:source.id,
      idempotencyKey:`source-health:${source.id}:${hourKey}`,
      payload:{trigger:'SOURCE_HEALTH_CHECK',sourceId:source.id,sourceType:source.source_type},
      priority:90,
      maxAttempts:3,
    })
    if(String(job.status).toUpperCase()==='QUEUED'&&Number(job.attempts??0)===0)queued+=1
    else reused+=1
  }
  return {enabled:true,queued,reused}
}
