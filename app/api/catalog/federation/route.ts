import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { normalizeFederatedMetadata, detectFederationConflicts, federationConflictKey, resolveFederatedMetadata } from '@/lib/catalog/metadata-federation'

function text(value:unknown){return typeof value==='string'?value.trim():''}

export async function GET(request:NextRequest){
  try{
    const user=await requireApiUser()
    const projectId=text(request.nextUrl.searchParams.get('projectId'))
    if(!projectId)return NextResponse.json({error:'projectId is required.'},{status:400})
    await authorizeProject(user.id,projectId,'catalog.read')
    const admin=createAdminClient()
    const {data,error}=await admin.schema('governance').from('federated_metadata_records')
      .select('id,project_id,source_catalog,external_id,canonical_key,authority,asset_type,namespace,name,description,owners,tags,classifications,source_url,observed_at,attributes,conflict_state,first_seen_at,last_seen_at')
      .eq('project_id',projectId).order('last_seen_at',{ascending:false}).limit(1000)
    if(error){
      if(error.code==='42P01'||/federated_metadata_records/i.test(error.message))return NextResponse.json({records:[],resolved:[],conflicts:[],available:false})
      throw new Error(error.message)
    }
    const persisted=data??[]
    const normalized=persisted.flatMap((row:any)=>normalizeFederatedMetadata({
      id:row.external_id,
      authority:row.authority,
      asset_type:row.asset_type,
      namespace:row.namespace,
      name:row.name,
      description:row.description,
      owners:row.owners,
      tags:row.tags,
      classifications:row.classifications,
      source_url:row.source_url,
      observed_at:row.observed_at,
      attributes:row.attributes,
    },String(row.source_catalog)))
    return NextResponse.json({
      records:persisted,
      resolved:resolveFederatedMetadata(normalized),
      conflicts:detectFederationConflicts(normalized),
      available:true,
    })
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load federated metadata.'},{status:500})
  }
}

export async function POST(request:Request){
  try{
    const user=await requireApiUser()
    const body=await request.json()
    const projectId=text(body.projectId)
    const sourceCatalog=text(body.sourceCatalog??body.source_catalog)
    if(!projectId||!sourceCatalog)return NextResponse.json({error:'projectId and sourceCatalog are required.'},{status:400})
    await authorizeProject(user.id,projectId,'catalog.update')

    const records=normalizeFederatedMetadata(body.records??body.payload??body,sourceCatalog)
    if(!records.length)return NextResponse.json({error:'No usable metadata records were found.'},{status:400})
    const conflicts=detectFederationConflicts(records)
    const resolved=resolveFederatedMetadata(records)
    const conflictKeys=new Set(conflicts.map(item=>item.key))
    const now=new Date().toISOString()
    const admin=createAdminClient()
    const rows=records.map(item=>({
      project_id:projectId,
      source_catalog:item.sourceCatalog,
      external_id:item.externalId,
      canonical_key:federationConflictKey(item),
      authority:item.authority,
      asset_type:item.assetType,
      namespace:item.namespace,
      name:item.name,
      description:item.description,
      owners:item.owners,
      tags:item.tags,
      classifications:item.classifications,
      source_url:item.sourceUrl,
      observed_at:item.observedAt,
      attributes:item.attributes,
      conflict_state:conflictKeys.has(federationConflictKey(item))?'CONFLICT':'CLEAR',
      last_seen_at:now,
      updated_at:now,
    }))
    const {data,error}=await admin.schema('governance').from('federated_metadata_records').upsert(rows,{onConflict:'project_id,source_catalog,external_id'}).select('id,canonical_key,conflict_state')
    if(error)throw new Error(error.message)

    await writeGovernanceAudit({
      projectId,actorUserId:user.id,eventType:'FEDERATED_METADATA_PERSISTED',entityType:'PROJECT',entityId:projectId,
      metadata:{source_catalog:sourceCatalog,record_count:records.length,conflict_count:conflicts.length,provenance_preserved:true},
    })

    return NextResponse.json({persisted:true,sourceCatalog,recordCount:records.length,conflictCount:conflicts.length,resolved,conflicts,records:data??[]},{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to persist federated metadata.'},{status:500})
  }
}
