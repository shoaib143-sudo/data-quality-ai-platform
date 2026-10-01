import { GOVERNANCE_MCP_TOOLS,type GovernanceMcpToolName } from './contracts'

const projectSchema={type:'string',minLength:1,description:'DataNexus project identifier.'} as const
const desiredStateSchema={type:'object',description:'DataNexus canonical governance desired-state manifest.'} as const

export type GovernanceMcpToolDefinition={
 name:GovernanceMcpToolName
 description:string
 inputSchema:Record<string,unknown>
 annotations:{readOnlyHint:boolean;destructiveHint:boolean;idempotentHint:boolean}
}

export function governanceMcpToolDefinitions():GovernanceMcpToolDefinition[]{
 return GOVERNANCE_MCP_TOOLS.map(tool=>({
  name:tool.name,
  description:tool.description,
  inputSchema:tool.name==='governance.status'
   ?{type:'object',properties:{projectId:projectSchema,planId:{type:'string',minLength:1}},required:['projectId','planId'],additionalProperties:false}
   :{type:'object',properties:{projectId:projectSchema,desiredState:desiredStateSchema,actual:{type:'array',items:{type:'object'}}},required:['projectId','desiredState'],additionalProperties:false},
  annotations:{readOnlyHint:!tool.mutation,destructiveHint:tool.name==='governance.apply',idempotentHint:true},
 })).sort((a,b)=>a.name.localeCompare(b.name))
}
