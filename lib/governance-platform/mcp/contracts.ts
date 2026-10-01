export const GOVERNANCE_MCP_TOOLS=[
 {name:'governance.plan',mutation:false,description:'Build a deterministic governed deployment plan without executing provider mutations.'},
 {name:'governance.verify',mutation:false,description:'Compare desired and observed governance state and report drift.'},
 {name:'governance.status',mutation:false,description:'Read execution and verification status for a governed plan.'},
 {name:'governance.apply',mutation:true,description:'Submit an authorized governance plan to the DataNexus execution runtime.'},
] as const

export type GovernanceMcpToolName=(typeof GOVERNANCE_MCP_TOOLS)[number]['name']

export function governanceMcpTool(name:string){
 return GOVERNANCE_MCP_TOOLS.find(tool=>tool.name===name)??null
}
