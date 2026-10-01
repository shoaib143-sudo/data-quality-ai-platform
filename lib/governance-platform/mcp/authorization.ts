import type { AuthorizationCapability } from '../../auth/authorize'
import type { GovernanceMcpToolName } from './contracts'

export type GovernanceMcpAuthorizationRequest={
 principalId:string
 projectId:string
 capability:AuthorizationCapability
}

export type GovernanceMcpAuthorizer=(request:GovernanceMcpAuthorizationRequest)=>Promise<void>

const requiredCapability:Record<GovernanceMcpToolName,AuthorizationCapability>={
 'governance.plan':'catalog.read',
 'governance.verify':'catalog.read',
 'governance.status':'execution.view',
 'governance.apply':'agent.execute',
}

export function governanceMcpRequiredCapability(tool:GovernanceMcpToolName):AuthorizationCapability{
 return requiredCapability[tool]
}

export async function authorizeGovernanceMcpTool(
 context:{principalId:string;projectId:string},
 tool:GovernanceMcpToolName,
 authorize:GovernanceMcpAuthorizer,
){
 const capability=governanceMcpRequiredCapability(tool)
 await authorize({principalId:context.principalId,projectId:context.projectId,capability})
 return capability
}
