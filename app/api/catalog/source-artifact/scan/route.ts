import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { scanSourceArtifact, type SourceArtifactKind } from '@/lib/connectors/source-artifact-scanner'

const kinds=new Set<SourceArtifactKind>(['DOTNET','NODEJS','VBA','MACRO','SCRIPT','LOG'])
function text(value:unknown){return typeof value==='string'?value:''}

export async function POST(request:Request){
  try{
    const user=await requireApiUser()
    const body=await request.json()
    const kind=text(body.kind).trim().toUpperCase() as SourceArtifactKind
    const path=text(body.path).trim()
    const content=text(body.content)
    const persist=body.persist===true
    const projectId=text(body.projectId).trim()

    if(!kinds.has(kind))return NextResponse.json({error:'Unsupported artifact kind.'},{status:400})
    if(!path)return NextResponse.json({error:'Artifact path is required.'},{status:400})
    if(!content)return NextResponse.json({error:'Artifact content is required.'},{status:400})
    if(content.length>5_000_000)return NextResponse.json({error:'Artifact content exceeds the 5 MB scan limit. Chunk the artifact before scanning.'},{status:413})

    const result=scanSourceArtifact({kind,path,content})
    if(!persist)return NextResponse.json({mode:'DRY_RUN',persisted:false,...result})
    if(!projectId)return NextResponse.json({error:'projectId is required when persist=true.'},{status:400})

    await authorizeProject(user.id,projectId,'source.manage')
    const admin=createAdminClient()
    const observedAt=new Date().toISOString()
    const {data,error}=await admin.schema('governance').from('source_artifact_scans').upsert({
      project_id:projectId,
      artifact_kind:result.artifactKind,
      artifact_path:result.path,
      content_hash:result.contentHash,
      line_count:result.lineCount,
      reference_evidence:result.references,
      transformations:result.transformations,
      warnings:result.warnings,
      scanned_by:user.id,
      observed_at:observedAt,
    },{onConflict:'project_id,artifact_kind,artifact_path,content_hash'}).select('id,observed_at').single()
    if(error||!data)throw new Error(error?.message??'Unable to persist source artifact scan.')

    await writeGovernanceAudit({
      projectId,actorUserId:user.id,eventType:'SOURCE_ARTIFACT_METADATA_SCANNED',
      entityType:'SOURCE_ARTIFACT_SCAN',entityId:data.id,
      metadata:{
        artifact_kind:result.artifactKind,
        artifact_path:result.path,
        content_hash:result.contentHash,
        reference_count:result.references.length,
        transformation_count:result.transformations.length,
        source_content_persisted:false,
      },
    })

    return NextResponse.json({mode:'PERSISTED',persisted:true,scanRecordId:data.id,observedAt:data.observed_at,...result},{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Artifact metadata scan failed.'},{status:400})
  }
}
