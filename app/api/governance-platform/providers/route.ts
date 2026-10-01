import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject,authorizationErrorResponse } from '@/lib/auth/authorize'
import { listGovernanceProviders } from '@/lib/governance-platform/providers/registry'

export async function GET(request:Request){
 try{
  const user=await requireApiUser()
  const projectId=new URL(request.url).searchParams.get('projectId')?.trim()
  if(!projectId)return NextResponse.json({error:'projectId is required.'},{status:400})
  await authorizeProject(user.id,projectId,'catalog.read')
  return NextResponse.json({projectId,providers:listGovernanceProviders()})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to list governance providers.'},{status:500})
 }
}
