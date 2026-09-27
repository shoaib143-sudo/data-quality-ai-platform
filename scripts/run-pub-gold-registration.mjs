import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const PROJECT_ID='479813aa-72a4-4b12-b72a-74da8d2419ce'
const SOURCE_ID='f0e5a063-7d0e-4ffe-bc81-80404fcf4b5b'
const EMAIL='persona.data-governance-admin@datanexus.test'
const BINDING_ID='5b08b426-5578-4c39-b2f2-adf85f855927'
const TARGETS=[
 'pub.gold.customer_water_consumption_behavior',
 'pub.gold.test',
 'pub.gold.water_quality_compliance',
]
function req(v,n){v=typeof v==='string'?v.trim():'';if(!v)throw new Error(n+' is required');return v}
async function cookies(url,key){
 const a=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await a.auth.admin.generateLink({type:'magiclink',email:EMAIL}); if(error)throw error
 const v=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 const x=await v.auth.verifyOtp({type:'magiclink',token_hash:data.properties.hashed_token}); if(x.error||!x.data.session)throw x.error||new Error('session missing')
 const out=[]; const s=createServerClient(url,key,{cookies:{getAll(){return[]},setAll(c){out.push(...c)}}})
 const e=await s.auth.setSession({access_token:x.data.session.access_token,refresh_token:x.data.session.refresh_token});if(e.error)throw e.error
 return out.map(c=>c.name+'='+c.value).join('; ')
}
async function main(){
 const url=req(process.env.NEXT_PUBLIC_SUPABASE_URL,'NEXT_PUBLIC_SUPABASE_URL'),key=req(process.env.SUPABASE_SERVICE_ROLE_KEY,'SUPABASE_SERVICE_ROLE_KEY'),base=req(process.env.DATANEXUS_BASE_URL,'DATANEXUS_BASE_URL').replace(/\/$/,'')
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});let activated=false;const evidence=[]
 try{
  const {data:source,error:se}=await admin.schema('catalog').from('data_sources').select('id,project_id,status').eq('id',SOURCE_ID).maybeSingle()
  if(se||!source||source.project_id!==PROJECT_ID||!['CONFIGURED','ACTIVE'].includes(source.status))throw new Error('source preflight failed')
  const {data:users,error:ue}=await admin.auth.admin.listUsers({page:1,perPage:1000});if(ue)throw ue
  const user=users.users.find(u=>u.email?.toLowerCase()===EMAIL);if(!user)throw new Error('DGA missing')
  const expiry=new Date(Date.now()+20*60*1000).toISOString()
  const act=await admin.schema('governance').from('project_role_bindings').update({active:true,expires_at:expiry}).eq('id',BINDING_ID).eq('project_id',PROJECT_ID).eq('user_id',user.id);if(act.error)throw act.error;activated=true
  for(const cap of ['catalog.update',...(source.status==='CONFIGURED'?['source.manage']:[])]){
   const {data,error}=await admin.schema('governance').rpc('has_project_capability',{p_project_id:PROJECT_ID,p_user_id:user.id,p_capability:cap});if(error||data!==true)throw new Error('missing capability '+cap)
  }
  const ck=await cookies(url,key)
  for(const qn of TARGETS){
   const existing=await admin.schema('catalog').from('datasets').select('id,name,source_identifier,status').eq('project_id',PROJECT_ID).eq('data_source_id',SOURCE_ID).eq('source_identifier',qn).maybeSingle()
   if(existing.error)throw existing.error
   if(existing.data){evidence.push({sourceIdentifier:qn,status:'ALREADY_REGISTERED',datasetId:existing.data.id});continue}
   const r=await fetch(base+'/api/datasets/register',{method:'POST',headers:{'content-type':'application/json','cookie':ck},body:JSON.stringify({projectId:PROJECT_ID,sourceId:SOURCE_ID,name:qn,sourceIdentifier:qn,description:'Governed PUB Gold acceptance dataset'})})
   const body=await r.json().catch(()=>({}))
   if(!r.ok)throw new Error(qn+' registration HTTP '+r.status+': '+String(body.error||'unexpected').slice(0,240))
   evidence.push({sourceIdentifier:qn,status:'REGISTERED',datasetId:body.dataset?.id??body.datasetId??null,profilingReady:body.profiling_ready??body.profilingReady??null})
  }
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/pub-gold-registration.json',JSON.stringify({projectId:PROJECT_ID,sourceId:SOURCE_ID,results:evidence,generatedAt:new Date().toISOString(),secretsRecorded:false},null,2)+'\n')
  console.log(JSON.stringify({results:evidence}))
 }finally{
  if(activated)await admin.schema('governance').from('project_role_bindings').update({active:false,expires_at:new Date().toISOString()}).eq('id',BINDING_ID).eq('project_id',PROJECT_ID)
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1})
