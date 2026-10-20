import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { acquireGitHubSourceArtifacts } from '@/lib/connectors/github-source-artifact-acquisition'
import { scanSourceArtifact } from '@/lib/connectors/source-artifact-scanner'

function text(value:unknown){return typeof value==='string'?value.trim():''}

export async function POST(request:Request){
  try{
    const user=await requireApiUser()
    const body=await request.json()
    const repositoryUrl=text(body.repositoryUrl)
    const ref=text(body.ref)||null
    const persist=body.persist===true
    const projectId=text(body.projectId)
    if(!repositoryUrl)return NextResponse.json({error:'repositoryUrl is required.'},{status:400})
    if(persist&&!projectId)return NextResponse.json({error:'projectId is required when persist=true.'},{status:400})
    if(persist)await authorizeProject(user.id,projectId,'source.manage')

    const acquired=await acquireGitHubSourceArtifacts({repositoryUrl,ref})
    const scans=acquired.artifacts.map(item=>({
      ...scanSourceArtifact({kind:item.kind,path:item.path,content:item.content}),
      sizeBytes:item.size,
    }))
    if(!persist){
      return NextResponse.json({
        mode:'DRY_RUN',
        persisted:false,
        repository:acquired.repository,
        fileCount:scans.length,
        totalBytes:acquired.totalBytes,
        limits:acquired.limits,
        scans,
      })
    }

    const admin=createAdminClient()
    const observedAt=new Date().toISOString()
    const persisted=[]
    for(const scan of scans){
      const {data,error}=await admin.schema('governance').from('source_artifact_scans').upsert({
        project_id:projectId,
        artifact_kind:scan.artifactKind,
        artifact_path:scan.path,
        content_hash:scan.contentHash,
        line_count:scan.lineCount,
        reference_evidence:scan.references,
        transformations:scan.transformations,
        warnings:scan.warnings,
        scanned_by:user.id,
        observed_at:observedAt,
      },{onConflict:'project_id,artifact_kind,artifact_path,content_hash'}).select('id,artifact_kind,artifact_path,content_hash,observed_at').single()
      if(error||!data)throw new Error(error?.message??`Unable to persist source artifact scan for ${scan.path}.`)
      persisted.push(data)
    }

    await writeGovernanceAudit({
      projectId,
      actorUserId:user.id,
      eventType:'SOURCE_ARTIFACT_REPOSITORY_SCANNED',
      entityType:'PROJECT',
      entityId:projectId,
      metadata:{
        source:'GITHUB_REPOSITORY',
        repository_owner:acquired.repository.owner,
        repository_name:acquired.repository.repo,
        repository_ref:acquired.repository.ref,
        file_count:scans.length,
        total_bytes:acquired.totalBytes,
        source_content_persisted:false,
      },
    })

    return NextResponse.json({
      mode:'PERSISTED',
      persisted:true,
      repository:acquired.repository,
      fileCount:scans.length,
      totalBytes:acquired.totalBytes,
      limits:acquired.limits,
      scans:persisted,
      sourceContentPersisted:false,
    },{status:201})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'GitHub source artifact acquisition failed.'},{status:400})
  }
}
