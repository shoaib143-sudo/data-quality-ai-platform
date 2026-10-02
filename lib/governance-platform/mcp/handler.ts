import { AuthorizationError,authorizeProject } from '../../auth/authorize'
import type { GovernanceDesiredState } from '../desired-state/model'
import {
 applyGovernanceDeploymentForPrincipal,
 governanceDeploymentStatusForPrincipal,
 planGovernanceDeploymentForPrincipal,
 verifyGovernanceDeploymentForPrincipal,
} from '../runtime/service'
import { authorizeGovernanceMcpTool } from './authorization'
import type { GovernanceMcpToolName } from './contracts'
import { resolveGovernanceMcpPrincipal } from './principal'
import { governanceMcpTool, GOVERNANCE_MCP_TOOLS } from './contracts'
import { governanceMcpToolDefinitions } from './tools'
import { validateGovernanceMcpTransportSecurity } from './transport-security'

export const GOVERNANCE_MCP_PROTOCOL_VERSION='2026-07-28' as const
const SERVER_INFO={name:'datanexus-governance',version:'1.0.0'} as const

type JsonRpcId=string|number
type JsonRpcRequest={jsonrpc:'2.0';id:JsonRpcId;method:string;params?:Record<string,unknown>}

function response(id:JsonRpcId,result:Record<string,unknown>,status=200){
 return Response.json({jsonrpc:'2.0',id,result:{...result,resultType:'complete',_meta:{...(result._meta as Record<string,unknown>|undefined),'io.modelcontextprotocol/serverInfo':SERVER_INFO}}},{status,headers:{'Cache-Control':'no-store'}})
}
function error(id:JsonRpcId|null,code:number,message:string,status=200,data?:unknown){
 return Response.json({jsonrpc:'2.0',id,error:{code,message,...(data===undefined?{}:{data})}},{status,headers:{'Cache-Control':'no-store'}})
}
function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
function text(value:unknown){return typeof value==='string'?value.trim():''}

function validateModernRequest(request:Request,body:unknown):{ok:true;rpc:JsonRpcRequest}|{ok:false;response:Response}{
 if(request.method!=='POST')return{ok:false,response:error(null,-32600,'MCP governance endpoint accepts POST only.',405)}
 if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))return{ok:false,response:error(null,-32600,'Content-Type must be application/json.',415)}
 const rpc=record(body)
 const id=typeof rpc.id==='string'||typeof rpc.id==='number'?rpc.id:null
 if(rpc.jsonrpc!=='2.0'||id===null||typeof rpc.method!=='string')return{ok:false,response:error(id,-32600,'Invalid JSON-RPC request.',400)}
 const protocol=request.headers.get('mcp-protocol-version')
 if(protocol!==GOVERNANCE_MCP_PROTOCOL_VERSION)return{ok:false,response:error(id,-32022,'Unsupported MCP protocol version.',400,{supportedVersions:[GOVERNANCE_MCP_PROTOCOL_VERSION]})}
 if(request.headers.get('mcp-method')!==rpc.method)return{ok:false,response:error(id,-32020,'Mcp-Method header does not match the JSON-RPC method.',400)}
 const params=record(rpc.params),meta=record(params._meta)
 if(meta['io.modelcontextprotocol/protocolVersion']!==GOVERNANCE_MCP_PROTOCOL_VERSION)return{ok:false,response:error(id,-32020,'MCP protocol version envelope does not match the request header.',400)}
 if(!meta['io.modelcontextprotocol/clientCapabilities']||typeof meta['io.modelcontextprotocol/clientCapabilities']!=='object')return{ok:false,response:error(id,-32602,'MCP client capabilities envelope is required.',400)}
 if(rpc.method==='tools/call'){
  const name=text(params.name)
  if(!name||request.headers.get('mcp-name')!==name)return{ok:false,response:error(id,-32020,'Mcp-Name header must match params.name for tools/call.',400)}
 }
 return{ok:true,rpc:rpc as JsonRpcRequest}
}

function desiredFromArguments(args:Record<string,unknown>){
 const projectId=text(args.projectId)
 const desired=args.desiredState as GovernanceDesiredState|undefined
 if(!projectId||!desired||desired.projectId!==projectId)throw new Error('projectId must match desiredState.projectId.')
 return{projectId,desired}
}

async function callTool(request:Request,rpc:JsonRpcRequest){
 const params=record(rpc.params),name=text(params.name) as GovernanceMcpToolName
 if(!governanceMcpTool(name))return error(rpc.id,-32601,`Unknown governance tool: ${name||'<empty>'}.`)
 const args=record(params.arguments)
 const principal=await resolveGovernanceMcpPrincipal(request)
 const projectId=text(args.projectId)
 if(!projectId)return error(rpc.id,-32602,'projectId is required.')
 await authorizeGovernanceMcpTool({principalId:principal.id,projectId},name,async auth=>{
  await authorizeProject(auth.principalId,auth.projectId,auth.capability)
 })
 let output:unknown
 if(name==='governance.status'){
  const deploymentId=text(args.deploymentId)
  if(!deploymentId)return error(rpc.id,-32602,'deploymentId is required.')
  output=await governanceDeploymentStatusForPrincipal(principal.id,projectId,deploymentId)
 }else{
  const {desired}=desiredFromArguments(args)
  if(name==='governance.plan')output=await planGovernanceDeploymentForPrincipal(principal.id,desired)
  else if(name==='governance.verify')output=await verifyGovernanceDeploymentForPrincipal(principal.id,desired)
  else output=await applyGovernanceDeploymentForPrincipal({
   principalId:principal.id,desired,
   expectedDeploymentFingerprint:text(args.expectedDeploymentFingerprint),
   confirmDestructive:args.confirmDestructive===true,
   approvalRequestId:text(args.approvalRequestId)||null,
  })
 }
 return response(rpc.id,{content:[{type:'text',text:JSON.stringify(output)}],structuredContent:output as Record<string,unknown>})
}

export async function handleGovernanceMcpRequest(request:Request){
 const transportSecurity=validateGovernanceMcpTransportSecurity(request)
 if(!transportSecurity.ok)return error(null,-32000,transportSecurity.message,transportSecurity.status)
 let body:unknown
 try{body=await request.json()}catch{return error(null,-32700,'Invalid JSON.',400)}
 const validated=validateModernRequest(request,body)
 if(!validated.ok)return validated.response
 const rpc=validated.rpc
 try{
  if(rpc.method==='server/discover')return response(rpc.id,{
   supportedVersions:[GOVERNANCE_MCP_PROTOCOL_VERSION],
   capabilities:{tools:{}},
   instructions:'Use DataNexus governance tools for provider-neutral planning, verification, status, and governed application. Provider credentials never belong in tool arguments.',
   ttlMs:60_000,cacheScope:'private',
  })
  if(rpc.method==='tools/list'){
   await resolveGovernanceMcpPrincipal(request)
   return response(rpc.id,{tools:governanceMcpToolDefinitions(),ttlMs:60_000,cacheScope:'private'})
  }
  if(rpc.method==='tools/call')return await callTool(request,rpc)
  return error(rpc.id,-32601,`Method not found: ${rpc.method}.`)
 }catch(caught){
  if(caught instanceof AuthorizationError)return error(rpc.id,-32000,caught.message,caught.status)
  const message=caught instanceof Error?caught.message:'Governance MCP tool failed.'
  if(rpc.method==='tools/call')return response(rpc.id,{content:[{type:'text',text:message}],isError:true})
  return error(rpc.id,-32603,message,500)
 }
}

export function governanceMcpAdvertisedTools(){return GOVERNANCE_MCP_TOOLS.map(tool=>tool.name).sort()}
