import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { governanceDeploymentStatusForPrincipal } from '@/lib/governance-platform/runtime/service'

export async function GET(request:Request){
 try{
  const user=await requireApiUser()
  const url=new URL(request.url)
  const projectId=url.searchParams.get('projectId')?.trim()
  const deploymentId=url.searchParams.get('deploymentId')?.trim()
  if(!projectId||!deploymentId)return NextResponse.json({error:'projectId and deploymentId are required.'},{status:400})
  const result=await governanceDeploymentStatusForPrincipal(user.id,projectId,deploymentId)
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to load governance execution status.'},{status:500})
 }
}
