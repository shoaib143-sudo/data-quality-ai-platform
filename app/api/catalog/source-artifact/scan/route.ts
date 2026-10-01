import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { scanSourceArtifact, type SourceArtifactKind } from '@/lib/connectors/source-artifact-scanner'

const kinds=new Set<SourceArtifactKind>(['DOTNET','NODEJS','VBA','MACRO','SCRIPT','LOG'])
function text(value:unknown){return typeof value==='string'?value:''}

export async function POST(request:Request){
  try{
    await requireApiUser()
    const body=await request.json()
    const kind=text(body.kind).trim().toUpperCase() as SourceArtifactKind
    const path=text(body.path).trim()
    const content=text(body.content)
    if(!kinds.has(kind))return NextResponse.json({error:'Unsupported artifact kind.'},{status:400})
    if(!path)return NextResponse.json({error:'Artifact path is required.'},{status:400})
    if(!content)return NextResponse.json({error:'Artifact content is required.'},{status:400})
    if(content.length>5_000_000)return NextResponse.json({error:'Artifact content exceeds the 5 MB dry-run limit. Chunk the artifact before scanning.'},{status:413})
    const result=scanSourceArtifact({kind,path,content})
    return NextResponse.json({mode:'DRY_RUN',persisted:false,...result})
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Artifact metadata scan failed.'},{status:400})
  }
}
