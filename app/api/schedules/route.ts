import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateInitialNextRun } from '@/lib/orchestration/schedules'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function number(value: unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:null }

async function requireProjectMembership(projectId: string, userId: string) {
  const admin=createAdminClient()
  const { data: project }=await admin.schema('app').from('projects').select('id,organization_id').eq('id',projectId).maybeSingle()
  if(!project) return null
  const { data: membership }=await admin.schema('app').from('organization_members').select('role').eq('organization_id',project.organization_id).eq('user_id',userId).maybeSingle()
  return membership?{admin,project,membership}:null
}

export async function GET() {
  const user=await requireUser()
  const admin=createAdminClient()
  const { data: memberships }=await admin.schema('app').from('organization_members').select('organization_id').eq('user_id',user.id)
  const orgIds=(memberships??[]).map(row=>row.organization_id)
  if(!orgIds.length) return NextResponse.json({ schedules: [] })
  const { data: projects }=await admin.schema('app').from('projects').select('id').in('organization_id',orgIds)
  const projectIds=(projects??[]).map(row=>row.id)
  if(!projectIds.length) return NextResponse.json({ schedules: [] })
  const { data,error }=await admin.schema('orchestration').from('job_schedules').select('*').in('project_id',projectIds).order('next_run_at')
  if(error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({schedules:data??[]})
}

export async function POST(request: Request) {
  const user=await requireUser()
  const body=await request.json()
  const projectId=text(body.projectId)
  const datasetVersionId=text(body.datasetVersionId)
  const jobType=text(body.jobType).toUpperCase()
  const name=text(body.name)
  const cadence=text(body.cadence).toUpperCase()
  const timezone=text(body.timezone)||'UTC'
  const intervalMinutes=number(body.intervalMinutes)
  const runHour=number(body.runHour)
  const runMinute=number(body.runMinute)
  const dayOfWeek=number(body.dayOfWeek)
  const misfirePolicy=text(body.misfirePolicy).toUpperCase()||'RUN_ONCE'
  const maxAttempts=number(body.maxAttempts)??3
  const backoffMinutes=number(body.backoffMinutes)??5
  if(!projectId||!datasetVersionId||!name||!['PROFILING','DATA_QUALITY'].includes(jobType)||!['HOURLY','DAILY','WEEKLY','INTERVAL'].includes(cadence)) {
    return NextResponse.json({error:'projectId, datasetVersionId, name, valid jobType and cadence are required.'},{status:400})
  }
  const access=await requireProjectMembership(projectId,user.id)
  if(!access) return NextResponse.json({error:'Project access denied.'},{status:403})
  const { admin }=access
  const { data: version }=await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id',datasetVersionId).maybeSingle()
  if(!version) return NextResponse.json({error:'Dataset version not found.'},{status:404})
  const { data: dataset }=await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',version.dataset_id).eq('project_id',projectId).maybeSingle()
  if(!dataset) return NextResponse.json({error:'Dataset does not belong to the selected project.'},{status:400})
  const nextRunAt=calculateInitialNextRun({cadence:cadence as any,intervalMinutes,runHour,runMinute,dayOfWeek})
  const { data,error }=await admin.schema('orchestration').from('job_schedules').insert({
    project_id:projectId,dataset_version_id:datasetVersionId,job_type:jobType,name,enabled:true,timezone,cadence,
    interval_minutes:intervalMinutes,run_hour:runHour,run_minute:runMinute,day_of_week:dayOfWeek,next_run_at:nextRunAt,
    misfire_policy:misfirePolicy,retry_policy:{max_attempts:Math.max(1,maxAttempts),backoff_minutes:Math.max(1,backoffMinutes)},created_by:user.id,
  }).select('*').single()
  if(error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({schedule:data},{status:201})
}
