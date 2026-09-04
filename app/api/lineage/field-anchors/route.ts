import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type FieldAnchorRow={
  asset_id:string
  column_name:string
  label:string
  subtitle:string|null
  dataset_id:string|null
  asset_type:string|null
  match_rank:number
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
    const {data,error}=await admin.schema('governance').rpc('search_field_lineage_anchors',{
      p_project_id:projectId,
      p_query:query,
      p_limit:limit,
    })
    if(error)throw new Error(`Unable to search field lineage anchors: ${error.message}`)

    const anchors=((data??[]) as FieldAnchorRow[]).map(row=>({
      assetId:row.asset_id,
      columnName:row.column_name,
      label:row.label,
      subtitle:row.subtitle,
      datasetId:row.dataset_id,
      assetType:row.asset_type,
      matchRank:Number(row.match_rank??0),
    }))

    return NextResponse.json({projectId,query,count:anchors.length,anchors})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Field lineage anchor search failed.'},{status:500})
  }
}
