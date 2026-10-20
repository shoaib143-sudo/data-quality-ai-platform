export type ProviderCompatibilityStatus='DOCUMENTED_NOT_LIVE_VERIFIED'|'LIVE_CONFORMANCE_VERIFIED'
export type ProviderDocumentedCapability={
 capability:string
 operations:string[]
 status:'DOCUMENTED_NOT_ENABLED'|'ENABLED'
 source:string
 notes?:string[]
}
export type ProviderCompatibilityProfile={
 provider:string
 apiFamily:string
 documentedRelease:string
 adapterVersion:string
 canonicalSchemaVersion:string
 status:ProviderCompatibilityStatus
 documentedCapabilities:ProviderDocumentedCapability[]
}

const profiles=new Map<string,ProviderCompatibilityProfile>()

export function registerProviderCompatibility(profile:ProviderCompatibilityProfile){
 const key=profile.provider.trim().toLowerCase()
 if(!key)throw new Error('Provider compatibility profile requires a provider.')
 profiles.set(key,structuredClone({...profile,provider:key}))
 return profile
}
export function getProviderCompatibility(provider:string){const value=profiles.get(provider.trim().toLowerCase());return value?structuredClone(value):null}
export function listProviderCompatibility(){return [...profiles.values()].map(value=>structuredClone(value)).sort((a,b)=>a.provider.localeCompare(b.provider))}
export function clearProviderCompatibilityForTests(){profiles.clear()}
