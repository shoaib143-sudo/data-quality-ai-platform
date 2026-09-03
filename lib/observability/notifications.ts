import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueDurableJob } from '@/lib/orchestration/queue'

const severityRank:Record<string,number>={INFO:1,LOW:2,MEDIUM:3,HIGH:4,CRITICAL:5}

export async function queueAlertNotifications(alertId:string){
  const admin=createAdminClient()
  const {data:alert,error:alertError}=await admin.schema('profiling').from('observability_alerts').select('*').eq('id',alertId).maybeSingle()
  if(alertError||!alert)throw new Error(`Unable to load observability alert for notification: ${alertError?.message??'not found'}`)
  const {data:routes,error:routesError}=await admin.schema('profiling').from('notification_routes').select('*,notification_channels(*)').eq('project_id',alert.project_id).eq('enabled',true)
  if(routesError)throw new Error(`Unable to load notification routes: ${routesError.message}`)
  const queued:Array<Record<string,unknown>>=[]
  for(const route of routes??[]){
    const channel=Array.isArray(route.notification_channels)?route.notification_channels[0]:route.notification_channels
    if(!channel?.enabled)continue
    if(route.dataset_id&&route.dataset_id!==alert.dataset_id)continue
    if(route.alert_category&&route.alert_category!==alert.category)continue
    if((severityRank[String(alert.severity).toUpperCase()]??0)<(severityRank[String(route.min_severity).toUpperCase()]??3))continue
    const suppressionMinutes=Number(channel.suppression_minutes??60)
    const since=new Date(Date.now()-suppressionMinutes*60_000).toISOString()
    const {count}=await admin.schema('profiling').from('notification_deliveries').select('id',{count:'exact',head:true}).eq('channel_id',channel.id).eq('status','SENT').gte('created_at',since)
    if((count??0)>0){
      await admin.schema('profiling').from('notification_deliveries').insert({alert_id:alert.id,route_id:route.id,channel_id:channel.id,status:'SUPPRESSED',error_message:`Suppressed by ${suppressionMinutes} minute channel window.`})
      queued.push({routeId:route.id,channelId:channel.id,status:'SUPPRESSED'})
      continue
    }
    const {data:delivery,error:deliveryError}=await admin.schema('profiling').from('notification_deliveries').insert({alert_id:alert.id,route_id:route.id,channel_id:channel.id,status:'PENDING'}).select('id').single()
    if(deliveryError||!delivery)throw new Error(`Unable to create notification delivery: ${deliveryError?.message??'unknown error'}`)
    const delay=Number(route.escalation_after_minutes??0)
    const availableAt=new Date(Date.now()+Math.max(0,delay)*60_000).toISOString()
    const job=await enqueueDurableJob({projectId:alert.project_id,jobType:'NOTIFICATION',entityId:alert.id,payload:{deliveryId:delivery.id},availableAt,maxAttempts:3,priority:50})
    queued.push({routeId:route.id,channelId:channel.id,deliveryId:delivery.id,jobId:job.id,availableAt})
  }
  return queued
}

export async function deliverNotificationJob(deliveryId:string){
  const admin=createAdminClient()
  const {data:delivery,error:deliveryError}=await admin.schema('profiling').from('notification_deliveries').select('*,observability_alerts(*),notification_channels(*),notification_routes(*)').eq('id',deliveryId).maybeSingle()
  if(deliveryError||!delivery)throw new Error(`Notification delivery not found: ${deliveryError?.message??deliveryId}`)
  if(delivery.status==='SENT'||delivery.status==='SUPPRESSED')return {deliveryId,status:delivery.status}
  const alert=Array.isArray(delivery.observability_alerts)?delivery.observability_alerts[0]:delivery.observability_alerts
  const channel=Array.isArray(delivery.notification_channels)?delivery.notification_channels[0]:delivery.notification_channels
  if(!alert||!channel)throw new Error('Notification delivery is missing alert or channel configuration.')

  let response:Response
  const type=String(channel.channel_type).toUpperCase()
  if(type==='SLACK'||type==='WEBHOOK'){
    let endpoint=typeof channel.target==='string'&&/^https?:\/\//i.test(channel.target)?channel.target:null
    if(channel.secret_ref){
      const {data,error}=await admin.schema('profiling').rpc('get_notification_secret',{p_ref:channel.secret_ref})
      if(error)throw new Error(`Unable to resolve encrypted notification endpoint: ${error.message}`)
      if(typeof data==='string'&&data.trim())endpoint=data.trim()
    }
    if(!endpoint)throw new Error(`${type} notification channel has no encrypted endpoint configured.`)
    const body=type==='SLACK'
      ? {text:`[${alert.severity}] ${alert.title}\n${alert.description}\nCategory: ${alert.category}\nDataset: ${alert.dataset_id}`}
      : {event:'governance.alert',alert:{id:alert.id,category:alert.category,severity:alert.severity,title:alert.title,description:alert.description,status:alert.status,dataset_id:alert.dataset_id,profile_run_id:alert.profile_run_id,evidence:alert.evidence,last_observed_at:alert.last_observed_at}}
    response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  }else if(type==='EMAIL'){
    const apiKey=process.env.RESEND_API_KEY
    const from=process.env.GOVERNANCE_ALERT_FROM_EMAIL
    if(!apiKey||!from)throw new Error('Email notifications require RESEND_API_KEY and GOVERNANCE_ALERT_FROM_EMAIL.')
    response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[channel.target],subject:`[${alert.severity}] ${alert.title}`,text:`${alert.description}\n\nCategory: ${alert.category}\nDataset: ${alert.dataset_id}\nAlert: ${alert.id}`})})
  }else throw new Error(`Unsupported notification channel type: ${type}`)

  const now=new Date().toISOString()
  if(!response.ok){
    const detail=(await response.text()).slice(0,1000)
    await admin.schema('profiling').from('notification_deliveries').update({status:'FAILED',attempt:Number(delivery.attempt??0)+1,response_code:response.status,error_message:detail,delivered_at:null}).eq('id',deliveryId)
    throw new Error(`${type} notification returned HTTP ${response.status}: ${detail}`)
  }
  await admin.schema('profiling').from('notification_deliveries').update({status:'SENT',attempt:Number(delivery.attempt??0)+1,response_code:response.status,error_message:null,delivered_at:now}).eq('id',deliveryId)
  return {deliveryId,status:'SENT',channelType:type,responseCode:response.status}
}
