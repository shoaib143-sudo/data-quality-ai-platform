function normalizeHost(value:string){return value.trim().toLowerCase().replace(/\.$/,'')}

function configuredHosts(env:NodeJS.ProcessEnv){
 const hosts=new Set(['localhost','127.0.0.1','[::1]'])
 const add=(value:string|undefined)=>{
  if(!value?.trim())return
  try{hosts.add(normalizeHost(new URL(value.includes('://')?value:`https://${value}`).hostname))}catch{}
 }
 for(const value of (env.MCP_ALLOWED_HOSTS??'').split(','))add(value)
 add(env.VERCEL_URL);add(env.NEXT_PUBLIC_APP_URL)
 return hosts
}

function defaultPort(protocol:string){return protocol==='https:'?'443':protocol==='http:'?'80':''}

export type McpTransportSecurityResult={ok:true}|{ok:false;status:403|421;message:string}

export function validateGovernanceMcpTransportSecurity(request:Request,env:NodeJS.ProcessEnv=process.env):McpTransportSecurityResult{
 const hostHeader=request.headers.get('host')?.trim()
 if(!hostHeader)return{ok:false,status:421,message:'MCP Host header is required.'}
 let host:string,hostPort:string
 try{
  const parsedHost=new URL(`http://${hostHeader}`)
  host=normalizeHost(parsedHost.hostname)
  hostPort=parsedHost.port
 }catch{return{ok:false,status:421,message:'MCP Host header is invalid.'}}
 const allowed=configuredHosts(env)
 if(!allowed.has(host))return{ok:false,status:421,message:'MCP Host is not allowed.'}

 const originHeader=request.headers.get('origin')?.trim()
 if(!originHeader)return{ok:true}
 try{
  const origin=new URL(originHeader)
  const requestUrl=new URL(request.url)
  if(origin.protocol!=='http:'&&origin.protocol!=='https:')return{ok:false,status:403,message:'MCP Origin is not allowed.'}
  const originHost=normalizeHost(origin.hostname)
  const requestProtocol=requestUrl.protocol
  const effectiveHostPort=hostPort||defaultPort(requestProtocol)
  const effectiveOriginPort=origin.port||defaultPort(origin.protocol)
  if(originHost!==host||!allowed.has(originHost)||origin.protocol!==requestProtocol||effectiveOriginPort!==effectiveHostPort){
   return{ok:false,status:403,message:'MCP Origin is not allowed.'}
  }
 }catch{return{ok:false,status:403,message:'MCP Origin header is invalid.'}}
 return{ok:true}
}
