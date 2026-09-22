export type UxSurface='SEARCH'|'CATALOG'|'QUALITY'|'GOVERNANCE'|'AUTOMATION'|'MONITORING'|'APPROVALS'|'REPORTS'|'ADMIN'|'OTHER'
export type UxEvent='UX_TASK_STARTED'|'UX_TASK_COMPLETED'|'UX_TASK_ABANDONED'|'UX_SEARCH_PERFORMED'|'UX_SEARCH_ZERO_RESULTS'|'UX_ERROR_ENCOUNTERED'|'UX_ERROR_RECOVERED'|'UX_AI_ASSISTANCE_REQUESTED'

export async function emitUxInteraction(input:{projectId:string;eventType:UxEvent;surface:UxSurface;action?:string;outcome?:string}){
  try{
    await fetch('/api/ux/interaction',{
      method:'POST',
      headers:{'content-type':'application/json'},
      credentials:'same-origin',
      keepalive:true,
      body:JSON.stringify(input),
    })
  }catch{
    // Experience telemetry is best-effort and must never block governed work.
  }
}
