-- P0 certification boundary: certification state may only change inside trusted
-- SECURITY DEFINER governance functions owned by the migration owner. Direct
-- PostgREST/service-role writes execute as service_role and are rejected.

create or replace function governance.guard_dataset_catalog_certification_write()
returns trigger
language plpgsql
set search_path = pg_catalog, governance
as $$
begin
  if current_user <> 'postgres' then
    if tg_op = 'INSERT' then
      if new.certification_status <> 'UNCERTIFIED'
         or new.certified_at is not null
         or new.certified_by is not null then
        raise exception 'Certification state must be changed through the governed certification workflow.'
          using errcode = '42501';
      end if;
    elsif (new.certification_status, new.certified_at, new.certified_by)
            is distinct from
          (old.certification_status, old.certified_at, old.certified_by) then
      raise exception 'Certification state must be changed through the governed certification workflow.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function governance.guard_dataset_catalog_certification_write() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_dataset_catalog_certification_write on governance.dataset_catalog;
create trigger trg_guard_dataset_catalog_certification_write
before insert or update on governance.dataset_catalog
for each row execute function governance.guard_dataset_catalog_certification_write();

create or replace function governance.request_dataset_certification(
  p_project_id uuid,
  p_dataset_id uuid,
  p_actor_user_id uuid,
  p_assigned_to uuid default null,
  p_evidence jsonb default '{}'::jsonb
)
returns governance.certification_requests
language plpgsql
security definer
set search_path = pg_catalog, governance, catalog, app
as $$
declare
  v_request governance.certification_requests%rowtype;
  v_organization_id uuid;
begin
  if not governance.has_project_capability(p_project_id, p_actor_user_id, 'certification.request') then
    raise exception 'Actor is not authorized to request certification for this project.' using errcode = '42501';
  end if;

  select p.organization_id into v_organization_id
  from app.projects p
  where p.id = p_project_id;
  if v_organization_id is null then
    raise exception 'Project was not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from catalog.datasets d where d.id = p_dataset_id and d.project_id = p_project_id
  ) then
    raise exception 'Dataset does not belong to the requested project.' using errcode = '23503';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from app.organization_members om
    where om.organization_id = v_organization_id
      and om.user_id = p_assigned_to
      and om.is_active = true
  ) then
    raise exception 'Assigned reviewer is not an active member of the project organization.' using errcode = '23503';
  end if;

  if exists (
    select 1 from governance.certification_requests cr
    where cr.dataset_id = p_dataset_id and cr.status in ('PENDING','IN_REVIEW')
  ) then
    raise exception 'An active certification request already exists for this dataset.' using errcode = '23505';
  end if;

  insert into governance.certification_requests (
    project_id, dataset_id, requested_by, assigned_to, status, evidence
  ) values (
    p_project_id, p_dataset_id, p_actor_user_id, p_assigned_to, 'PENDING', coalesce(p_evidence, '{}'::jsonb)
  ) returning * into v_request;

  insert into governance.dataset_catalog (dataset_id, project_id, certification_status, updated_at)
  values (p_dataset_id, p_project_id, 'PENDING', now())
  on conflict (dataset_id) do update
    set project_id = excluded.project_id,
        certification_status = 'PENDING',
        certified_at = null,
        certified_by = null,
        updated_at = now();

  return v_request;
end;
$$;

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
set search_path = pg_catalog, governance, catalog, app
as $$
declare
  v_request governance.certification_requests%rowtype;
  v_target_status text := upper(coalesce(p_status, ''));
  v_organization_id uuid;
  v_decided_at timestamptz;
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
    (v_request.status = 'PENDING' and v_target_status in ('IN_REVIEW','CANCELLED')) or
    (v_request.status = 'IN_REVIEW' and v_target_status in ('APPROVED','REJECTED','CANCELLED'))
  ) then
    raise exception 'Certification cannot transition from % to %.', v_request.status, v_target_status using errcode = '23514';
  end if;

  select p.organization_id into v_organization_id from app.projects p where p.id = v_request.project_id;
  if p_assigned_to is not null and not exists (
    select 1 from app.organization_members om
    where om.organization_id = v_organization_id
      and om.user_id = p_assigned_to
      and om.is_active = true
  ) then
    raise exception 'Assigned reviewer is not an active member of the project organization.' using errcode = '23503';
  end if;

  if v_target_status = 'APPROVED' and coalesce(v_request.evidence, '{}'::jsonb) = '{}'::jsonb then
    raise exception 'Certification approval requires evidence.' using errcode = '23514';
  end if;

  v_decided_at := case when v_target_status in ('APPROVED','REJECTED','CANCELLED') then now() else null end;
  update governance.certification_requests
  set status = v_target_status,
      decision_notes = p_decision_notes,
      assigned_to = coalesce(p_assigned_to, assigned_to),
      decided_at = v_decided_at
  where id = p_request_id
  returning * into v_request;

  if v_target_status in ('APPROVED','REJECTED') then
    insert into governance.dataset_catalog (
      dataset_id, project_id, certification_status, certified_at, certified_by, updated_at
    ) values (
      v_request.dataset_id,
      v_request.project_id,
      case when v_target_status = 'APPROVED' then 'CERTIFIED' else 'REJECTED' end,
      case when v_target_status = 'APPROVED' then v_decided_at else null end,
      case when v_target_status = 'APPROVED' then p_actor_user_id else null end,
      now()
    ) on conflict (dataset_id) do update
      set project_id = excluded.project_id,
          certification_status = excluded.certification_status,
          certified_at = excluded.certified_at,
          certified_by = excluded.certified_by,
          updated_at = excluded.updated_at;
  end if;

  return v_request;
end;
$$;

revoke all on function governance.request_dataset_certification(uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function governance.request_dataset_certification(uuid,uuid,uuid,uuid,jsonb) to service_role;
grant execute on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) to service_role;

comment on function governance.request_dataset_certification(uuid,uuid,uuid,uuid,jsonb) is
  'Service-only governed certification request entrypoint. Revalidates actor capability, dataset ownership, reviewer membership, and active-request uniqueness.';
comment on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) is
  'Service-only governed certification review entrypoint. Revalidates reviewer capability, state transitions, evidence, and reviewer membership before catalog certification mutation.';
