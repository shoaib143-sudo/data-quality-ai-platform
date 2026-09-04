import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AnchorRow={
  anchor_type:string
  anchor_id:string
  label:string
  subtitle:string|null
  match_rank:number
  metadata:Record<string,unknown>|null
}

export async function GET(request:Request){
  try{
    const user=await requireUser()
    const url=new URL(request.url)
    const projectId=(url.searchParams.get('projectId')??'').trim()
    const query=(url.searchParams.get('q')??'').trim().slice(0,120)
    const requestedLimit=Number.parseInt(url.searchParams.get('limit')??'25',10)
    const limit=Number.isFinite(requestedLimit)?Math.max(1,Math.min(50,requestedLimit)):25

    if(!uuidPattern.test(projectId))return NextResponse.json({error:'A valid projectId is required.'},{status:400})
    await authorizeProject(user.id,projectId,'lineage.read')

    const admin=createAdminClient()
    const {data,error}=await admin.schema('governance').rpc('search_lineage_anchors',{
      p_project_id:projectId,
      p_query:query,
      p_limit:limit,
    })
    if(error)throw new Error(`Unable to search lineage anchors: ${error.message}`)

    const anchors=((data??[]) as AnchorRow[]).map(row=>({
      type:row.anchor_type,
      id:row.anchor_id,
      label:row.label,
      subtitle:row.subtitle,
      matchRank:Number(row.match_rank??0),
      metadata:row.metadata??{},
    }))

    return NextResponse.json({projectId,query,count:anchors.length,anchors})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Lineage anchor search failed.'},{status:500})
  }
}
