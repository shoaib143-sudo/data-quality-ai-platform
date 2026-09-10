'use client'
import { FormEvent,useMemo,useState } from 'react'
import { BellRing,Loader2,Plus,Save } from 'lucide-react'

type Project={id:string;name:string}
type Dataset={id:string;project_id:string;name:string}
type Policy={id:string;project_id:string;dataset_id:string;freshness_sla_hours:number;max_volume_change_ratio:number;max_score_drop:number;schema_change_policy:string;enabled:boolean}
type Channel={id:string;project_id:string;name:string;channel_type:string;target:string;enabled:boolean;suppression_minutes:number}
type Route={id:string;project_id:string;channel_id:string;alert_category:string|null;min_severity:string;dataset_id:string|null;enabled:boolean;escalation_after_minutes:number|null}
type Delivery={id:string;alert_id:string;channel_id:string|null;status:string;response_code:number|null;error_message:string|null;delivered_at:string|null;created_at:string}

const surface='rounded-3xl border border-white/10 bg-[#0a1d33] p-6 shadow-sm'
const field='rounded-xl border border-white/10 bg-[#08182b] px-3 py-2.5 text-slate-200 placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400'

export function ObservabilitySettings({projects,datasets,initialPolicies,initialChannels,initialRoutes,initialDeliveries,policyProjectIds,notificationProjectIds}:{projects:Project[];datasets:Dataset[];initialPolicies:Policy[];initialChannels:Channel[];initialRoutes:Route[];initialDeliveries:Delivery[];policyProjectIds:string[];notificationProjectIds:string[]}){
  const policyProjects=useMemo(()=>new Set(policyProjectIds),[policyProjectIds])
  const notificationProjects=useMemo(()=>new Set(notificationProjectIds),[notificationProjectIds])
  const notificationProjectRows=projects.filter(project=>notificationProjects.has(project.id))
  const policyDatasets=datasets.filter(dataset=>policyProjects.has(dataset.project_id))
  const[policies,setPolicies]=useState(initialPolicies)
  const[channels,setChannels]=useState(initialChannels)
  const[routes,setRoutes]=useState(initialRoutes)
  const[projectId,setProjectId]=useState(notificationProjectRows[0]?.id??'')
  const projectDatasets=datasets.filter(d=>d.project_id===projectId)
  const[channelName,setChannelName]=useState('Governance alerts')
  const[channelType,setChannelType]=useState('SLACK')
  const[target,setTarget]=useState('')
  const[suppression,setSuppression]=useState('60')
  const[routeChannel,setRouteChannel]=useState('')
  const[routeDataset,setRouteDataset]=useState('')
  const[routeCategory,setRouteCategory]=useState('')
  const[minSeverity,setMinSeverity]=useState('MEDIUM')
  const[escalation,setEscalation]=useState('0')
  const[busy,setBusy]=useState(false)
  const[message,setMessage]=useState('')
  const policyByDataset=useMemo(()=>new Map(policies.map(p=>[p.dataset_id,p])),[policies])

  async function savePolicy(datasetId:string,form:HTMLFormElement){
    const dataset=datasets.find(item=>item.id===datasetId)
    if(!dataset||!policyProjects.has(dataset.project_id)){setMessage('You do not have observability policy authority for this dataset.');return}
    setBusy(true)
    try{
      const fd=new FormData(form)
      const r=await fetch(`/api/observability/policies/${datasetId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({freshnessSlaHours:Number(fd.get('freshness')),maxVolumeChangeRatio:Number(fd.get('volume')),maxScoreDrop:Number(fd.get('score')),schemaChangePolicy:String(fd.get('schema')),enabled:true})})
      const p=await r.json();if(!r.ok)throw new Error(p.error??'Policy save failed.')
      setPolicies(v=>[...v.filter(i=>i.dataset_id!==datasetId),p.policy]);setMessage('Observability policy saved.')
    }catch(e){setMessage(e instanceof Error?e.message:'Policy save failed.')}finally{setBusy(false)}
  }

  async function createChannel(e:FormEvent){
    e.preventDefault()
    if(!notificationProjects.has(projectId)){setMessage('You do not have notification management authority for this project.');return}
    setBusy(true)
    try{
      const r=await fetch('/api/observability/notifications/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,name:channelName,channelType,target,suppressionMinutes:Number(suppression),displayTarget:channelType==='SLACK'?'Slack webhook':'Webhook endpoint'})})
      const p=await r.json();if(!r.ok)throw new Error(p.error??'Channel creation failed.')
      setChannels(v=>[p.channel,...v]);setRouteChannel(p.channel.id);setTarget('');setMessage('Notification channel created securely.')
    }catch(e){setMessage(e instanceof Error?e.message:'Channel creation failed.')}finally{setBusy(false)}
  }

  async function createRoute(){
    if(!notificationProjects.has(projectId)){setMessage('You do not have notification routing authority for this project.');return}
    setBusy(true)
    try{
      const channelId=routeChannel||channels.find(c=>c.project_id===projectId)?.id
      if(!channelId)throw new Error('Create or select a notification channel first.')
      const r=await fetch('/api/observability/notifications/routes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,channelId,datasetId:routeDataset||null,alertCategory:routeCategory||null,minSeverity,escalationAfterMinutes:Number(escalation)})})
      const p=await r.json();if(!r.ok)throw new Error(p.error??'Route creation failed.')
      setRoutes(v=>[p.route,...v]);setMessage('Notification route created.')
    }catch(e){setMessage(e instanceof Error?e.message:'Route creation failed.')}finally{setBusy(false)}
  }

  return <div className="mt-6 space-y-6">
    {message?<p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">{message}</p>:null}

    <section className={surface}><h2 className="text-xl font-bold text-white">Dataset policies</h2><p className="mt-1 text-sm text-slate-500">Thresholds are persisted as governed policy and applied by the observability evaluator.</p><div className="mt-5 grid gap-3">{policyDatasets.map(d=>{const p=policyByDataset.get(d.id);return <form key={d.id} onSubmit={e=>{e.preventDefault();void savePolicy(d.id,e.currentTarget)}} className="grid gap-3 rounded-2xl border border-white/[0.07] bg-[#08182b] p-4 md:grid-cols-[1.2fr_repeat(4,0.8fr)_auto] md:items-end"><div><p className="font-bold text-slate-200">{d.name}</p><p className="text-xs text-slate-500">{projects.find(x=>x.id===d.project_id)?.name??'Project'}</p></div><label className="text-xs font-bold text-slate-400">Freshness SLA h<input name="freshness" type="number" min="1" defaultValue={p?.freshness_sla_hours??24} className={`mt-1 w-full ${field}`}/></label><label className="text-xs font-bold text-slate-400">Volume Δ ratio<input name="volume" type="number" step="0.05" min="0" defaultValue={p?.max_volume_change_ratio??0.5} className={`mt-1 w-full ${field}`}/></label><label className="text-xs font-bold text-slate-400">Score drop<input name="score" type="number" step="0.01" min="0" max="1" defaultValue={p?.max_score_drop??0.1} className={`mt-1 w-full ${field}`}/></label><label className="text-xs font-bold text-slate-400">Schema policy<select name="schema" defaultValue={p?.schema_change_policy??'ALERT'} className={`mt-1 w-full ${field}`}><option>IGNORE</option><option>ALERT</option><option>BLOCK</option></select></label><button disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"><Save className="h-4 w-4"/>Save</button></form>})}{policyDatasets.length===0?<p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">No dataset policy settings are available for your current project authority.</p>:null}</div></section>

    {notificationProjectRows.length?<><div className="grid gap-6 lg:grid-cols-2"><form onSubmit={createChannel} className={surface}><div className="flex items-center gap-2"><BellRing className="h-5 w-5 text-violet-300"/><h2 className="text-xl font-bold text-white">Notification channels</h2></div><div className="mt-4 grid gap-3"><select value={projectId} onChange={e=>{setProjectId(e.target.value);setRouteChannel('');setRouteDataset('')}} className={field}>{notificationProjectRows.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input value={channelName} onChange={e=>setChannelName(e.target.value)} className={field}/><select value={channelType} onChange={e=>setChannelType(e.target.value)} className={field}><option>SLACK</option><option>WEBHOOK</option><option>EMAIL</option></select><input value={target} onChange={e=>setTarget(e.target.value)} placeholder={channelType==='EMAIL'?'alerts@example.com':'Webhook URL stored encrypted in Vault'} className={field}/><input type="number" value={suppression} onChange={e=>setSuppression(e.target.value)} className={field} placeholder="Suppression minutes"/><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white hover:bg-violet-500 disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<Plus className="h-4 w-4"/>}Create channel</button></div><div className="mt-4 space-y-2">{channels.filter(c=>c.project_id===projectId).map(c=><div key={c.id} className="rounded-xl bg-white/[0.04] p-3 text-sm text-slate-300"><span className="font-bold">{c.name}</span><span className="ml-2 rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-slate-400">{c.channel_type}</span><p className="mt-1 text-xs text-slate-500">{c.channel_type==='EMAIL'?c.target:'Encrypted endpoint'} · suppress {c.suppression_minutes}m</p></div>)}</div></form><section className={surface}><h2 className="text-xl font-bold text-white">Routing & escalation</h2><div className="mt-4 grid gap-3"><select value={routeChannel} onChange={e=>setRouteChannel(e.target.value)} className={field}><option value="">Select channel</option>{channels.filter(c=>c.project_id===projectId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={routeDataset} onChange={e=>setRouteDataset(e.target.value)} className={field}><option value="">All datasets</option>{projectDatasets.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><select value={routeCategory} onChange={e=>setRouteCategory(e.target.value)} className={field}><option value="">All alert categories</option>{['QUALITY_SCORE_DROP','SCHEMA_DRIFT','VOLUME_CHANGE','QUALITY_RULE_FAILURE','PROFILE_FAILURE','FRESHNESS'].map(v=><option key={v}>{v}</option>)}</select><select value={minSeverity} onChange={e=>setMinSeverity(e.target.value)} className={field}><option>INFO</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><input type="number" min="0" value={escalation} onChange={e=>setEscalation(e.target.value)} className={field} placeholder="Escalation delay minutes"/><button type="button" disabled={busy} onClick={()=>void createRoute()} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-500 disabled:opacity-50">Add route</button></div><div className="mt-4 space-y-2">{routes.filter(r=>r.project_id===projectId).map(r=><div key={r.id} className="rounded-xl bg-white/[0.04] p-3 text-xs text-slate-400"><span className="font-bold text-slate-300">{channels.find(c=>c.id===r.channel_id)?.name??r.channel_id}</span><span className="ml-2">{r.alert_category??'ALL'} · ≥ {r.min_severity} · {r.dataset_id?datasets.find(d=>d.id===r.dataset_id)?.name:'all datasets'} · delay {r.escalation_after_minutes??0}m</span></div>)}</div></section></div><section className={surface}><h2 className="text-xl font-bold text-white">Recent deliveries</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase text-slate-500"><th className="px-2 py-2">Status</th><th className="px-2 py-2">Channel</th><th className="px-2 py-2">Response</th><th className="px-2 py-2">Time</th></tr></thead><tbody>{initialDeliveries.filter(d=>{const channel=channels.find(c=>c.id===d.channel_id);return channel?notificationProjects.has(channel.project_id):false}).map(d=><tr key={d.id} className="border-b border-white/[0.06]"><td className="px-2 py-2 font-bold text-slate-300">{d.status}</td><td className="px-2 py-2 text-slate-400">{channels.find(c=>c.id===d.channel_id)?.name??'N/A'}</td><td className="px-2 py-2 text-xs text-slate-500">{d.response_code??d.error_message??'—'}</td><td className="px-2 py-2 text-xs text-slate-500">{new Date(d.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></section></>:<section className={surface}><h2 className="text-xl font-bold text-white">Notifications</h2><p className="mt-2 text-sm text-slate-500">Notification channel and routing controls are hidden because your current project roles do not grant <code>notification.manage</code>.</p></section>}
  </div>
}
