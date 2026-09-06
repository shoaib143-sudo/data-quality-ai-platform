-- Fix Wave 2 requester membership validation to use the actor-aware project membership model.
create or replace function governance.request_control_waiver(
  p_project_id uuid,
  p_control_id uuid,
  p_scope_binding_id uuid,
  p_actor uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','governance','app'
as $$
declare
  w governance.control_waivers%rowtype;
begin
  if p_actor is null or not exists(
    select 1
    from app.projects p
    join app.organization_members m on m.organization_id=p.organization_id
    where p.id=p_project_id and m.user_id=p_actor
  ) then
    raise exception 'Requester is not a project member';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Waiver reason is required'; end if;
  if not exists(
    select 1 from governance.control_definitions
    where id=p_control_id and project_id=p_project_id
      and lifecycle_status='ACTIVE' and review_status='APPROVED'
  ) then raise exception 'Only approved active controls can be waived'; end if;
  if p_scope_binding_id is not null and not exists(
    select 1 from governance.control_scope_bindings
    where id=p_scope_binding_id and project_id=p_project_id
      and control_id=p_control_id and status='ACTIVE'
  ) then raise exception 'Scope binding not valid and active for control'; end if;
  perform set_config('governance.control_waiver_actor',p_actor::text,true);
  insert into governance.control_waivers(project_id,control_id,scope_binding_id,reason,requested_by)
  values(p_project_id,p_control_id,p_scope_binding_id,btrim(p_reason),p_actor)
  returning * into w;
  perform set_config('governance.control_waiver_actor','',true);
  return jsonb_build_object('id',w.id,'status',w.status);
end;
$$;
revoke all on function governance.request_control_waiver(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function governance.request_control_waiver(uuid,uuid,uuid,uuid,text) to service_role;
