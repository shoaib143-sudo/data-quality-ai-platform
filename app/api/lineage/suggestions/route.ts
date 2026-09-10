import { NextRequest, NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function errorResponse(error:unknown,status=400){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  const message=error instanceof Error?error.message:String(error)
  return NextResponse.json({error:message},{status})
}

async function suggestionProjectId(admin:ReturnType<typeof createAdminClient>,suggestionId:string){
  const {data,error}=await admin.schema('governance').from('ai_governance_suggestion_effective')
    .select('project_id').eq('id',suggestionId).maybeSingle()
  if(error)throw new Error(`Unable to resolve suggestion authorization context: ${error.message}`)
  return data?.project_id?String(data.project_id):null
}

export async function GET(request:NextRequest){
  try{
    const user=await requireApiUser()
    const projectId=request.nextUrl.searchParams.get('projectId')?.trim()??''
    if(!UUID.test(projectId))return NextResponse.json({error:'Valid projectId is required'},{status:400})
    await authorizeProject(user.id,projectId,'lineage.read')
    const admin=createAdminClient()

    const [suggestionsResult,sourcesResult,postureResult]=await Promise.all([
      admin.schema('governance').from('ai_governance_suggestion_effective')
        .select('id,project_id,source_agent_run_id,suggestion_type,subject_type,subject_id,target_locator,suggestion,evidence,confidence,created_at,review_status,reviewer_capability,review_note,reviewed_at,authority_effect')
        .eq('project_id',projectId).eq('suggestion_type','LINEAGE').order('created_at',{ascending:false}).limit(250),
      admin.schema('catalog').from('data_sources').select('id,name,source_type,status').eq('project_id',projectId).eq('status','ACTIVE').order('name'),
      admin.schema('governance').rpc('verify_ai_lineage_suggestion_posture',{p_project_id:projectId}),
    ])
    if(suggestionsResult.error)throw suggestionsResult.error
    if(sourcesResult.error)throw sourcesResult.error
    if(postureResult.error)throw postureResult.error
    return NextResponse.json({suggestions:suggestionsResult.data??[],sources:sourcesResult.data??[],posture:postureResult.data})
  }catch(error){return errorResponse(error,500)}
}

export async function POST(request:NextRequest){
  try{
    const user=await requireApiUser()
    let body:any
    try{body=await request.json()}catch{return NextResponse.json({error:'Valid JSON body is required'},{status:400})}
    const action=String(body?.action??'').toLowerCase()
    const admin=createAdminClient()

    if(action==='generate'){
      const projectId=String(body?.projectId??'').trim()
      if(!UUID.test(projectId))return NextResponse.json({error:'Valid projectId is required'},{status:400})
      const sourceId=body?.sourceId?String(body.sourceId):null
      if(sourceId&&!UUID.test(sourceId))return NextResponse.json({error:'sourceId must be a UUID'},{status:400})
      await authorizeProject(user.id,projectId,'lineage.manage')
      const maxSuggestions=Math.max(1,Math.min(Number(body?.maxSuggestions)||100,250))
      const {data,error}=await admin.schema('governance').rpc('generate_ai_lineage_suggestions',{
        p_project_id:projectId,p_actor:user.id,p_source_id:sourceId,p_max_suggestions:maxSuggestions,
      })
      if(error)throw error
      return NextResponse.json({result:data})
    }

    if(action==='review'||action==='promote'){
      const suggestionId=String(body?.suggestionId??'').trim()
      if(!UUID.test(suggestionId))return NextResponse.json({error:'Valid suggestionId is required'},{status:400})
      const projectId=await suggestionProjectId(admin,suggestionId)
      if(!projectId)return NextResponse.json({error:'Suggestion not found'},{status:404})
      await authorizeProject(user.id,projectId,'lineage.manage')

      if(action==='review'){
        const decision=String(body?.decision??'').toUpperCase()
        if(!['ACCEPTED','REJECTED'].includes(decision))return NextResponse.json({error:'decision must be ACCEPTED or REJECTED'},{status:400})
        const note=String(body?.note??'').trim()
        if(!note)return NextResponse.json({error:'Human review note is required'},{status:400})
        const {data,error}=await admin.schema('governance').rpc('review_ai_governance_suggestion',{
          p_suggestion_id:suggestionId,p_reviewer:user.id,p_decision:decision,p_review_note:note,
        })
        if(error)throw error
        return NextResponse.json({decisionId:data})
      }

      const {data,error}=await admin.schema('governance').rpc('promote_ai_lineage_suggestion',{p_suggestion_id:suggestionId,p_actor:user.id})
      if(error)throw error
      return NextResponse.json({result:data})
    }

    return NextResponse.json({error:'Unsupported action'},{status:400})
  }catch(error){return errorResponse(error,400)}
}
