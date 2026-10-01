import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject,authorizationErrorResponse } from '@/lib/auth/authorize'
import { listGovernanceProviders } from '@/lib/governance-platform/providers/registry'
import { validateProviderManifest } from '@/lib/governance-platform/providers/conformance'

export async function GET(request:Request){
 try{
  const user=await requireApiUser()
  const projectId=new URL(request.url).searchParams.get('projectId')?.trim()
  if(!projectId)return NextResponse.json({error:'projectId is required.'},{status:400})
  await authorizeProject(user.id,projectId,'catalog.read')
  const providers=listGovernanceProviders().map(manifest=>({
   provider:manifest.provider,
   providerVersion:manifest.providerVersion,
   canonicalSchemaVersion:manifest.canonicalSchemaVersion,
   conformance:validateProviderManifest(manifest),
   capabilities:manifest.capabilities,
  }))
  return NextResponse.json({projectId,providers},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){
  const authorization=authorizationErrorResponse(error)
  if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:'Unable to list governance provider capabilities.'},{status:500})
 }
}
