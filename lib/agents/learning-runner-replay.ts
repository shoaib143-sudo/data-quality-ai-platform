import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { stageImmutableLearningArtifact } from './learning-runner-artifacts'
import { canonicalLearningJsonBytes, canonicalLearningValue } from './learning-runner-canonical'

export async function stageCanonicalHeldOutReplayPayload(input:{
  projectId:string
  datasetManifestId:string
  caseKey:string
  payload:Record<string,unknown>
  schemaVersion:string
  createdBy?:string|null
}){
  if(!input.payload||Array.isArray(input.payload)) throw new Error('LEARNING_REPLAY_PAYLOAD_OBJECT_REQUIRED')
  const admin=createAdminClient()
  const [{data:manifest,error:manifestError},{data:caseRow,error:caseError}]=await Promise.all([
    admin.schema('agent').from('learning_benchmark_dataset_manifests')
      .select('id,project_id,dataset_version,status,manifest_hash,evidence_cutoff_at')
      .eq('id',input.datasetManifestId).eq('project_id',input.projectId).maybeSingle(),
    admin.schema('agent').from('learning_benchmark_dataset_cases')
      .select('dataset_id,project_id,case_key,split,source_case_ref')
      .eq('dataset_id',input.datasetManifestId).eq('project_id',input.projectId).eq('case_key',input.caseKey).maybeSingle(),
  ])
  if(manifestError||!manifest) throw new Error('LEARNING_REPLAY_MANIFEST_MISSING')
  if(caseError||!caseRow) throw new Error('LEARNING_REPLAY_CASE_MISSING')
  if(manifest.status!=='SEALED'||caseRow.split!=='HELD_OUT') throw new Error('LEARNING_REPLAY_CASE_NOT_SEALED_HELD_OUT')
  const schemaVersion=input.schemaVersion.trim()
  if(!schemaVersion) throw new Error('LEARNING_REPLAY_SCHEMA_VERSION_REQUIRED')

  const envelope={
    schemaVersion,
    projectId:input.projectId,
    datasetManifestId:input.datasetManifestId,
    datasetVersion:String(manifest.dataset_version),
    caseKey:input.caseKey,
    sourceCaseRef:String(caseRow.source_case_ref),
    evidenceCutoffAt:String(manifest.evidence_cutoff_at),
    manifestHash:String(manifest.manifest_hash),
    payload:canonicalLearningValue(input.payload),
  }
  const bytes=canonicalLearningJsonBytes(envelope)
  return stageImmutableLearningArtifact({
    projectId:input.projectId,kind:'HELD_OUT_INPUT',role:'HELD_OUT_INPUT',bytes,
    contentType:'application/json',serializationVersion:schemaVersion,
    sourceRef:String(caseRow.source_case_ref),createdBy:input.createdBy??null,
    datasetManifestId:input.datasetManifestId,caseKey:input.caseKey,datasetVersionId:String(manifest.dataset_version),
  })
}
