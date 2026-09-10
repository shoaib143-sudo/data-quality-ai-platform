-- Correct the governed certification runtime contract without rewriting the released
-- 20260910113000 migration. The live app.organization_members contract represents
-- active membership by row presence and has no is_active column.
--
-- Preserve the catalog certification state that existed before a request so a
-- cancelled re-certification restores the prior authoritative state instead of
-- leaving the dataset indefinitely PENDING.

alter table governance.certification_requests
  add column if not exists prior_certification_status text,
  add column if not exists prior_certified_at timestamptz,
  add column if not exists prior_certified_by uuid;

alter table governance.certification_requests
  drop constraint if exists certification_requests_prior_certification_status_check;
alter table governance.certification_requests
  add constraint certification_requests_prior_certification_status_check
  check (
    prior_certification_status is null
    or prior_certification_status in ('UNCERTIFIED','PENDING','CERTIFIED','REJECTED','EXPIRED')
  );

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
  v_prior_status text := 'UNCERTIFIED';
  v_prior_certified_at timestamptz;
  v_prior_certified_by uuid;
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
  ) then
    raise exception 'Assigned reviewer is not a member of the project organization.' using errcode = '23503';
  end if;

  if exists (
    select 1 from governance.certification_requests cr
    where cr.dataset_id = p_dataset_id and cr.status in ('PENDING','IN_REVIEW')
  ) then
    raise exception 'An active certification request already exists for this dataset.' using errcode = '23505';
  end if;

  select dc.certification_status, dc.certified_at, dc.certified_by
    into v_prior_status, v_prior_certified_at, v_prior_certified_by
  from governance.dataset_catalog dc
  where dc.dataset_id = p_dataset_id;
  if not found then
    v_prior_status := 'UNCERTIFIED';
    v_prior_certified_at := null;
    v_prior_certified_by := null;
  end if;

  insert into governance.certification_requests (
    project_id, dataset_id, requested_by, assigned_to, status, evidence,
    prior_certification_status, prior_certified_at, prior_certified_by
  ) values (
    p_project_id, p_dataset_id, p_actor_user_id, p_assigned_to, 'PENDING', coalesce(p_evidence, '{}'::jsonb),
    v_prior_status, v_prior_certified_at, v_prior_certified_by
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
  v_catalog_status text;
  v_catalog_certified_at timestamptz;
  v_catalog_certified_by uuid;
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

  select p.organization_id into v_organization_id
  from app.projects p
  where p.id = v_request.project_id;
  if v_organization_id is null then
    raise exception 'Project was not found.' using errcode = 'P0002';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from app.organization_members om
    where om.organization_id = v_organization_id
      and om.user_id = p_assigned_to
  ) then
    raise exception 'Assigned reviewer is not a member of the project organization.' using errcode = '23503';
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

  if v_target_status in ('APPROVED','REJECTED','CANCELLED') then
    if v_target_status = 'APPROVED' then
      v_catalog_status := 'CERTIFIED';
      v_catalog_certified_at := v_decided_at;
      v_catalog_certified_by := p_actor_user_id;
    elsif v_target_status = 'REJECTED' then
      v_catalog_status := 'REJECTED';
      v_catalog_certified_at := null;
      v_catalog_certified_by := null;
    else
      v_catalog_status := coalesce(v_request.prior_certification_status, 'UNCERTIFIED');
      v_catalog_certified_at := v_request.prior_certified_at;
      v_catalog_certified_by := v_request.prior_certified_by;
    end if;

    insert into governance.dataset_catalog (
      dataset_id, project_id, certification_status, certified_at, certified_by, updated_at
    ) values (
      v_request.dataset_id, v_request.project_id, v_catalog_status,
      v_catalog_certified_at, v_catalog_certified_by, now()
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
  'Service-only certification request entrypoint. Revalidates capability, dataset ownership and reviewer membership, and preserves prior catalog certification state for cancellation.';
comment on function governance.review_dataset_certification(uuid,uuid,text,text,uuid) is
  'Service-only certification review entrypoint. Revalidates capability, transitions, evidence and reviewer membership, and atomically applies or restores catalog certification state.';
