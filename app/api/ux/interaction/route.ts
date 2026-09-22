import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

const EVENT_TYPES=new Set([
  'UX_TASK_STARTED','UX_TASK_COMPLETED','UX_TASK_ABANDONED',
  'UX_SEARCH_PERFORMED','UX_SEARCH_ZERO_RESULTS',
  'UX_ERROR_ENCOUNTERED','UX_ERROR_RECOVERED',
  'UX_AI_ASSISTANCE_REQUESTED',
])
const SURFACES=new Set(['SEARCH','CATALOG','QUALITY','GOVERNANCE','AUTOMATION','MONITORING','APPROVALS','REPORTS','ADMIN','OTHER'])

function clean(value:unknown,max=120){return typeof value==='string'?value.trim().slice(0,max):''}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const body=await request.json().catch(()=>null) as Record<string,unknown>|null
    if(!body)return NextResponse.json({error:'JSON request body is required.'},{status:400})
    const projectId=clean(body.projectId,100)
    const eventType=clean(body.eventType).toUpperCase()
    const surface=clean(body.surface).toUpperCase()
    const action=clean(body.action,120)
    const outcome=clean(body.outcome,80)
    if(!projectId)return NextResponse.json({error:'projectId is required.'},{status:400})
    if(!EVENT_TYPES.has(eventType))return NextResponse.json({error:'Unsupported UX interaction event.'},{status:400})
    if(!SURFACES.has(surface))return NextResponse.json({error:'Unsupported UX surface.'},{status:400})
    await authorizeProject(user.id,projectId,'catalog.read')

    const occurredAt=new Date().toISOString()
    const admin=createAdminClient()
    const {error}=await admin.schema('orchestration').from('analytics_events').insert({
      event_id:crypto.randomUUID(),
      project_id:projectId,
      schema_version:2,
      event_type:eventType,
      occurred_at:occurredAt,
      aggregate_type:'ux_interaction',
      aggregate_id:projectId,
      aggregate_version:'2',
      actor_type:'USER',
      actor_id:user.id,
      payload:{surface,action:action||null,outcome:outcome||null},
    })
    if(error)throw new Error(`UX interaction telemetry persistence failed: ${error.message}`)
    return NextResponse.json({accepted:true,eventType,occurredAt},{status:202})
  }catch(error){
    const authorization=authorizationErrorResponse(error)
    if(authorization)return NextResponse.json({error:authorization.error},{status:authorization.status})
    console.error('UX interaction telemetry failed',error)
    return NextResponse.json({error:'Unable to record UX interaction telemetry.'},{status:500})
  }
}
