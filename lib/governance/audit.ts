import { createAdminClient } from '@/lib/supabase/admin'

export async function writeGovernanceAudit(input:{
  projectId?:string|null
  actorUserId?:string|null
  actorType?:'USER'|'SYSTEM'|'AGENT'
  eventType:string
  entityType?:string|null
  entityId?:string|null
  correlationId?:string|null
  metadata?:Record<string,unknown>
}){
  const admin=createAdminClient()
  const {error}=await admin.schema('governance').from('audit_events').insert({
    project_id:input.projectId??null,
    actor_user_id:input.actorUserId??null,
    actor_type:input.actorType??(input.actorUserId?'USER':'SYSTEM'),
    event_type:input.eventType,
    entity_type:input.entityType??null,
    entity_id:input.entityId??null,
    correlation_id:input.correlationId??null,
    metadata:input.metadata??{},
  })
  if(error) console.error('[governance-audit]',error.message)
}
