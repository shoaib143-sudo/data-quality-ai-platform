alter table governance.certification_requests
  add column if not exists decided_by uuid references auth.users(id);

revoke insert, update, delete, truncate on table governance.certification_requests from authenticated, service_role;
grant select on table governance.certification_requests to authenticated, service_role;

drop policy if exists certifications_project_access on governance.certification_requests;
drop policy if exists certification_requests_project_read on governance.certification_requests;
create policy certification_requests_project_read
on governance.certification_requests
for select
to authenticated
using (app_private.is_project_member(project_id));

create or replace function governance.review_dataset_certification(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_decision_notes text default null,
  p_assigned_to uuid default null
)
returns governance.certification_requests
language plpgsql
security definer
set search_path = 'pg_catalog', 'governance', 'catalog', 'app'
as $$
declare
  v_request governance.certification_requests%rowtype;
  v_target_status text := upper(coalesce(p_status, ''));
  v_organization_id uuid;
  v_decided_at timestamptz;
  v_catalog_status text;
  v_catalog_certified_at timestamptz;
  v_catalog_certified_by uuid;
  v_effective_assigned_to uuid;
  v_readiness_status text;
  v_readiness_score numeric;
  v_readiness_blockers jsonb;
  v_readiness_evidence jsonb;
  v_readiness_assessed_at timestamptz;
begin
  select * into v_request
  from governance.certification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Certification request was not found.' using errcode = 'P0002';
  end if;

  if not governance.has_project_capability(v_request.project_id, p_actor_user_id, 'certification.review') then
    raise exception 'Actor is not authorized to review certification for this project.' using errcode = '42501';
  end if;

  if v_target_status not in ('IN_REVIEW','APPROVED','REJECTED','CANCELLED') then
    raise exception 'Invalid certification status.' using errcode = '22023';
  end if;

  if not (
    (v_request.status='PENDING' and v_target_status in ('IN_REVIEW','CANCELLED'))
    or (v_request.status='IN_REVIEW' and v_target_status in ('APPROVED','REJECTED','CANCELLED'))
  ) then
    raise exception 'Certification cannot transition from % to %.', v_request.status, v_target_status using errcode = '23514';
  end if;

  select p.organization_id into v_organization_id
  from app.projects p
  where p.id = v_request.project_id;
  if v_organization_id is null then
    raise exception 'Project was not found.' using errcode = 'P0002';
  end if;

  v_effective_assigned_to := coalesce(p_assigned_to, v_request.assigned_to);
  if v_effective_assigned_to is not null and not exists (
    select 1
    from app.organization_members om
    where om.organization_id = v_organization_id
      and om.user_id = v_effective_assigned_to
  ) then
    raise exception 'Assigned reviewer is not a member of the project organization.' using errcode = '23503';
  end if;

  if v_target_status in ('APPROVED','REJECTED')
     and v_effective_assigned_to is not null
     and v_effective_assigned_to <> p_actor_user_id then
    raise exception 'Only the assigned reviewer may make the certification decision.' using errcode = '42501';
  end if;

  if v_target_status='APPROVED' then
    if v_request.requested_by is not null and v_request.requested_by = p_actor_user_id then
      raise exception 'Certification requester cannot approve their own request.' using errcode = '42501';
    end if;

    if coalesce(trim(p_decision_notes), '') = '' then
      raise exception 'Certification approval requires decision notes.' using errcode = '23514';
    end if;

    if coalesce(v_request.evidence, '{}'::jsonb)='{}'::jsonb then
      raise exception 'Certification approval requires request evidence.' using errcode = '23514';
    end if;

    perform governance.refresh_certification_readiness(v_request.project_id);

    select cr.readiness_status, cr.readiness_score, cr.blockers, cr.evidence, cr.assessed_at
      into v_readiness_status, v_readiness_score, v_readiness_blockers, v_readiness_evidence, v_readiness_assessed_at
    from governance.certification_readiness cr
    where cr.project_id = v_request.project_id
      and cr.dataset_id = v_request.dataset_id;

    if not found then
      raise exception 'Certification readiness evidence is unavailable.' using errcode = '23514';
    end if;

    if v_readiness_status <> 'READY'
       or coalesce(jsonb_array_length(v_readiness_blockers), 0) <> 0 then
      raise exception 'Dataset is not ready for certification. Status %, blockers %.', v_readiness_status, v_readiness_blockers using errcode = '23514';
    end if;
  end if;

  v_decided_at := case when v_target_status in ('APPROVED','REJECTED','CANCELLED') then now() else null end;

  update governance.certification_requests
  set status = v_target_status,
      decision_notes = p_decision_notes,
      assigned_to = v_effective_assigned_to,
      decided_at = v_decided_at,
      decided_by = case when v_decided_at is not null then p_actor_user_id else null end,
      evidence = case
        when v_target_status='APPROVED' then coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
          'certification_readiness', jsonb_build_object(
            'status', v_readiness_status,
            'score', v_readiness_score,
            'blockers', v_readiness_blockers,
            'evidence', v_readiness_evidence,
            'assessed_at', v_readiness_assessed_at
          )
        )
        else evidence
      end
  where id = p_request_id
  returning * into v_request;

  if v_target_status in ('APPROVED','REJECTED','CANCELLED') then
    if v_target_status='APPROVED' then
      v_catalog_status := 'CERTIFIED';
      v_catalog_certified_at := v_decided_at;
      v_catalog_certified_by := p_actor_user_id;
    elsif v_target_status='REJECTED' then
      v_catalog_status := 'REJECTED';
      v_catalog_certified_at := null;
      v_catalog_certified_by := null;
    else
      v_catalog_status := coalesce(v_request.prior_certification_status,'UNCERTIFIED');
      v_catalog_certified_at := v_request.prior_certified_at;
      v_catalog_certified_by := v_request.prior_certified_by;
    end if;

    insert into governance.dataset_catalog (
      dataset_id, project_id, certification_status, certified_at, certified_by, updated_at
    ) values (
      v_request.dataset_id, v_request.project_id, v_catalog_status, v_catalog_certified_at, v_catalog_certified_by, now()
    )
    on conflict (dataset_id) do update
    set project_id = excluded.project_id,
        certification_status = excluded.certification_status,
        certified_at = excluded.certified_at,
        certified_by = excluded.certified_by,
        updated_at = excluded.updated_at;
  end if;

  return v_request;
end;
$$;

revoke execute on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) to service_role;

select pg_notify('pgrst','reload schema');
