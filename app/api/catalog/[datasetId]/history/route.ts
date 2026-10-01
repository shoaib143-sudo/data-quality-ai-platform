import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeDataset, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request:NextRequest,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    await authorizeDataset(user.id,datasetId,'catalog.read')
    const admin=createAdminClient()
    const {data,error}=await admin.schema('governance').from('dataset_catalog_history')
      .select('id,dataset_id,project_id,version_number,change_type,snapshot,created_at')
      .eq('dataset_id',datasetId).order('version_number',{ascending:false}).limit(100)
    if(error){
      if(error.code==='42P01'||/dataset_catalog_history/i.test(error.message))return NextResponse.json({versions:[],available:false})
      throw new Error(error.message)
    }
    return NextResponse.json({versions:data??[],available:true})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load catalog metadata history.'},{status:500})
  }
}

export async function POST(request:Request,{params}:{params:Promise<{datasetId:string}>}){
  try{
    const user=await requireApiUser()
    const {datasetId}=await params
    await authorizeDataset(user.id,datasetId,'catalog.update')
    const body=await request.json()
    const historyId=typeof body.historyId==='string'?body.historyId.trim():''
    if(!UUID.test(historyId))return NextResponse.json({error:'Valid historyId is required.'},{status:400})
    const admin=createAdminClient()
    const {data:history,error:historyError}=await admin.schema('governance').from('dataset_catalog_history').select('id,dataset_id').eq('id',historyId).eq('dataset_id',datasetId).maybeSingle()
    if(historyError)throw new Error(historyError.message)
    if(!history)return NextResponse.json({error:'Catalog metadata history version was not found for this dataset.'},{status:404})
    const {data,error}=await admin.schema('governance').rpc('restore_dataset_catalog_history',{p_history_id:historyId,p_actor:user.id})
    if(error)throw new Error(error.message)
    return NextResponse.json({catalog:data,restored:true})
  }catch(error){
    const auth=authorizationErrorResponse(error)
    if(auth)return NextResponse.json({error:auth.error},{status:auth.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to restore catalog metadata version.'},{status:500})
  }
}
