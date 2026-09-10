import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateInitialNextRun } from '@/lib/orchestration/schedules'

function number(value: unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:null }

async function loadSchedule(scheduleId:string){
  const admin=createAdminClient()
  const {data:schedule,error}=await admin.schema('orchestration').from('job_schedules').select('*').eq('id',scheduleId).maybeSingle()
  if(error) throw new Error(`Unable to load schedule: ${error.message}`)
  if(!schedule) return null
  return {admin,schedule}
}

function errorResponse(error:unknown,fallback:string){
  const authorization=authorizationErrorResponse(error)
  if(authorization) return NextResponse.json({error:authorization.error},{status:authorization.status})
  return NextResponse.json({error:error instanceof Error?error.message:fallback},{status:500})
}

export async function PATCH(request:Request,{params}:{params:Promise<{scheduleId:string}>}){
  try{
    const user=await requireApiUser()
    const {scheduleId}=await params
    const context=await loadSchedule(scheduleId)
    if(!context) return NextResponse.json({error:'Schedule not found.'},{status:404})
    await authorizeProject(user.id,context.schedule.project_id,'schedule.manage')

    const body=await request.json()
    const updates:Record<string,unknown>={updated_at:new Date().toISOString()}
    if(typeof body.enabled==='boolean') updates.enabled=body.enabled
    if(typeof body.name==='string'&&body.name.trim()) updates.name=body.name.trim()
    if(typeof body.misfirePolicy==='string'&&['RUN_ONCE','SKIP','CATCH_UP'].includes(body.misfirePolicy.toUpperCase())) updates.misfire_policy=body.misfirePolicy.toUpperCase()
    if(body.maxAttempts!==undefined||body.backoffMinutes!==undefined){
      updates.retry_policy={
        max_attempts:Math.max(1,number(body.maxAttempts)??Number(context.schedule.retry_policy?.max_attempts??3)),
        backoff_minutes:Math.max(1,number(body.backoffMinutes)??Number(context.schedule.retry_policy?.backoff_minutes??5)),
      }
    }
    const schedulePatch={
      cadence:(typeof body.cadence==='string'?body.cadence.toUpperCase():context.schedule.cadence),
      intervalMinutes:body.intervalMinutes!==undefined?number(body.intervalMinutes):context.schedule.interval_minutes,
      runHour:body.runHour!==undefined?number(body.runHour):context.schedule.run_hour,
      runMinute:body.runMinute!==undefined?number(body.runMinute):context.schedule.run_minute,
      dayOfWeek:body.dayOfWeek!==undefined?number(body.dayOfWeek):context.schedule.day_of_week,
    }
    if(body.cadence!==undefined||body.intervalMinutes!==undefined||body.runHour!==undefined||body.runMinute!==undefined||body.dayOfWeek!==undefined){
      updates.cadence=schedulePatch.cadence
      updates.interval_minutes=schedulePatch.intervalMinutes
      updates.run_hour=schedulePatch.runHour
      updates.run_minute=schedulePatch.runMinute
      updates.day_of_week=schedulePatch.dayOfWeek
      updates.next_run_at=calculateInitialNextRun(schedulePatch as any)
    }
    const {data,error}=await context.admin.schema('orchestration').from('job_schedules').update(updates).eq('id',scheduleId).eq('project_id',context.schedule.project_id).select('*').single()
    if(error) return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({schedule:data})
  }catch(error){return errorResponse(error,'Unable to update schedule.')}
}

export async function DELETE(_request:Request,{params}:{params:Promise<{scheduleId:string}>}){
  try{
    const user=await requireApiUser()
    const {scheduleId}=await params
    const context=await loadSchedule(scheduleId)
    if(!context) return NextResponse.json({error:'Schedule not found.'},{status:404})
    await authorizeProject(user.id,context.schedule.project_id,'schedule.manage')
    const {error}=await context.admin.schema('orchestration').from('job_schedules').delete().eq('id',scheduleId).eq('project_id',context.schedule.project_id)
    if(error) return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({deleted:true})
  }catch(error){return errorResponse(error,'Unable to delete schedule.')}
}
