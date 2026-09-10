import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

function text(v:unknown){return typeof v==='string'?v.trim():''}

export async function POST(request:Request){
  try{
    const user=await requireUser()
    const b=await request.json()
    const projectId=text(b.projectId),name=text(b.name),channelType=text(b.channelType).toUpperCase(),target=text(b.target)
    if(!projectId||!name||!['EMAIL','SLACK','WEBHOOK'].includes(channelType)||!target)return NextResponse.json({error:'Complete channel configuration is required.'},{status:400})
    await authorizeProject(user.id,projectId,'notification.manage')
    const admin=createAdminClient()
    const persistedTarget=channelType==='EMAIL'?target:(text(b.displayTarget)||channelType)
    const {data,error}=await admin.schema('profiling').from('notification_channels').insert({project_id:projectId,name,channel_type:channelType,target:persistedTarget,enabled:true,suppression_minutes:Math.max(0,Number(b.suppressionMinutes??60)),metadata:b.metadata??{}}).select('*').single()
    if(error||!data)return NextResponse.json({error:error?.message??'Unable to create channel.'},{status:400})
    if(channelType!=='EMAIL'){
      const {error:secretError}=await admin.schema('profiling').rpc('store_notification_secret',{p_channel_id:data.id,p_secret:target})
      if(secretError){
        await admin.schema('profiling').from('notification_channels').delete().eq('id',data.id)
        return NextResponse.json({error:`Unable to secure endpoint: ${secretError.message}`},{status:400})
      }
    }
    return NextResponse.json({channel:{...data,target:channelType==='EMAIL'?target:'ENCRYPTED_ENDPOINT'}},{status:201})
  }catch(error){
    if(error instanceof AuthorizationError)return NextResponse.json({error:error.message},{status:error.status})
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to create notification channel.'},{status:500})
  }
}
