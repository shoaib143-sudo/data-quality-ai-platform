import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value:unknown){return typeof value==='string'?value.trim():''}
async function access(projectId:string,userId:string){
  const admin=createAdminClient()
  const {data:project}=await admin.schema('app').from('projects').select('organization_id').eq('id',projectId).maybeSingle()
  if(!project)return null
  const {data:membership}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  return membership?admin:null
}
function impact(edges:any[],start:string,direction:'upstream'|'downstream'){
  const visited=new Set<string>([start]);const queue=[start];const result:any[]=[]
  while(queue.length&&result.length<500){
    const id=queue.shift()!
    for(const edge of edges){
      const match=direction==='downstream'?edge.source_id===id:edge.target_id===id
      if(!match)continue
      const next=direction==='downstream'?edge.target_id:edge.source_id
      result.push(edge)
      if(!visited.has(next)){visited.add(next);queue.push(next)}
    }
  }
  return result
}
export async function GET(request:Request){
  const user=await requireUser();const url=new URL(request.url)
  const projectId=text(url.searchParams.get('projectId'));const entityId=text(url.searchParams.get('entityId'));const direction=(text(url.searchParams.get('direction'))||'downstream') as 'upstream'|'downstream'
  if(!projectId)return NextResponse.json({error:'projectId is required.'},{status:400})
  const admin=await access(projectId,user.id);if(!admin)return NextResponse.json({error:'Project access denied.'},{status:403})
  const {data,error}=await admin.schema('governance').from('lineage_edges').select('*').eq('project_id',projectId).order('created_at')
  if(error)return NextResponse.json({error:error.message},{status:500})
  const edges=data??[]
  return NextResponse.json({edges,impact:entityId?impact(edges,entityId,direction):[]})
}
export async function POST(request:Request){
  const user=await requireUser();const body=await request.json()
  const projectId=text(body.projectId),sourceType=text(body.sourceType).toUpperCase(),sourceId=text(body.sourceId),targetType=text(body.targetType).toUpperCase(),targetId=text(body.targetId),relationship=text(body.relationship).toUpperCase()
  if(!projectId||!sourceType||!sourceId||!targetType||!targetId||!relationship)return NextResponse.json({error:'Complete lineage edge attributes are required.'},{status:400})
  const admin=await access(projectId,user.id);if(!admin)return NextResponse.json({error:'Project access denied.'},{status:403})
  const {data,error}=await admin.schema('governance').from('lineage_edges').upsert({project_id:projectId,source_type:sourceType,source_id:sourceId,target_type:targetType,target_id:targetId,relationship,metadata:{...(body.metadata??{}),manual:true,created_by:user.id}},{onConflict:'project_id,source_type,source_id,target_type,target_id,relationship'}).select('*').single()
  if(error)return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({edge:data},{status:201})
}
