import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeProject } from '@/lib/auth/authorize'
import { assertRunId, STEP_FIELDS } from './execution-read-model'

export async function readExecutionBranch(userId: string, runId: string, branchId: string, offset = 0) {
    assertRunId(runId); assertRunId(branchId)
    const db=createAdminClient()
    const root=await db.schema('agent').from('agent_runs').select('id,project_id').eq('id',runId).single()
    if(root.error || !root.data) throw new Error('Unavailable root')
    await authorizeProject(userId,root.data.project_id,'agent.execute')
    let cursor:string|null=branchId; const seen=new Set<string>()
    while(cursor && cursor!==runId) {
      if(seen.has(cursor)||seen.size>=64) throw new Error('Invalid ancestry')
      seen.add(cursor)
      const row: { data: { parent_run_id: string | null } | null; error: unknown } = await db.schema('agent').from('agent_runs').select('parent_run_id').eq('project_id',root.data.project_id).eq('id',cursor).single()
      if(row.error || !row.data) throw new Error('Unavailable branch')
      cursor=row.data.parent_run_id
    }
    if(cursor!==runId) throw new Error('Branch does not belong to execution')
    const [steps,history,checkpoints,events]=await Promise.all([
      db.schema('agent').from('agent_run_steps').select(STEP_FIELDS).eq('agent_run_id',branchId).order('step_order').range(offset,offset+99),
      db.schema('agent').from('agent_artifacts').select('id,payload').eq('agent_run_id',branchId).eq('artifact_type','MONITOR_ATTEMPT').order('created_at').range(offset,offset+99),
      db.schema('agent').from('agent_run_checkpoints').select('id,checkpoint_seq,checkpoint_kind,step_name,created_at').eq('agent_run_id',branchId).order('checkpoint_seq').range(offset,offset+99),
      db.schema('agent').from('agent_supervisor_events').select('id,event_type,step_id,attempt,detail_code,created_at').eq('agent_run_id',branchId).order('created_at').range(offset,offset+99),
    ])
    if(steps.error||history.error) throw new Error('Unavailable details')
    const attempts=(history.data??[]).map(a=>{
      const p=a.payload && typeof a.payload==='object'?a.payload as Record<string,unknown>:{}
      return {evidenceId:a.id,stepId:typeof p.id==='string'?p.id:null,attempt:typeof p.attempt==='number'?p.attempt:null,status:typeof p.status==='string'?p.status:null,started_at:typeof p.started_at==='string'?p.started_at:null,completed_at:typeof p.completed_at==='string'?p.completed_at:null,error_code:typeof p.error_code==='string'?p.error_code:null}
    })
    return {steps:steps.data,attempts,checkpoints:checkpoints.data??[],events:events.data??[],diagnosticWarnings:[...(checkpoints.error?['Checkpoint history unavailable']:[]),...(events.error?['Supervisor events unavailable']:[])],historyCoverage:'Recorded snapshots only; older attempts may be unavailable.',nextOffset:steps.data?.length===100||history.data?.length===100||checkpoints.data?.length===100||events.data?.length===100?offset+100:null}
}
