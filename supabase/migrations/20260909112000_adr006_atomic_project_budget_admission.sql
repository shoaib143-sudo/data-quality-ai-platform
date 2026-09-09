create table governance.ai_resource_budget_request_admissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  policy_version_id uuid not null references governance.ai_resource_budget_policy_versions(id) on delete restrict,
  correlation_id uuid not null,
  admitted_at timestamptz not null default now(),
  unique (policy_version_id, correlation_id)
);

create index ai_resource_budget_request_admissions_policy_time_idx
  on governance.ai_resource_budget_request_admissions(policy_version_id, admitted_at desc);

create index ai_resource_budget_request_admissions_project_time_idx
  on governance.ai_resource_budget_request_admissions(project_id, admitted_at desc);

alter table governance.ai_resource_budget_request_admissions enable row level security;
create policy ai_resource_budget_request_admissions_read
  on governance.ai_resource_budget_request_admissions
  for select
  using (app_private.is_project_member(project_id));

create table governance.ai_resource_budget_concurrency_leases (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null unique references governance.ai_resource_budget_request_admissions(id) on delete restrict,
  project_id uuid not null references app.projects(id) on delete restrict,
  policy_version_id uuid not null references governance.ai_resource_budget_policy_versions(id) on delete restrict,
  correlation_id uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  constraint ai_resource_budget_concurrency_lease_expiry_check check (expires_at > acquired_at),
  constraint ai_resource_budget_concurrency_lease_release_check check (released_at is null or released_at >= acquired_at),
  unique (policy_version_id, correlation_id)
);

create index ai_resource_budget_concurrency_leases_active_idx
  on governance.ai_resource_budget_concurrency_leases(policy_version_id, expires_at)
  where released_at is null;

create index ai_resource_budget_concurrency_leases_project_idx
  on governance.ai_resource_budget_concurrency_leases(project_id, acquired_at desc);

alter table governance.ai_resource_budget_concurrency_leases enable row level security;
create policy ai_resource_budget_concurrency_leases_read
  on governance.ai_resource_budget_concurrency_leases
  for select
  using (app_private.is_project_member(project_id));

create or replace function governance.ai_project_resource_budget_lock_key(p_project_id uuid)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select hashtextextended('datanexus:ai-project-resource-budget:' || p_project_id::text, 0);
$$;

create or replace function governance.lock_ai_project_resource_budget_policy_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, governance
as $$
begin
  if new.scope_type = 'PROJECT' and new.scope_key = 'PROJECT' then
    perform pg_advisory_xact_lock(governance.ai_project_resource_budget_lock_key(new.project_id));
  end if;
  return new;
end;
$$;

create trigger ai_resource_budget_policy_versions_project_lock
before insert on governance.ai_resource_budget_policy_versions
for each row execute function governance.lock_ai_project_resource_budget_policy_change();

create or replace function governance.acquire_ai_project_resource_budget_admission(
  p_project_id uuid,
  p_policy_version_id uuid,
  p_correlation_id uuid,
  p_lease_ttl_seconds integer default 300
)
returns table (
  admitted boolean,
  reason text,
  admission_id uuid,
  lease_id uuid,
  request_count_last_minute integer,
  active_concurrency integer,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, governance
as $$
declare
  v_policy governance.ai_resource_budget_policy_versions%rowtype;
  v_existing_admission governance.ai_resource_budget_request_admissions%rowtype;
  v_existing_lease governance.ai_resource_budget_concurrency_leases%rowtype;
  v_admission_id uuid;
  v_lease_id uuid;
  v_request_count integer := 0;
  v_active_concurrency integer := 0;
  v_now timestamptz := clock_timestamp();
  v_lease_expires_at timestamptz;
begin
  if p_project_id is null or p_policy_version_id is null or p_correlation_id is null then
    raise exception 'project_id, policy_version_id, and correlation_id are required';
  end if;
  if p_lease_ttl_seconds < 1 or p_lease_ttl_seconds > 3600 then
    raise exception 'lease_ttl_seconds must be between 1 and 3600';
  end if;

  perform pg_advisory_xact_lock(governance.ai_project_resource_budget_lock_key(p_project_id));

  select versions.*
    into v_policy
  from governance.ai_resource_budget_policy_effective effective
  join governance.ai_resource_budget_policy_versions versions on versions.id = effective.id
  where effective.project_id = p_project_id
    and effective.scope_type = 'PROJECT'
    and effective.scope_key = 'PROJECT'
    and effective.id = p_policy_version_id;

  if not found then
    return query select false, 'POLICY_NOT_CURRENT'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
    return;
  end if;

  if not v_policy.enabled then
    return query select false, 'POLICY_DISABLED'::text, null::uuid, null::uuid, 0, 0, null::timestamptz;
    return;
  end if;

  select * into v_existing_admission
  from governance.ai_resource_budget_request_admissions
  where policy_version_id = p_policy_version_id
    and correlation_id = p_correlation_id;

  if found then
    select * into v_existing_lease
    from governance.ai_resource_budget_concurrency_leases
    where admission_id = v_existing_admission.id;

    select count(*)::integer into v_request_count
    from governance.ai_resource_budget_request_admissions
    where policy_version_id = p_policy_version_id
      and admitted_at > v_now - interval '1 minute';

    select count(*)::integer into v_active_concurrency
    from governance.ai_resource_budget_concurrency_leases
    where policy_version_id = p_policy_version_id
      and released_at is null
      and expires_at > v_now;

    return query select true, 'ALREADY_ADMITTED'::text, v_existing_admission.id,
      case when v_existing_lease.id is null then null::uuid else v_existing_lease.id end,
      v_request_count, v_active_concurrency,
      case when v_existing_lease.id is null then null::timestamptz else v_existing_lease.expires_at end;
    return;
  end if;

  if v_policy.max_requests_per_minute is not null then
    select count(*)::integer into v_request_count
    from governance.ai_resource_budget_request_admissions
    where policy_version_id = p_policy_version_id
      and admitted_at > v_now - interval '1 minute';

    if v_request_count >= v_policy.max_requests_per_minute then
      return query select false, 'RATE_LIMIT'::text, null::uuid, null::uuid, v_request_count, 0, null::timestamptz;
      return;
    end if;
  end if;

  if v_policy.max_concurrent_executions is not null then
    select count(*)::integer into v_active_concurrency
    from governance.ai_resource_budget_concurrency_leases
    where policy_version_id = p_policy_version_id
      and released_at is null
      and expires_at > v_now;

    if v_active_concurrency >= v_policy.max_concurrent_executions then
      return query select false, 'CONCURRENCY_LIMIT'::text, null::uuid, null::uuid, v_request_count, v_active_concurrency, null::timestamptz;
      return;
    end if;
  end if;

  insert into governance.ai_resource_budget_request_admissions(project_id, policy_version_id, correlation_id, admitted_at)
  values (p_project_id, p_policy_version_id, p_correlation_id, v_now)
  returning id into v_admission_id;

  v_request_count := v_request_count + 1;

  if v_policy.max_concurrent_executions is not null then
    v_lease_expires_at := v_now + make_interval(secs => p_lease_ttl_seconds);
    insert into governance.ai_resource_budget_concurrency_leases(
      admission_id, project_id, policy_version_id, correlation_id, acquired_at, expires_at
    ) values (
      v_admission_id, p_project_id, p_policy_version_id, p_correlation_id, v_now, v_lease_expires_at
    ) returning id into v_lease_id;
    v_active_concurrency := v_active_concurrency + 1;
  end if;

  return query select true, 'ADMITTED'::text, v_admission_id, v_lease_id, v_request_count, v_active_concurrency, v_lease_expires_at;
end;
$$;

create or replace function governance.release_ai_project_resource_budget_lease(
  p_project_id uuid,
  p_lease_id uuid,
  p_correlation_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, governance
as $$
declare
  v_updated uuid;
begin
  if p_project_id is null or p_lease_id is null or p_correlation_id is null then
    raise exception 'project_id, lease_id, and correlation_id are required';
  end if;

  update governance.ai_resource_budget_concurrency_leases
  set released_at = coalesce(released_at, clock_timestamp())
  where id = p_lease_id
    and project_id = p_project_id
    and correlation_id = p_correlation_id
  returning id into v_updated;

  return v_updated is not null;
end;
$$;

revoke all on governance.ai_resource_budget_request_admissions from anon;
revoke all on governance.ai_resource_budget_concurrency_leases from anon;
revoke insert, update, delete on governance.ai_resource_budget_request_admissions from authenticated;
revoke insert, update, delete on governance.ai_resource_budget_concurrency_leases from authenticated;

grant select on governance.ai_resource_budget_request_admissions to authenticated, service_role;
grant select on governance.ai_resource_budget_concurrency_leases to authenticated, service_role;
grant insert on governance.ai_resource_budget_request_admissions to service_role;
grant insert, update on governance.ai_resource_budget_concurrency_leases to service_role;

revoke all on function governance.ai_project_resource_budget_lock_key(uuid) from public, anon, authenticated;
revoke all on function governance.lock_ai_project_resource_budget_policy_change() from public, anon, authenticated;
revoke all on function governance.acquire_ai_project_resource_budget_admission(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function governance.release_ai_project_resource_budget_lease(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function governance.ai_project_resource_budget_lock_key(uuid) to service_role;
grant execute on function governance.acquire_ai_project_resource_budget_admission(uuid, uuid, uuid, integer) to service_role;
grant execute on function governance.release_ai_project_resource_budget_lease(uuid, uuid, uuid) to service_role;

comment on table governance.ai_resource_budget_request_admissions is 'ADR-006 runtime request-admission ledger for atomic PROJECT-scope rate limiting. It is execution accounting, not policy authority and not model approval evidence.';
comment on table governance.ai_resource_budget_concurrency_leases is 'ADR-006 runtime concurrency leases for atomic PROJECT-scope execution admission. Expiry/release controls capacity only; it never grants governance authority.';
comment on function governance.acquire_ai_project_resource_budget_admission(uuid, uuid, uuid, integer) is 'Atomically checks the exact current PROJECT/PROJECT policy version and enforces requests/minute plus concurrent-execution limits under a project advisory transaction lock. It does not enforce cost/day or infer any price.';
comment on function governance.release_ai_project_resource_budget_lease(uuid, uuid, uuid) is 'Idempotently releases a PROJECT-scope concurrency lease for the matching project and correlation ID.';
