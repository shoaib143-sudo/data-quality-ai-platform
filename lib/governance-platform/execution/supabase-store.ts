import { createAdminClient } from '../../supabase/admin'
import type { GovernanceCheckpoint,GovernanceCheckpointStore } from './checkpoint'
import type { GovernanceEvidenceRecord } from '../evidence/model'
import type { GovernanceEvidenceStore } from '../evidence/store'

export class SupabaseGovernanceCheckpointStore implements GovernanceCheckpointStore{
 constructor(private readonly projectId:string){}
 async get(idempotencyKey:string){
  const admin=createAdminClient()
  const {data,error}=await admin.schema('governance').from('platform_execution_checkpoints')
   .select('plan_id,operation_id,idempotency_key,status,attempts,provider_object_id,provider_job_id,execution_evidence,verification_status,updated_at')
   .eq('project_id',this.projectId).eq('idempotency_key',idempotencyKey).maybeSingle()
  if(error)throw new Error(`Unable to load governance execution checkpoint: ${error.message}`)
  if(!data)return null
  return{
   planId:String(data.plan_id),operationId:String(data.operation_id),idempotencyKey:String(data.idempotency_key),
   status:data.status as GovernanceCheckpoint['status'],attempts:Number(data.attempts),
   providerObjectId:data.provider_object_id?String(data.provider_object_id):null,providerJobId:data.provider_job_id?String(data.provider_job_id):null,
   executionEvidence:(data.execution_evidence??{}) as Record<string,unknown>,verificationStatus:data.verification_status?String(data.verification_status):null,
   updatedAt:String(data.updated_at),
  }
 }
 async put(checkpoint:GovernanceCheckpoint){
  const admin=createAdminClient()
  const {error}=await admin.schema('governance').from('platform_execution_checkpoints').upsert({
   project_id:this.projectId,plan_id:checkpoint.planId,operation_id:checkpoint.operationId,idempotency_key:checkpoint.idempotencyKey,
   status:checkpoint.status,attempts:checkpoint.attempts,provider_object_id:checkpoint.providerObjectId,provider_job_id:checkpoint.providerJobId,
   execution_evidence:checkpoint.executionEvidence,verification_status:checkpoint.verificationStatus,updated_at:checkpoint.updatedAt,
  },{onConflict:'project_id,idempotency_key'})
  if(error)throw new Error(`Unable to persist governance execution checkpoint: ${error.message}`)
 }
}

export class SupabaseGovernanceEvidenceStore implements GovernanceEvidenceStore{
 async append(record:GovernanceEvidenceRecord){
  const admin=createAdminClient()
  const {error}=await admin.schema('governance').from('platform_execution_evidence').insert({
   project_id:record.projectId,plan_id:record.planId,operation_id:record.operationId,provider:record.provider,connection_id:record.connectionId,
   idempotency_key:record.idempotencyKey,desired_state_fingerprint:record.desiredStateFingerprint,execution_status:record.executionStatus,
   verification_status:record.verificationStatus,provider_object_id:record.providerObjectId,provider_job_id:record.providerJobId,details:record.details,recorded_at:record.recordedAt,
  })
  if(error)throw new Error(`Unable to persist governance execution evidence: ${error.message}`)
 }
 async listByPlan(projectId:string,planId:string){
  const admin=createAdminClient()
  const {data,error}=await admin.schema('governance').from('platform_execution_evidence').select('*').eq('project_id',projectId).eq('plan_id',planId).order('recorded_at',{ascending:true})
  if(error)throw new Error(`Unable to load governance execution evidence: ${error.message}`)
  return(data??[]).map(row=>({projectId:String(row.project_id),planId:String(row.plan_id),operationId:String(row.operation_id),provider:String(row.provider),connectionId:String(row.connection_id),idempotencyKey:String(row.idempotency_key),desiredStateFingerprint:String(row.desired_state_fingerprint),executionStatus:String(row.execution_status),verificationStatus:row.verification_status?String(row.verification_status):null,providerObjectId:row.provider_object_id?String(row.provider_object_id):null,providerJobId:row.provider_job_id?String(row.provider_job_id):null,recordedAt:String(row.recorded_at),details:(row.details??{}) as Record<string,unknown>}))
 }
}
