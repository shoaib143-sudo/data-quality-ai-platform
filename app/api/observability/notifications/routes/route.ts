import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const b=await request.json()
    const projectId=String(b.projectId??''),channelId=String(b.channelId??'')
    if(!projectId||!channelId)return NextResponse.json({error:'projectId and channelId are required.'},{status:400})
    await authorizeProject(user.id,projectId,'notification.manage')
    const admin=createAdminClient()
    const {data,error}=await admin.schema('profiling').from('notification_routes').insert({
      project_id:projectId,
      channel_id:channelId,
      alert_category:typeof b.alertCategory==='string'&&b.alertCategory?b.alertCategory:null,
      min_severity:String(b.minSeverity??'MEDIUM').toUpperCase(),
      dataset_id:b.datasetId||null,
      enabled:true,
      escalation_after_minutes:Number.isFinite(Number(b.escalationAfterMinutes))?Number(b.escalationAfterMinutes):null,
    }).select('*').single()
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({route:data},{status:201})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to create notification route.'},{status:500})
  }
}
