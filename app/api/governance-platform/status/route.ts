import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject,authorizationErrorResponse } from '@/lib/auth/authorize'
import { SupabaseGovernanceEvidenceStore } from '@/lib/governance-platform/execution/supabase-store'

export async function GET(request:Request){
 try{
  const user=await requireApiUser()
  const url=new URL(request.url)
  const projectId=url.searchParams.get('projectId')?.trim()
  const planId=url.searchParams.get('planId')?.trim()
  if(!projectId||!planId)return NextResponse.json({error:'projectId and planId are required.'},{status:400})
  await authorizeProject(user.id,projectId,'execution.view_evidence')
  const evidence=await new SupabaseGovernanceEvidenceStore().listByPlan(projectId,planId)
  return NextResponse.json({projectId,planId,evidence},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to load governance execution status.'},{status:500})
 }
}
