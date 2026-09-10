-- ADR-008: admit against any exact current enabled policy version in the project.
-- Request/concurrency accounting remains isolated per policy version.

create or replace function governance.acquire_ai_project_resource_budget_admission(
  p_project_id uuid,
  p_policy_version_id uuid,
  p_correlation_id uuid,
  p_lease_ttl_seconds integer default 300
)
returns table(
  admitted boolean,
  reason text,
  admission_id uuid,
  lease_id uuid,
  request_count_last_minute integer,
  active_concurrency integer,
  lease_expires_at timestamptz
)
language plpgsql
set search_path = 'pg_catalog', 'governance'
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
