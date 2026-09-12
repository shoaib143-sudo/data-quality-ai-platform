import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260912062000_certification_authorization_and_readiness.sql', 'utf8')
const fail = (message) => { throw new Error(message) }

for (const marker of [
  'add column if not exists decided_by uuid references auth.users(id)',
  'revoke insert, update, delete, truncate on table governance.certification_requests from authenticated, service_role',
  'grant select on table governance.certification_requests to authenticated, service_role',
  'drop policy if exists certifications_project_access on governance.certification_requests',
  'create policy certification_requests_project_read',
  'for select',
  'app_private.is_project_member(project_id)',
  "governance.has_project_capability(v_request.project_id, p_actor_user_id, 'certification.review')",
  "Certification requester cannot approve their own request.",
  "Only the assigned reviewer may make the certification decision.",
  "Certification approval requires decision notes.",
  "perform governance.refresh_certification_readiness(v_request.project_id)",
  "v_readiness_status <> 'READY'",
  'jsonb_array_length(v_readiness_blockers)',
  "'certification_readiness', jsonb_build_object(",
  'decided_by = case when v_decided_at is not null then p_actor_user_id else null end',
  'revoke execute on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) from public, anon, authenticated',
  'grant execute on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) to service_role'
]) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) fail(`Certification hardening migration missing: ${marker}`)
}

for (const forbidden of [
  'for all\nto authenticated',
  'grant insert on table governance.certification_requests to authenticated',
  'grant update on table governance.certification_requests to authenticated',
  'grant delete on table governance.certification_requests to authenticated'
]) {
  if (migration.toLowerCase().includes(forbidden.toLowerCase())) fail(`Certification mutation bypass must remain absent: ${forbidden}`)
}

console.log('Certification authorization/readiness contract verified: client writes closed, separation of duties and fresh READY evidence required.')
