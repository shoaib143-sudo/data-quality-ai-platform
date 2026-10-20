import type { ProviderManifest } from './sdk/provider.ts'

export type ProviderConformanceIssue={code:string;message:string}
export type ProviderConformanceResult={ok:boolean;issues:ProviderConformanceIssue[]}

export function validateProviderManifest(manifest:ProviderManifest):ProviderConformanceResult{
 const issues:ProviderConformanceIssue[]=[]
 const provider=manifest.provider.trim().toLowerCase()
 if(!provider)issues.push({code:'PROVIDER_REQUIRED',message:'Provider name is required.'})
 if(!manifest.providerVersion.trim())issues.push({code:'PROVIDER_VERSION_REQUIRED',message:'Provider version is required.'})
 if(!manifest.canonicalSchemaVersion.trim())issues.push({code:'CANONICAL_SCHEMA_VERSION_REQUIRED',message:'Canonical schema version is required.'})
 const seen=new Set<string>()
 for(const capability of manifest.capabilities){
  const key=capability.capability.trim().toLowerCase()
  if(!key)issues.push({code:'CAPABILITY_REQUIRED',message:'Capability name is required.'})
  if(seen.has(key))issues.push({code:'DUPLICATE_CAPABILITY',message:`Capability ${key} is declared more than once.`})
  seen.add(key)
  if(capability.modes.length===0)issues.push({code:'CAPABILITY_MODE_REQUIRED',message:`Capability ${key||'<unnamed>'} must declare at least one mode.`})
  if(capability.support==='UNSUPPORTED'&&capability.modes.some(mode=>mode!=='READ')){
   issues.push({code:'UNSUPPORTED_MUTATION_MODE',message:`Unsupported capability ${key} cannot advertise mutation modes.`})
  }
  if(capability.support==='READ_ONLY'&&capability.modes.some(mode=>mode!=='READ')){
   issues.push({code:'READ_ONLY_MUTATION_MODE',message:`Read-only capability ${key} cannot advertise mutation modes.`})
  }
  for(const [name,value] of Object.entries(capability.constraints??{})){
   if(value!==undefined&&(!Number.isFinite(value)||Number(value)<=0))issues.push({code:'INVALID_CONSTRAINT',message:`Capability ${key} has invalid ${name}.`})
  }
 }
 return{ok:issues.length===0,issues}
}

export function assertProviderManifestConformance(manifest:ProviderManifest){
 const result=validateProviderManifest(manifest)
 if(!result.ok)throw new Error(`Provider manifest failed conformance: ${result.issues.map(issue=>issue.message).join(' ')}`)
 return manifest
}
