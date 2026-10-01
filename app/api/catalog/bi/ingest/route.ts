import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { normalizeBiMetadata, type BiProvider } from '@/lib/connectors/bi-metadata'

const providers=new Set<BiProvider>(['POWER_BI','TABLEAU','LOOKER'])
function text(v:unknown){return typeof v==='string'?v.trim():''}

export async function POST(request:Request){
  try{
    const user=await requireApiUser()
    const body=await request.json()
    const projectId=text(body.projectId)
    const provider=text(body.provider).toUpperCase().replace(/[ -]+/g,'_') as BiProvider
    if(!projectId)return NextResponse.json({error:'projectId is required.'},{status:400})
    if(!providers.has(provider))return NextResponse.json({error:'Unsupported BI provider.'},{status:400})
    await authorizeProject(user.id,projectId,'catalog.update')
    const assets=normalizeBiMetadata(provider,body.payload??body.assets??body)
    if(!assets.length)return NextResponse.json({error:'No BI metadata assets were found.'},{status:400})
    const now=new Date().toISOString()
    const admin=createAdminClient()
    const rows=assets.map(asset=>({
      project_id:projectId,
      provider:asset.provider,
      external_id:asset.externalId,
      asset_type:asset.assetType,
      name:asset.name,
      container:asset.container,
      upstream:asset.upstream,
      expression:asset.expression,
      metadata:asset.metadata,
      last_seen_at:now,
      updated_at:now,
    }))
    const {data,error}=await admin.schema('governance').from('bi_metadata_assets')
      .upsert(rows,{onConflict:'project_id,provider,external_id'})
      .select('id,provider,external_id,asset_type,name,last_seen_at')
    if(error)throw new Error(error.message)
    await writeGovernanceAudit({
      projectId,actorUserId:user.id,eventType:'BI_METADATA_IMPORTED',
      entityType:'PROJECT',entityId:projectId,
      metadata:{provider,asset_count:assets.length,source:'EXPORTED_METADATA',live_vendor_api_called:false},
    })
    return NextResponse.json({persisted:true,provider,assetCount:assets.length,assets:data??[]},{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to persist BI metadata.'},{status:500})
  }
}
