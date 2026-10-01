import { getGovernanceProvider,registerGovernanceProvider } from '../registry.ts'
import { InformaticaApiClient } from './client.ts'
import { informaticaProviderConfigFromEnv } from './config.ts'
import { InformaticaGovernanceProvider } from './provider.ts'

export type GovernanceProviderBootstrapResult={registered:string[];skipped:string[]}

function hasInformaticaConfig(env:NodeJS.ProcessEnv){
 return['INFORMATICA_BASE_URL','INFORMATICA_CONNECTION_ID','INFORMATICA_ACCESS_TOKEN','INFORMATICA_ASSETS_PATH'].every(key=>Boolean(env[key]?.trim()))
}

export function ensureGovernanceProvidersRegistered(env:NodeJS.ProcessEnv=process.env):GovernanceProviderBootstrapResult{
 const registered:string[]=[],skipped:string[]=[]
 if(getGovernanceProvider('informatica'))skipped.push('informatica:already_registered')
 else if(!hasInformaticaConfig(env))skipped.push('informatica:not_configured')
 else{
  const config=informaticaProviderConfigFromEnv(env)
  const client=new InformaticaApiClient({baseUrl:config.baseUrl,accessToken:async()=>config.accessToken})
  registerGovernanceProvider(new InformaticaGovernanceProvider(client,{assets:request=>{
   if(request.connectionId!==config.connectionId)throw new Error('Requested Informatica connection is not configured for this runtime.')
   return config.assetsPath
  }}))
  registered.push('informatica')
 }
 return{registered,skipped}
}
