import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeDataset, authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value:unknown){return typeof value==='string'?value.trim():''}
function numberOrNull(value:unknown){const n=Number(value);return Number.isFinite(n)?n:null}
function object(value:unknown){return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function stringArray(value:unknown){return Array.isArray(value)?value.map(String).map(v=>v.trim()).filter(Boolean):[]}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json()
    const datasetId=text(body.datasetId)
    const requestedProjectId=text(body.projectId)
    if(!datasetId||!requestedProjectId)return NextResponse.json({error:'projectId and datasetId are required.'},{status:400})

    const {dataset}=await authorizeDataset(user.id,datasetId,'contract.manage')
    if(dataset.project_id!==requestedProjectId)return NextResponse.json({error:'Dataset does not belong to the requested project.'},{status:400})
    const activate=body.activate===true
    if(activate)await authorizeProject(user.id,dataset.project_id,'contract.approve')

    const admin=createAdminClient()
    const {data:existing,error:existingError}=await admin.schema('governance').from('data_contracts').select('id,current_version,status,name').eq('dataset_id',datasetId).maybeSingle()
    if(existingError)throw new Error(`Unable to resolve data contract: ${existingError.message}`)

    let contract=existing
    if(!contract){
      const {data,error}=await admin.schema('governance').from('data_contracts').insert({
        project_id:dataset.project_id,dataset_id:datasetId,name:text(body.name)||`${dataset.name} data contract`,
        status:activate?'ACTIVE':'DRAFT',current_version:0,created_by:user.id,
      }).select('id,current_version,status,name').single()
      if(error||!data)throw new Error(`Unable to create data contract: ${error?.message??'unknown error'}`)
      contract=data
    }

    const nextVersion=Number(contract.current_version??0)+1
    if(activate){
      const {error:retireError}=await admin.schema('governance').from('data_contract_versions').update({status:'RETIRED'}).eq('contract_id',contract.id).eq('status','ACTIVE')
      if(retireError)throw new Error(`Unable to retire previous contract version: ${retireError.message}`)
    }

    const qualityRequirements=object(body.qualityRequirements)
    const {data:version,error:versionError}=await admin.schema('governance').from('data_contract_versions').insert({
      contract_id:contract.id,
      version_number:nextVersion,
      schema_hash:text(body.schemaHash)||null,
      compatibility_policy:['NONE','BACKWARD','FORWARD','FULL'].includes(text(body.compatibilityPolicy).toUpperCase())?text(body.compatibilityPolicy).toUpperCase():'BACKWARD',
      freshness_sla_hours:numberOrNull(body.freshnessSlaHours),
      row_count_min:numberOrNull(body.rowCountMin),
      row_count_max:numberOrNull(body.rowCountMax),
      quality_requirements:qualityRequirements,
      critical_columns:stringArray(body.criticalColumns),
      metadata:object(body.metadata),
      change_reason:text(body.changeReason)||null,
      status:activate?'ACTIVE':'DRAFT',
      approved_by:activate?user.id:null,
      effective_at:activate?new Date().toISOString():null,
    }).select('*').single()
    if(versionError||!version)throw new Error(`Unable to create data contract version: ${versionError?.message??'unknown error'}`)

    const {error:contractError}=await admin.schema('governance').from('data_contracts').update({
      name:text(body.name)||contract.name,
      current_version:nextVersion,
      status:activate?'ACTIVE':contract.status,
      updated_at:new Date().toISOString(),
    }).eq('id',contract.id)
    if(contractError)throw new Error(`Unable to update data contract: ${contractError.message}`)

    if(activate&&version.freshness_sla_hours){
      const {error:policyError}=await admin.schema('profiling').from('observability_policies').upsert({
        project_id:dataset.project_id,dataset_id:datasetId,freshness_sla_hours:version.freshness_sla_hours,updated_at:new Date().toISOString(),
      },{onConflict:'dataset_id'})
      if(policyError)throw new Error(`Unable to align observability freshness with data contract: ${policyError.message}`)
    }

    const {data:latestProfile}=await admin.schema('profiling').from('profile_runs').select('id,status').in('dataset_version_id',
      (await admin.schema('catalog').from('dataset_versions').select('id').eq('dataset_id',datasetId)).data?.map(row=>row.id)??[]
    ).eq('status','COMPLETED').order('started_at',{ascending:false}).limit(1).maybeSingle()

    let evaluation=null
    if(activate&&latestProfile?.id){
      const {data,error}=await admin.schema('governance').rpc('evaluate_data_contract',{p_profile_run_id:latestProfile.id})
      if(error)throw new Error(`Unable to evaluate activated contract: ${error.message}`)
      evaluation=data
    }

    await writeGovernanceAudit({projectId:dataset.project_id,actorUserId:user.id,eventType:activate?'DATA_CONTRACT_ACTIVATED':'DATA_CONTRACT_VERSION_CREATED',entityType:'DATASET',entityId:datasetId,metadata:{contract_id:contract.id,contract_version_id:version.id,version_number:nextVersion,activate,evaluation}})
    return NextResponse.json({contractId:contract.id,version,evaluation},{status:201})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to save data contract.'},{status:500})
  }
}
