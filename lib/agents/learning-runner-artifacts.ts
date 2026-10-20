import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RunnerArtifact } from './learning-experiment-runner'

const SHA = /^sha256:[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function bucketName() {
  return (process.env.SUPABASE_OBJECT_STORE_BUCKET ?? 'governance-artifacts').trim()
}
function digest(bytes: Uint8Array) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}
function normalized(value: string, label: string) {
  const result=value.trim()
  if(!result) throw new Error(`${label} is required`)
  return result
}
function objectKey(input:{projectId:string;kind:'EXECUTABLE'|'HELD_OUT_INPUT';sha256:string}) {
  if(!UUID.test(input.projectId) || !SHA.test(input.sha256)) throw new Error('LEARNING_ARTIFACT_SCOPE_INVALID')
  const suffix=input.sha256.slice('sha256:'.length)
  return `projects/${input.projectId}/learning/${input.kind.toLowerCase()}/${suffix}`
}

export type LearningArtifactRegistration = {
  projectId:string
  kind:'EXECUTABLE'|'HELD_OUT_INPUT'
  role:'BASELINE'|'CANDIDATE'|'HELD_OUT_INPUT'
  bytes:Uint8Array
  contentType:string
  serializationVersion:string
  runtimeVersion?:string|null
  definitionHash?:string|null
  toolContractSetHash?:string|null
  sourceRef:string
  createdBy:string|null
  agentDefinitionId?:string|null
  candidateId?:string|null
  datasetManifestId?:string|null
  caseKey?:string|null
  datasetVersionId?:string|null
}

export async function stageImmutableLearningArtifact(input:LearningArtifactRegistration) {
  const admin=createAdminClient()
  const sha256=digest(input.bytes)
  const key=objectKey({projectId:input.projectId,kind:input.kind,sha256})
  const bucket=bucketName()
  const contentType=normalized(input.contentType,'contentType')
  const {error:uploadError}=await admin.storage.from(bucket).upload(key,Buffer.from(input.bytes),{
    contentType,
    upsert:false,
  })
  const createdNewObject=!uploadError
  if(uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
    throw new Error(`LEARNING_ARTIFACT_UPLOAD_FAILED: ${uploadError.message}`)
  }

  const {data:download,error:downloadError}=await admin.storage.from(bucket).download(key)
  if(downloadError || !download) throw new Error('LEARNING_ARTIFACT_READBACK_FAILED')
  const readback=new Uint8Array(await download.arrayBuffer())
  if(readback.byteLength!==input.bytes.byteLength || digest(readback)!==sha256) {
    throw new Error('LEARNING_ARTIFACT_READBACK_INTEGRITY')
  }

  const {data:id,error}=await admin.schema('agent').rpc('register_learning_artifact_manifest',{
    p_project_id:input.projectId,
    p_artifact_kind:input.kind,
    p_artifact_role:input.role,
    p_agent_definition_id:input.agentDefinitionId ?? null,
    p_candidate_id:input.candidateId ?? null,
    p_dataset_manifest_id:input.datasetManifestId ?? null,
    p_case_key:input.caseKey ?? null,
    p_dataset_version_id:input.datasetVersionId ?? null,
    p_provider_key:'supabase',
    p_bucket:bucket,
    p_object_key:key,
    p_content_type:contentType,
    p_size_bytes:input.bytes.byteLength,
    p_sha256:sha256,
    p_serialization_version:normalized(input.serializationVersion,'serializationVersion'),
    p_runtime_version:input.runtimeVersion?.trim()||null,
    p_definition_hash:input.definitionHash??null,
    p_tool_contract_set_hash:input.toolContractSetHash??null,
    p_source_ref:normalized(input.sourceRef,'sourceRef'),
    p_created_by:input.createdBy ?? null,
  })
  if(error || !id) {
    if(createdNewObject) {
      const {data:registered,error:lookupError}=await admin.schema('agent').from('learning_artifact_manifests')
        .select('id,sha256,size_bytes')
        .eq('project_id',input.projectId).eq('provider_key','supabase').eq('bucket',bucket).eq('object_key',key)
        .maybeSingle()
      // Delete only when canonical persistence proves nobody won the concurrent registration race.
      // If the lookup itself is unavailable, preserve the object for reconciliation rather than
      // risk deleting bytes referenced by another committed manifest.
      if(!lookupError && !registered) await admin.storage.from(bucket).remove([key]).catch(()=>undefined)
      if(registered && (registered.sha256!==sha256 || Number(registered.size_bytes)!==input.bytes.byteLength)) {
        throw new Error('LEARNING_ARTIFACT_CONCURRENT_REGISTRATION_CONFLICT')
      }
    }
    throw new Error(`LEARNING_ARTIFACT_REGISTRATION_FAILED: ${error?.message ?? 'missing id'}`)
  }
  return {id:String(id),sha256,sizeBytes:input.bytes.byteLength,objectKey:key,bucket}
}

export async function resolveLearningArtifact(input:{
  projectId:string
  artifactId:string
  expectedKind:'EXECUTABLE'|'HELD_OUT_INPUT'
  expectedRole:'BASELINE'|'CANDIDATE'|'HELD_OUT_INPUT'
  expectedAgentDefinitionId?:string
  expectedCandidateId?:string
  expectedDatasetManifestId?:string
  expectedCaseKey?:string
  expectedDatasetVersionId?:string
}):Promise<RunnerArtifact> {
  const admin=createAdminClient()
  const {data:row,error}=await admin.schema('agent').from('learning_artifact_manifests')
    .select('id,project_id,artifact_kind,artifact_role,agent_definition_id,candidate_id,dataset_manifest_id,case_key,dataset_version_id,provider_key,bucket,object_key,size_bytes,sha256')
    .eq('id',input.artifactId).eq('project_id',input.projectId).maybeSingle()
  if(error) throw new Error(`LEARNING_ARTIFACT_LOOKUP_FAILED: ${error.message}`)
  if(!row) throw new Error('LEARNING_ARTIFACT_NOT_FOUND')
  if(row.artifact_kind!==input.expectedKind || row.artifact_role!==input.expectedRole
    || (input.expectedAgentDefinitionId && row.agent_definition_id!==input.expectedAgentDefinitionId)
    || (input.expectedCandidateId && row.candidate_id!==input.expectedCandidateId)
    || (input.expectedDatasetManifestId && row.dataset_manifest_id!==input.expectedDatasetManifestId)
    || (input.expectedCaseKey && row.case_key!==input.expectedCaseKey)
    || (input.expectedDatasetVersionId && row.dataset_version_id!==input.expectedDatasetVersionId)) {
    throw new Error('LEARNING_ARTIFACT_BINDING_MISMATCH')
  }
  if(row.provider_key!=='supabase' || row.bucket!==bucketName() || !SHA.test(String(row.sha256))) {
    throw new Error('LEARNING_ARTIFACT_STORAGE_BINDING_INVALID')
  }
  const {data,error:downloadError}=await admin.storage.from(row.bucket).download(row.object_key)
  if(downloadError || !data) throw new Error('LEARNING_ARTIFACT_BYTES_UNAVAILABLE')
  const bytes=new Uint8Array(await data.arrayBuffer())
  if(bytes.byteLength!==Number(row.size_bytes) || digest(bytes)!==row.sha256) throw new Error('LEARNING_ARTIFACT_BYTES_TAMPERED')
  return {ref:`learning-artifact:${row.id}`,hash:String(row.sha256),bytes:Buffer.from(bytes).toString('utf8')}
}

export async function resolveHeldOutReplayArtifact(input:{
  projectId:string;datasetManifestId:string;caseKey:string;datasetVersionId:string
}) {
  const admin=createAdminClient()
  const {data,error}=await admin.schema('agent').from('learning_artifact_manifests')
    .select('id')
    .eq('project_id',input.projectId)
    .eq('artifact_kind','HELD_OUT_INPUT')
    .eq('artifact_role','HELD_OUT_INPUT')
    .eq('dataset_manifest_id',input.datasetManifestId)
    .eq('case_key',input.caseKey)
    .eq('dataset_version_id',input.datasetVersionId)
    .maybeSingle()
  if(error) throw new Error(`LEARNING_REPLAY_BINDING_LOOKUP_FAILED: ${error.message}`)
  if(!data) throw new Error('LEARNING_REPLAY_BINDING_MISSING')
  return resolveLearningArtifact({
    projectId:input.projectId,artifactId:String(data.id),expectedKind:'HELD_OUT_INPUT',expectedRole:'HELD_OUT_INPUT',
    expectedDatasetManifestId:input.datasetManifestId,expectedCaseKey:input.caseKey,expectedDatasetVersionId:input.datasetVersionId,
  })
}
