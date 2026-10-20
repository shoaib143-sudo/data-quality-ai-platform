import { createAdminClient } from '@/lib/supabase/admin'
import { queueAlertNotifications } from '@/lib/observability/notifications'

type Input={
  projectId:string
  datasetId:string
  category:'METADATA_CHANGE'|'LINEAGE_CHANGE'
  severity:'INFO'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'
  title:string
  description:string
  fingerprint:string
  evidence?:Record<string,unknown>
  notificationsEnvKey:'METADATA_CHANGE_NOTIFICATIONS_ENABLED'|'LINEAGE_CHANGE_NOTIFICATIONS_ENABLED'
}

export async function publishGovernanceChangeAlert(input:Input){
  const admin=createAdminClient()
  const now=new Date().toISOString()
  const {data,error}=await admin.schema('profiling').from('observability_alerts').upsert({
    project_id:input.projectId,
    dataset_id:input.datasetId,
    profile_run_id:null,
    category:input.category,
    severity:input.severity,
    title:input.title,
    description:input.description,
    fingerprint:input.fingerprint,
    evidence:input.evidence??{},
    status:'OPEN',
    last_observed_at:now,
    resolved_at:null,
    updated_at:now,
  },{onConflict:'project_id,fingerprint'}).select('id').single()
  if(error||!data)throw new Error(error?.message??'Unable to persist governed-change alert.')

  let queued=0
  if(process.env[input.notificationsEnvKey]?.trim().toLowerCase()==='true'){
    try{
      const deliveries=await queueAlertNotifications(String(data.id))
      queued=deliveries.filter(item=>item.status!=='SUPPRESSED').length
    }catch(error){
      console.error('[governed-change-notification]',error instanceof Error?error.message:error)
    }
  }
  return {alertId:String(data.id),notificationsQueued:queued}
}
