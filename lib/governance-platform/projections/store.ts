import type { ProviderProjection } from '../canonical/model.ts'

export type GovernanceProjectionObservation = {
 projectId:string
 provider:string
 connectionId:string
 projection:ProviderProjection
}

export interface GovernanceProjectionStore {
 upsertObservations(observations:GovernanceProjectionObservation[]):Promise<void>
}

export function validateGovernanceProjectionObservation(input:GovernanceProjectionObservation){
 const provider=input.provider.trim().toLowerCase()
 const connectionId=input.connectionId.trim()
 const projection=input.projection
 if(!provider||!connectionId)throw new Error('Governance projection observation requires provider and connection identity.')
 if(projection.provider.trim().toLowerCase()!==provider)throw new Error('Governance projection provider does not match the discovered target.')
 if(projection.connectionId.trim()!==connectionId)throw new Error('Governance projection connection does not match the discovered target.')
 if(!projection.canonicalObjectId?.trim()||!projection.providerObjectId?.trim())throw new Error('Governance projection requires canonical and provider object identity.')
 if(!projection.lastObservedFingerprint?.trim())throw new Error('Governance projection requires an observed fingerprint.')
 if(!Number.isFinite(Date.parse(projection.lastObservedAt)))throw new Error('Governance projection requires a valid observation timestamp.')
 if(!['IN_SYNC','DRIFTED','MISSING','UNSUPPORTED'].includes(projection.syncState))throw new Error('Governance projection sync state is invalid.')
 return{
  projectId:input.projectId,
  provider,
  connectionId,
  projection:{...projection,provider,connectionId},
 }
}

export class SupabaseGovernanceProjectionStore implements GovernanceProjectionStore {
 async upsertObservations(observations:GovernanceProjectionObservation[]){
  if(!observations.length)return
  const normalized=observations.map(validateGovernanceProjectionObservation)
  const projectIds=new Set(normalized.map(value=>value.projectId))
  if(projectIds.size!==1)throw new Error('Governance projection batch must belong to exactly one project.')
  const {createAdminClient}=await import('../../supabase/admin.ts')
  const admin=createAdminClient()
  const {error}=await admin.schema('governance').rpc('upsert_provider_projection_observations',{
   p_project_id:normalized[0].projectId,
   p_observations:normalized.map(value=>({
    provider:value.provider,
    connection_id:value.connectionId,
    canonical_object_id:value.projection.canonicalObjectId,
    provider_object_id:value.projection.providerObjectId,
    provider_version:value.projection.providerVersion??null,
    last_observed_fingerprint:value.projection.lastObservedFingerprint,
    last_observed_at:value.projection.lastObservedAt,
    sync_state:value.projection.syncState,
   })),
  })
  if(error)throw new Error(`Unable to persist governance provider projections: ${error.message}`)
 }
}
