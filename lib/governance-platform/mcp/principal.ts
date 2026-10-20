import { AuthorizationError } from '../../auth/authorize'
import { requireApiUser } from '../../auth/require-api-user'
import { createAdminClient } from '../../supabase/admin'

export type GovernanceMcpPrincipal={id:string;authentication:'BEARER'|'SESSION'}

export async function resolveGovernanceMcpPrincipal(request:Request):Promise<GovernanceMcpPrincipal>{
 const authorization=request.headers.get('authorization')?.trim()??''
 if(authorization){
  const match=/^Bearer\s+(.+)$/i.exec(authorization)
  if(!match)throw new AuthorizationError('MCP Authorization header must use Bearer authentication.',401)
  const token=match[1].trim()
  if(!token)throw new AuthorizationError('MCP bearer token is empty.',401)
  const admin=createAdminClient()
  const {data,error}=await admin.auth.getUser(token)
  if(error||!data.user?.id)throw new AuthorizationError('MCP bearer token is invalid or expired.',401)
  return{id:String(data.user.id),authentication:'BEARER'}
 }
 const user=await requireApiUser()
 return{id:user.id,authentication:'SESSION'}
}
