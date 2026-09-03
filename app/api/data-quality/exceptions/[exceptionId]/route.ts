import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeDatasetVersion, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(v:unknown){return typeof v==='string'?v.trim():''}

export async function PATCH(request:Request,{params}:{params:Promise<{exceptionId:string}>}){
  try{
    const user=await requireUser(),{exceptionId}=await params,body=await request.json(),admin=createAdminClient()
    const {data:exception,error:exceptionError}=await admin.schema('profiling').from('quality_rule_exceptions').select('*').eq('id',exceptionId).maybeSingle()
    if(exceptionError||!exception)return NextResponse.json({error:'Quality exception was not found.'},{status:404})
    const {dataset}=await authorizeDatasetVersion(user.id,exception.dataset_version_id,'quality.exception.approve')
    const action=text(body.action).toUpperCase()
    if(!['WAIVE','RESOLVE','REJECT','REOPEN'].includes(action))return NextResponse.json({error:'action must be WAIVE, RESOLVE, REJECT, or REOPEN.'},{status:400})

    const now=new Date().toISOString()
    let patch:Record<string,unknown>
    if(action==='WAIVE'){
      const reason=text(body.reason)
      const expiresAt=text(body.expiresAt)
      if(!reason||!expiresAt)return NextResponse.json({error:'Waivers require a reason and expiresAt.'},{status:400})
      const expiry=new Date(expiresAt)
      if(Number.isNaN(expiry.getTime())||expiry<=new Date())return NextResponse.json({error:'Waiver expiry must be a future timestamp.'},{status:400})
      patch={status:'WAIVED',waiver_reason:reason,approved_by:user.id,approved_at:now,expires_at:expiry.toISOString(),resolution_notes:text(body.notes)||null}
    }else if(action==='RESOLVE'){
      patch={status:'RESOLVED',resolution_notes:text(body.notes)||'Exception remediated.',waiver_reason:null,expires_at:null}
    }else if(action==='REJECT'){
      patch={status:'REJECTED',resolution_notes:text(body.notes)||'Exception rejected.',waiver_reason:null,expires_at:null}
    }else{
      patch={status:'OPEN',resolution_notes:text(body.notes)||'Exception reopened.',waiver_reason:null,approved_by:null,approved_at:null,expires_at:null}
    }

    const {data,error}=await admin.schema('profiling').from('quality_rule_exceptions').update(patch).eq('id',exceptionId).select('*').single()
    if(error)throw new Error(`Unable to update quality exception: ${error.message}`)

    const quarantineStatus=action==='REJECT'?'REJECTED':action==='REOPEN'?'QUARANTINED':'RELEASED'
    const {error:quarantineError}=await admin.schema('profiling').from('quality_quarantine_records').update({
      status:quarantineStatus,
      released_at:quarantineStatus==='RELEASED'?now:null,
    }).eq('dataset_version_id',exception.dataset_version_id).eq('record_hash',exception.record_hash).eq('rule_definition_id',exception.rule_definition_id)
    if(quarantineError)throw new Error(`Unable to update matching quarantine record: ${quarantineError.message}`)

    await writeGovernanceAudit({projectId:dataset.project_id,actorUserId:user.id,eventType:`QUALITY_EXCEPTION_${action}`,entityType:'QUALITY_EXCEPTION',entityId:exceptionId,metadata:{dataset_id:dataset.id,record_hash:exception.record_hash,rule_definition_id:exception.rule_definition_id,expires_at:patch.expires_at??null}})
    return NextResponse.json({exception:data,quarantineStatus})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to update quality exception.'},{status:500})
  }
}
