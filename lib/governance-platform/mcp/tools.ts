import { GOVERNANCE_MCP_TOOLS,type GovernanceMcpToolName } from './contracts.ts'

const projectSchema={type:'string',minLength:1,description:'DataNexus project identifier.'} as const
const desiredStateSchema={type:'object',description:'DataNexus canonical governance desired-state manifest.'} as const

export type GovernanceMcpToolDefinition={
 name:GovernanceMcpToolName
 description:string
 inputSchema:Record<string,unknown>
 annotations:{readOnlyHint:boolean;destructiveHint:boolean;idempotentHint:boolean;openWorldHint:boolean}
}

function inputSchema(name:GovernanceMcpToolName):Record<string,unknown>{
 if(name==='governance.status')return{type:'object',properties:{projectId:projectSchema,deploymentId:{type:'string',minLength:1}},required:['projectId','deploymentId'],additionalProperties:false}
 if(name==='governance.apply')return{
  type:'object',
  properties:{
   projectId:projectSchema,desiredState:desiredStateSchema,
   expectedDeploymentFingerprint:{type:'string',minLength:64,maxLength:64},
   confirmDestructive:{type:'boolean'},
  },
  required:['projectId','desiredState','expectedDeploymentFingerprint'],
  additionalProperties:false,
 }
 return{type:'object',properties:{projectId:projectSchema,desiredState:desiredStateSchema},required:['projectId','desiredState'],additionalProperties:false}
}

export function governanceMcpToolDefinitions():GovernanceMcpToolDefinition[]{
 return GOVERNANCE_MCP_TOOLS.map(tool=>({
  name:tool.name,description:tool.description,inputSchema:inputSchema(tool.name),
  annotations:{
   readOnlyHint:!tool.mutation,
   destructiveHint:tool.name==='governance.apply',
   idempotentHint:true,
   openWorldHint:tool.name==='governance.apply'||tool.name==='governance.plan'||tool.name==='governance.verify',
  },
 })).sort((a,b)=>a.name.localeCompare(b.name))
}
