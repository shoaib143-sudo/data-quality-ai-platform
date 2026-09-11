-- Forward-only correction for the run-scoped AI capability seed contract.
--
-- The canonical capability matrix returns capability_id, capability, and evidence_domain.
-- The original V6 ledger migration referenced legacy aliases (sr_no/module), which caused
-- create_ai_capability_e2e_run() to fail only when executed. Preserve the released
-- migration and replace the orchestration function with the current canonical contract.

create or replace function governance.create_ai_capability_e2e_run(
  p_project_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, governance, app
as $$
declare
  v_run_id uuid;
  v_organization_id uuid;
  v_capability_count integer;
  v_inserted_count integer;
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'run metadata must be a JSON object';
  end if;

  select p.organization_id
    into v_organization_id
  from app.projects p
  where p.id = p_project_id;

  if v_organization_id is null then
    raise exception 'project % does not exist', p_project_id;
  end if;

  select count(*)::integer
    into v_capability_count
  from governance.generate_ai_capability_matrix(p_project_id);

  if v_capability_count <> 75 then
    raise exception 'canonical capability matrix must contain exactly 75 rows, found %', v_capability_count;
  end if;

  insert into governance.ai_capability_e2e_runs (
    project_id,
    organization_id,
    metadata
  )
  values (
    p_project_id,
    v_organization_id,
    p_metadata
  )
  returning id into v_run_id;

  insert into governance.ai_capability_e2e_results (
    run_id,
    capability_sr_no,
    module,
    capability
  )
  select
    v_run_id,
    m.capability_id,
    m.evidence_domain,
    m.capability
  from governance.generate_ai_capability_matrix(p_project_id) m
  order by m.capability_id;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> 75 then
    raise exception 'run % seeded % capabilities instead of 75', v_run_id, v_inserted_count;
  end if;

  return v_run_id;
end;
$$;

revoke all on function governance.create_ai_capability_e2e_run(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function governance.create_ai_capability_e2e_run(uuid, jsonb)
  to service_role;

comment on function governance.create_ai_capability_e2e_run(uuid, jsonb) is
  'Creates a 75-capability run from the canonical matrix using capability_id and evidence_domain identity fields; matrix inventory is never run execution evidence.';
