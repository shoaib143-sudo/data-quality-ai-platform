import { createAdminClient } from '../../supabase/admin.ts'
import type { GovernanceCheckpoint,GovernanceCheckpointStore,GovernanceResumeAction } from './checkpoint.ts'
import type { GovernanceEvidenceRecord } from '../evidence/model.ts'
import type { GovernanceEvidenceStore } from '../evidence/store.ts'

function mapCheckpointRow(data:Record<string,unknown>):GovernanceCheckpoint{
 return{
  planId:String(data.plan_id),operationId:String(data.operation_id),idempotencyKey:String(data.idempotency_key),
  status:data.status as GovernanceCheckpoint['status'],attempts:Number(data.attempts),
  providerObjectId:data.provider_object_id?String(data.provider_object_id):null,providerJobId:data.provider_job_id?String(data.provider_job_id):null,
  executionEvidence:(data.execution_evidence??{}) as Record<string,unknown>,verificationStatus:data.verification_status?String(data.verification_status):null,
  updatedAt:String(data.updated_at),
 }
}

export class SupabaseGovernanceCheckpointStore implements GovernanceCheckpointStore{
 private readonly projectId:string
 constructor(projectId:string){this.projectId=projectId}
 async get(idempotencyKey:string){
  const admin=createAdminClient()
  const {data,error}=await admin.schema('governance').from('platform_execution_checkpoints')
   .select('plan_id,operation_id,idempotency_key,status,attempts,provider_object_id,provider_job_id,execution_evidence,verification_status,updated_at')
   .eq('project_id',this.projectId).eq('idempotency_key',idempotencyKey).maybeSingle()
  if(error)throw new Error(`Unable to load governance execution checkpoint: ${error.message}`)
  if(!data)return null
  return mapCheckpointRow(data as Record<string,unknown>)
 }
 async claim(input:Pick<GovernanceCheckpoint,'planId'|'operationId'|'idempotencyKey'>){
  const admin=createAdminClient()
  const {data,error}=await admin.schema('governance').rpc('claim_platform_execution_checkpoint',{
   p_project_id:this.projectId,p_plan_id:input.planId,p_operation_id:input.operationId,p_idempotency_key:input.idempotencyKey,
  })
  if(error)throw new Error(`Unable to claim governance execution checkpoint: ${error.message}`)
  const result=(data??{}) as Record<string,unknown>
  const row=result.checkpoint
  const resumeAction=String(result.resume_action??'') as GovernanceResumeAction
  if(!row||typeof row!=='object'||!['EXECUTE','POLL','VERIFY','WAIT','COMPLETE'].includes(resumeAction)){
   throw new Error('Governance checkpoint claim returned an invalid contract.')
  }
  return{claimed:result.claimed===true,resumeAction,checkpoint:mapCheckpointRow(row as Record<string,unknown>)}
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

function mapEvidenceRow(row:Record<string,unknown>):GovernanceEvidenceRecord{return{projectId:String(row.project_id),planId:String(row.plan_id),deploymentId:String(row.deployment_id??row.plan_id),operationId:String(row.operation_id),provider:String(row.provider),connectionId:String(row.connection_id),idempotencyKey:String(row.idempotency_key),desiredStateFingerprint:String(row.desired_state_fingerprint),executionStatus:String(row.execution_status),verificationStatus:row.verification_status?String(row.verification_status):null,providerObjectId:row.provider_object_id?String(row.provider_object_id):null,providerJobId:row.provider_job_id?String(row.provider_job_id):null,recordedAt:String(row.recorded_at),details:(row.details??{}) as Record<string,unknown>}}

export class SupabaseGovernanceEvidenceStore implements GovernanceEvidenceStore{
 async append(record:GovernanceEvidenceRecord){
  const admin=createAdminClient()
  const {error}=await admin.schema('governance').from('platform_execution_evidence').insert({
   project_id:record.projectId,plan_id:record.planId,deployment_id:record.deploymentId,operation_id:record.operationId,provider:record.provider,connection_id:record.connectionId,
   idempotency_key:record.idempotencyKey,desired_state_fingerprint:record.desiredStateFingerprint,execution_status:record.executionStatus,
   verification_status:record.verificationStatus,provider_object_id:record.providerObjectId,provider_job_id:record.providerJobId,details:record.details,recorded_at:record.recordedAt,
  })
  if(error)throw new Error(`Unable to persist governance execution evidence: ${error.message}`)
 }
 async listByPlan(projectId:string,planId:string){
  const admin=createAdminClient()
  const {data,error}=await admin.schema('governance').from('platform_execution_evidence').select('*').eq('project_id',projectId).eq('plan_id',planId).order('recorded_at',{ascending:true})
  if(error)throw new Error(`Unable to load governance execution evidence: ${error.message}`)
  return(data??[]).map(row=>mapEvidenceRow(row))
 }
 async listByDeployment(projectId:string,deploymentId:string){
  const admin=createAdminClient()
  const {data,error}=await admin.schema('governance').from('platform_execution_evidence').select('*').eq('project_id',projectId).eq('deployment_id',deploymentId).order('recorded_at',{ascending:true})
  if(error)throw new Error(`Unable to load governance deployment evidence: ${error.message}`)
  return(data??[]).map(row=>mapEvidenceRow(row))
 }
}
