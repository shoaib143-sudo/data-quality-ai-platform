import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'

function score(label:string,description:string|null,query:string,kind:string){
  const normalized=query.toLowerCase(),name=label.toLowerCase(),body=(description??'').toLowerCase()
  let value=0
  if(name===normalized)value+=100
  else if(name.startsWith(normalized))value+=70
  else if(name.includes(normalized))value+=50
  if(body.includes(normalized))value+=20
  if(kind==='DATASET')value+=8
  if(kind==='GLOSSARY_TERM')value+=6
  return value
}

export async function GET(request:Request){
  await requireUser()
  const url=new URL(request.url)
  const query=(url.searchParams.get('q')??'').trim()
  if(query.length<2)return NextResponse.json({query,results:[]})
  const supabase=await createClient()
  const pattern=`%${query.replaceAll('%','\\%').replaceAll('_','\\_')}%`

  const [datasets,terms,issues,labels,policies,contracts]=await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,description,business_domain,source_identifier').or(`name.ilike.${pattern},description.ilike.${pattern},business_domain.ilike.${pattern},source_identifier.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('glossary_terms').select('id,project_id,term,definition,domain,status').or(`term.ilike.${pattern},definition.ilike.${pattern},domain.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('issues').select('id,project_id,dataset_id,title,description,status,severity').or(`title.ilike.${pattern},description.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('classification_labels').select('id,project_id,name,description,sensitivity_level').or(`name.ilike.${pattern},description.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('classification_policies').select('id,project_id,name,description,handling_requirements').or(`name.ilike.${pattern},description.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('data_contracts').select('id,project_id,dataset_id,name,status,current_version').ilike('name',pattern).limit(30),
  ])
  for(const [label,result] of [['datasets',datasets],['glossary terms',terms],['issues',issues],['classification labels',labels],['policies',policies],['contracts',contracts]] as const){
    if(result.error)throw new Error(`Unable to search ${label}: ${result.error.message}`)
  }

  const results=[
    ...(datasets.data??[]).map(item=>({kind:'DATASET',id:item.id,projectId:item.project_id,label:item.name,description:item.description??item.business_domain??item.source_identifier,href:`/catalog?dataset=${item.id}`,metadata:{domain:item.business_domain,source:item.source_identifier}})),
    ...(terms.data??[]).map(item=>({kind:'GLOSSARY_TERM',id:item.id,projectId:item.project_id,label:item.term,description:item.definition,href:`/glossary?term=${item.id}`,metadata:{domain:item.domain,status:item.status}})),
    ...(issues.data??[]).map(item=>({kind:'ISSUE',id:item.id,projectId:item.project_id,label:item.title,description:item.description,href:`/issues?issue=${item.id}`,metadata:{status:item.status,severity:item.severity,dataset_id:item.dataset_id}})),
    ...(labels.data??[]).map(item=>({kind:'CLASSIFICATION',id:item.id,projectId:item.project_id,label:item.name,description:item.description,href:`/classification?label=${item.id}`,metadata:{sensitivity_level:item.sensitivity_level}})),
    ...(policies.data??[]).map(item=>({kind:'POLICY',id:item.id,projectId:item.project_id,label:item.name,description:item.description,href:`/classification?policy=${item.id}`,metadata:{handling_requirements:item.handling_requirements}})),
    ...(contracts.data??[]).map(item=>({kind:'DATA_CONTRACT',id:item.id,projectId:item.project_id,label:item.name,description:`Contract v${item.current_version} · ${item.status}`,href:`/contracts?dataset=${item.dataset_id}`,metadata:{status:item.status,dataset_id:item.dataset_id,current_version:item.current_version}})),
  ].map(item=>({...item,score:score(item.label,item.description,query,item.kind)}))
   .sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label))
   .slice(0,75)

  return NextResponse.json({query,count:results.length,results})
}
