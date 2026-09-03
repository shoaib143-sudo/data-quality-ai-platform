import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { calculateInitialNextRun } from '@/lib/orchestration/schedules'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function number(value: unknown) { const parsed=Number(value); return Number.isFinite(parsed)?parsed:null }

export async function GET() {
  try {
    await requireUser()
    const supabase=await createClient()
    const { data,error }=await supabase.schema('orchestration').from('job_schedules').select('*').order('next_run_at')
    if(error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({schedules:data??[]})
  } catch (error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to load schedules.'},{status:500})
  }
}

export async function POST(request: Request) {
  try {
    const user=await requireUser()
    const body=await request.json()
    const projectId=text(body.projectId)
    const datasetVersionId=text(body.datasetVersionId)
    const dataSourceId=text(body.dataSourceId)
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

    if(!projectId||!name||!['PROFILING','DATA_QUALITY','DISCOVERY'].includes(jobType)||!['HOURLY','DAILY','WEEKLY','INTERVAL'].includes(cadence)) {
      return NextResponse.json({error:'projectId, name, valid jobType and cadence are required.'},{status:400})
    }
    if(!['RUN_ONCE','SKIP','CATCH_UP'].includes(misfirePolicy)) return NextResponse.json({error:'Invalid misfirePolicy.'},{status:400})
    if(jobType==='DISCOVERY'&&!dataSourceId) return NextResponse.json({error:'dataSourceId is required for metadata discovery schedules.'},{status:400})
    if(jobType!=='DISCOVERY'&&!datasetVersionId) return NextResponse.json({error:'datasetVersionId is required for profiling and data quality schedules.'},{status:400})

    await authorizeProject(user.id,projectId,'schedule.manage')
    const admin=createAdminClient()

    if(jobType==='DISCOVERY') {
      const {data:source,error:sourceError}=await admin.schema('catalog').from('data_sources')
        .select('id,project_id,status,source_type,name')
        .eq('id',dataSourceId)
        .eq('project_id',projectId)
        .maybeSingle()
      if(sourceError) throw new Error(`Unable to validate discovery source: ${sourceError.message}`)
      if(!source) return NextResponse.json({error:'Data source does not belong to the selected project.'},{status:400})
      if(String(source.status).toUpperCase()!=='ACTIVE') return NextResponse.json({error:'Metadata discovery schedules require an ACTIVE data source.'},{status:409})
    } else {
      const { data: version,error:versionError }=await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,status').eq('id',datasetVersionId).maybeSingle()
      if(versionError) throw new Error(`Unable to validate dataset version: ${versionError.message}`)
      if(!version) return NextResponse.json({error:'Dataset version not found.'},{status:404})
      const { data: dataset,error:datasetError }=await admin.schema('catalog').from('datasets').select('id,project_id').eq('id',version.dataset_id).eq('project_id',projectId).maybeSingle()
      if(datasetError) throw new Error(`Unable to validate dataset project ownership: ${datasetError.message}`)
      if(!dataset) return NextResponse.json({error:'Dataset does not belong to the selected project.'},{status:400})
      if(jobType==='PROFILING'&&String(version.status).toUpperCase()!=='AVAILABLE') return NextResponse.json({error:'Profiling schedules require an AVAILABLE dataset version.'},{status:409})
    }

    const nextRunAt=calculateInitialNextRun({cadence:cadence as 'HOURLY'|'DAILY'|'WEEKLY'|'INTERVAL',intervalMinutes,runHour,runMinute,dayOfWeek})
    const { data,error }=await admin.schema('orchestration').from('job_schedules').insert({
      project_id:projectId,
      dataset_version_id:jobType==='DISCOVERY'?null:datasetVersionId,
      data_source_id:jobType==='DISCOVERY'?dataSourceId:null,
      job_type:jobType,
      name,
      enabled:true,
      timezone,
      cadence,
      interval_minutes:intervalMinutes,
      run_hour:runHour,
      run_minute:runMinute,
      day_of_week:dayOfWeek,
      next_run_at:nextRunAt,
      misfire_policy:misfirePolicy,
      retry_policy:{max_attempts:Math.max(1,Math.min(10,maxAttempts)),backoff_minutes:Math.max(1,Math.min(1440,backoffMinutes))},
      created_by:user.id,
    }).select('*').single()
    if(error) return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({schedule:data},{status:201})
  } catch (error) {
    if(error instanceof AuthorizationError) return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to create schedule.'},{status:500})
  }
}
