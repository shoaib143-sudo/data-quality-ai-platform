import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PROJECT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function authenticatedActor(){
  const supabase=await createClient()
  const {data,error}=await supabase.auth.getUser()
  if(error||!data.user?.id)return {supabase,userId:null}
  return {supabase,userId:String(data.user.id)}
}

function errorResponse(error:unknown,status=400){
  const message=error instanceof Error?error.message:String(error)
  return NextResponse.json({error:message},{status})
}

export async function GET(request:NextRequest){
  const {userId}=await authenticatedActor()
  if(!userId)return NextResponse.json({error:'Unauthorized'},{status:401})
  const projectId=request.nextUrl.searchParams.get('projectId')?.trim()??''
  if(!PROJECT_ID.test(projectId))return NextResponse.json({error:'Valid projectId is required'},{status:400})
  const admin=createAdminClient()
  const {data:allowed,error:accessError}=await admin.schema('governance').rpc('has_project_capability',{p_project_id:projectId,p_user_id:userId,p_capability:'lineage.read'})
  if(accessError)return errorResponse(accessError,500)
  if(!allowed)return NextResponse.json({error:'Forbidden'},{status:403})

  const [suggestionsResult,sourcesResult,postureResult]=await Promise.all([
    admin.schema('governance').from('ai_governance_suggestion_effective')
      .select('id,project_id,source_agent_run_id,suggestion_type,subject_type,subject_id,target_locator,suggestion,evidence,confidence,created_at,review_status,reviewer_capability,review_note,reviewed_at,authority_effect')
      .eq('project_id',projectId).eq('suggestion_type','LINEAGE').order('created_at',{ascending:false}).limit(250),
    admin.schema('catalog').from('data_sources').select('id,name,source_type,status').eq('project_id',projectId).eq('status','ACTIVE').order('name'),
    admin.schema('governance').rpc('verify_ai_lineage_suggestion_posture',{p_project_id:projectId}),
  ])
  if(suggestionsResult.error)return errorResponse(suggestionsResult.error,500)
  if(sourcesResult.error)return errorResponse(sourcesResult.error,500)
  if(postureResult.error)return errorResponse(postureResult.error,500)
  return NextResponse.json({suggestions:suggestionsResult.data??[],sources:sourcesResult.data??[],posture:postureResult.data})
}

export async function POST(request:NextRequest){
  const {userId}=await authenticatedActor()
  if(!userId)return NextResponse.json({error:'Unauthorized'},{status:401})
  let body:any
  try{body=await request.json()}catch{return NextResponse.json({error:'Valid JSON body is required'},{status:400})}
  const action=String(body?.action??'').toLowerCase()
  const admin=createAdminClient()

  try{
    if(action==='generate'){
      const projectId=String(body?.projectId??'').trim()
      if(!PROJECT_ID.test(projectId))return NextResponse.json({error:'Valid projectId is required'},{status:400})
      const sourceId=body?.sourceId?String(body.sourceId):null
      if(sourceId&&!PROJECT_ID.test(sourceId))return NextResponse.json({error:'sourceId must be a UUID'},{status:400})
      const maxSuggestions=Math.max(1,Math.min(Number(body?.maxSuggestions)||100,250))
      const {data,error}=await admin.schema('governance').rpc('generate_ai_lineage_suggestions',{
        p_project_id:projectId,p_actor:userId,p_source_id:sourceId,p_max_suggestions:maxSuggestions,
      })
      if(error)throw error
      return NextResponse.json({result:data})
    }

    if(action==='review'){
      const suggestionId=String(body?.suggestionId??'').trim()
      if(!PROJECT_ID.test(suggestionId))return NextResponse.json({error:'Valid suggestionId is required'},{status:400})
      const decision=String(body?.decision??'').toUpperCase()
      if(!['ACCEPTED','REJECTED'].includes(decision))return NextResponse.json({error:'decision must be ACCEPTED or REJECTED'},{status:400})
      const note=String(body?.note??'').trim()
      if(!note)return NextResponse.json({error:'Human review note is required'},{status:400})
      const {data,error}=await admin.schema('governance').rpc('review_ai_governance_suggestion',{
        p_suggestion_id:suggestionId,p_reviewer:userId,p_decision:decision,p_review_note:note,
      })
      if(error)throw error
      return NextResponse.json({decisionId:data})
    }

    if(action==='promote'){
      const suggestionId=String(body?.suggestionId??'').trim()
      if(!PROJECT_ID.test(suggestionId))return NextResponse.json({error:'Valid suggestionId is required'},{status:400})
      const {data,error}=await admin.schema('governance').rpc('promote_ai_lineage_suggestion',{p_suggestion_id:suggestionId,p_actor:userId})
      if(error)throw error
      return NextResponse.json({result:data})
    }

    return NextResponse.json({error:'Unsupported action'},{status:400})
  }catch(error){return errorResponse(error,400)}
}
