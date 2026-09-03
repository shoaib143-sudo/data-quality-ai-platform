import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'

const allowedFields=new Set(['name','description','dimension','severity','metric_key','operator','threshold','enabled','rule_type','rule_config','column_name','certification_required'])

async function loadRule(ruleId:string,userId:string){
  const admin=createAdminClient()
  const {data:rule}=await admin.schema('profiling').from('quality_rule_definitions').select('*').eq('id',ruleId).maybeSingle()
  if(!rule)return null
  const {data:project}=await admin.schema('app').from('projects').select('organization_id').eq('id',rule.project_id).maybeSingle()
  if(!project)return null
  const {data:membership}=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  if(!membership)return null
  return {admin,rule,membership}
}

export async function PATCH(request:Request,{params}:{params:Promise<{ruleId:string}>}){
  const user=await requireUser()
  const {ruleId}=await params
  const context=await loadRule(ruleId,user.id)
  if(!context)return NextResponse.json({error:'Rule not found or access denied.'},{status:404})
  const body=await request.json()
  const updates:Record<string,unknown>={updated_at:new Date().toISOString()}
  for(const [key,value] of Object.entries(body)){
    const dbKey=key.replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`)
    if(allowedFields.has(dbKey)) updates[dbKey]=value
  }
  if(typeof updates.severity==='string') updates.severity=updates.severity.toUpperCase()
  if(typeof updates.dimension==='string') updates.dimension=updates.dimension.toUpperCase()
  if(typeof updates.operator==='string') updates.operator=updates.operator.toUpperCase()
  if(typeof updates.rule_type==='string') updates.rule_type=updates.rule_type.toUpperCase()
  const {data,error}=await context.admin.schema('profiling').from('quality_rule_definitions').update(updates).eq('id',ruleId).select('*').single()
  if(error)return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({rule:data})
}

export async function DELETE(_request:Request,{params}:{params:Promise<{ruleId:string}>}){
  const user=await requireUser()
  const {ruleId}=await params
  const context=await loadRule(ruleId,user.id)
  if(!context)return NextResponse.json({error:'Rule not found or access denied.'},{status:404})
  const {error}=await context.admin.schema('profiling').from('quality_rule_definitions').delete().eq('id',ruleId)
  if(error)return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({deleted:true})
}
