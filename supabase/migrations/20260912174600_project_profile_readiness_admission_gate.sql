-- Defense-in-depth admission gate for profiling runs.
-- The readiness verifier remains read-only. This trigger prevents a profile run
-- from being created for a dataset version whose deterministic readiness state
-- is BLOCKED or NOT_ASSESSED.

create or replace function profiling.enforce_profile_run_readiness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_readiness jsonb;
begin
  select d.project_id
    into v_project_id
  from catalog.dataset_versions dv
  join catalog.datasets d on d.id = dv.dataset_id
  where dv.id = new.dataset_version_id;

  if v_project_id is null then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_READINESS_DATASET_VERSION_NOT_FOUND';
  end if;

  v_readiness := catalog.verify_dataset_version_profile_readiness(
    v_project_id,
    new.dataset_version_id
  );

  if coalesce(v_readiness->>'state', 'NOT_ASSESSED') <> 'READY'
     or coalesce((v_readiness->>'profiling_ready')::boolean, false) <> true then
    raise exception using
      errcode = '23514',
      message = 'PROFILE_READINESS_GATE_BLOCKED',
      detail = v_readiness::text;
  end if;

  return new;
end;
$$;

comment on function profiling.enforce_profile_run_readiness() is
  'Fail-closed profile-run admission guard. Only deterministic READY dataset versions may create new profiling runs; existing runs are not rewritten.';

drop trigger if exists profile_runs_readiness_admission_guard on profiling.profile_runs;
create trigger profile_runs_readiness_admission_guard
before insert on profiling.profile_runs
for each row
execute function profiling.enforce_profile_run_readiness();

revoke all on function profiling.enforce_profile_run_readiness() from public, anon, authenticated;
grant execute on function profiling.enforce_profile_run_readiness() to service_role;
