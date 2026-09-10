import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const allowedFields=new Set(['name','description','dimension','severity','metric_key','operator','threshold','enabled','rule_type','rule_config','column_name','certification_required'])

async function loadRule(ruleId:string){
  const admin=createAdminClient()
  const {data:rule,error}=await admin.schema('profiling').from('quality_rule_definitions').select('*').eq('id',ruleId).maybeSingle()
  if(error)throw new Error(`Unable to load quality rule: ${error.message}`)
  if(!rule)return null
  return {admin,rule}
}

export async function PATCH(request:Request,{params}:{params:Promise<{ruleId:string}>}){
  try{
    const user=await requireUser()
    const {ruleId}=await params
    const context=await loadRule(ruleId)
    if(!context)return NextResponse.json({error:'Rule not found.'},{status:404})
    await authorizeProject(user.id,context.rule.project_id,'quality.manage')
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
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update quality rule.'},{status:500})
  }
}

export async function DELETE(_request:Request,{params}:{params:Promise<{ruleId:string}>}){
  try{
    const user=await requireUser()
    const {ruleId}=await params
    const context=await loadRule(ruleId)
    if(!context)return NextResponse.json({error:'Rule not found.'},{status:404})
    await authorizeProject(user.id,context.rule.project_id,'quality.manage')
    const {error}=await context.admin.schema('profiling').from('quality_rule_definitions').delete().eq('id',ruleId)
    if(error)return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({deleted:true})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to delete quality rule.'},{status:500})
  }
}
