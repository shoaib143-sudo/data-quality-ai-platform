export type InformaticaProviderConfig={baseUrl:string;connectionId:string;accessToken:string}

function required(value:string|undefined,label:string){const normalized=value?.trim();if(!normalized)throw new Error(`${label} is not configured.`);return normalized}

export function informaticaProviderConfigFromEnv(env:NodeJS.ProcessEnv=process.env):InformaticaProviderConfig{
 const baseUrl=required(env.INFORMATICA_BASE_URL,'INFORMATICA_BASE_URL')
 const connectionId=required(env.INFORMATICA_CONNECTION_ID,'INFORMATICA_CONNECTION_ID')
 const accessToken=required(env.INFORMATICA_ACCESS_TOKEN,'INFORMATICA_ACCESS_TOKEN')
 let parsed:URL
 try{parsed=new URL(baseUrl)}catch{throw new Error('INFORMATICA_BASE_URL must be a valid HTTPS URL.')}
 if(parsed.protocol!=='https:')throw new Error('INFORMATICA_BASE_URL must use HTTPS.')
 return{baseUrl:parsed.toString().replace(/\/$/,''),connectionId,accessToken}
}
