-- Forward-only extension for prospective learning coverage.
--
-- The released PGCL provenance migration remains immutable. This migration
-- broadens provenance classification to all terminal agent runs so failed,
-- partial, and cancelled production executions can enter the prospective
-- denominator without being treated as positive learning cases.

create or replace function agent.record_pgcl_run_learning_provenance(
  p_project_id uuid,
  p_agent_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent, catalog, app
as $$
declare
  v_run agent.agent_runs%rowtype;
  v_parent agent.agent_runs%rowtype;
  v_dataset_metadata jsonb := '{}'::jsonb;
  v_version_metadata jsonb := '{}'::jsonb;
  v_source_metadata jsonb := '{}'::jsonb;
  v_project_metadata jsonb := '{}'::jsonb;
  v_nonproduction boolean := false;
  v_reason text := 'TRUSTED_GOVERNED_RUNTIME_NON_SYNTHETIC';
  v_classification text := 'PRODUCTION_ELIGIBLE';
  v_existing agent.agent_run_learning_provenance%rowtype;
begin
  if p_project_id is null or p_agent_run_id is null then
    raise exception 'project and agent run are required for PGCL learning provenance';
  end if;

  select * into v_run
  from agent.agent_runs r
  where r.id = p_agent_run_id
    and r.project_id = p_project_id;

  if not found then
    raise exception 'PGCL learning provenance source run is missing or cross-project';
  end if;
  if v_run.status::text not in ('SUCCEEDED', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED') then
    raise exception 'PGCL learning provenance requires a terminal agent run';
  end if;

  if v_run.parent_run_id is not null then
    select * into v_parent
    from agent.agent_runs r
    where r.id = v_run.parent_run_id
      and r.project_id = p_project_id;
  end if;

  select coalesce(p.metadata, '{}'::jsonb)
  into v_project_metadata
  from app.projects p
  where p.id = p_project_id;

  if v_run.dataset_version_id is not null then
    select
      coalesce(d.metadata, '{}'::jsonb),
      coalesce(dv.metadata, '{}'::jsonb),
      coalesce(ds.connection_metadata, '{}'::jsonb)
    into v_dataset_metadata, v_version_metadata, v_source_metadata
    from catalog.dataset_versions dv
    join catalog.datasets d on d.id = dv.dataset_id
    left join catalog.data_sources ds on ds.id = d.data_source_id
    where dv.id = v_run.dataset_version_id
      and d.project_id = p_project_id;
  elsif v_run.dataset_id is not null then
    select
      coalesce(d.metadata, '{}'::jsonb),
      '{}'::jsonb,
      coalesce(ds.connection_metadata, '{}'::jsonb)
    into v_dataset_metadata, v_version_metadata, v_source_metadata
    from catalog.datasets d
    left join catalog.data_sources ds on ds.id = d.data_source_id
    where d.id = v_run.dataset_id
      and d.project_id = p_project_id;
  end if;

  v_nonproduction :=
    lower(coalesce(v_run.input->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'acceptance_test', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'smokeTest', 'false')) = 'true'
    or lower(coalesce(v_run.input->>'smoke_test', 'false')) = 'true'
    or lower(coalesce(v_run.input->'metadata'->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_run.output->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_run.output->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_run.output->'metadata'->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_dataset_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_dataset_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_version_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_version_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_source_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_source_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'synthetic', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'synthetic_bootstrap', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'test_fixture', 'false')) = 'true'
    or lower(coalesce(v_project_metadata->>'created_via', '')) in (
      'backend_regression_test',
      'synthetic_fixture',
      'test_fixture'
    )
    or (
      v_run.parent_run_id is not null
      and (
        lower(coalesce(v_parent.input->>'synthetic', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'synthetic_bootstrap', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'acceptance_test', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'smokeTest', 'false')) = 'true'
        or lower(coalesce(v_parent.input->>'smoke_test', 'false')) = 'true'
        or lower(coalesce(v_parent.output->>'synthetic', 'false')) = 'true'
        or lower(coalesce(v_parent.output->>'synthetic_bootstrap', 'false')) = 'true'
      )
    );

  if v_nonproduction then
    v_classification := 'SYNTHETIC_OR_TEST';
    v_reason := 'SOURCE_RUN_OR_DATA_PROVENANCE_MARKED_SYNTHETIC_OR_TEST';
  end if;

  select * into v_existing
  from agent.agent_run_learning_provenance p
  where p.agent_run_id = p_agent_run_id;

  if found then
    if v_existing.project_id <> p_project_id
      or v_existing.classification <> v_classification
      or v_existing.production_eligible <> (not v_nonproduction)
      or v_existing.synthetic_or_test_detected <> v_nonproduction
    then
      raise exception 'immutable PGCL learning provenance no longer matches source evidence';
    end if;

    return jsonb_build_object(
      'agentRunId', v_existing.agent_run_id,
      'projectId', v_existing.project_id,
      'classification', v_existing.classification,
      'productionEligible', v_existing.production_eligible,
      'syntheticOrTestDetected', v_existing.synthetic_or_test_detected,
      'reason', v_existing.reason,
      'recordedAt', v_existing.recorded_at
    );
  end if;

  insert into agent.agent_run_learning_provenance(
    agent_run_id,
    project_id,
    classification,
    classification_source,
    production_eligible,
    synthetic_or_test_detected,
    reason,
    evidence
  ) values (
    p_agent_run_id,
    p_project_id,
    v_classification,
    'PGCL_GOVERNED_RUNTIME',
    not v_nonproduction,
    v_nonproduction,
    v_reason,
    jsonb_build_object(
      'datasetId', v_run.dataset_id,
      'datasetVersionId', v_run.dataset_version_id,
      'parentRunId', v_run.parent_run_id,
      'datasetSynthetic', lower(coalesce(v_dataset_metadata->>'synthetic', 'false')) = 'true',
      'versionSynthetic', lower(coalesce(v_version_metadata->>'synthetic', 'false')) = 'true',
      'sourceSynthetic', lower(coalesce(v_source_metadata->>'synthetic', 'false')) = 'true',
      'projectSyntheticOrTest',
        lower(coalesce(v_project_metadata->>'synthetic', 'false')) = 'true'
        or lower(coalesce(v_project_metadata->>'synthetic_bootstrap', 'false')) = 'true'
        or lower(coalesce(v_project_metadata->>'test_fixture', 'false')) = 'true'
        or lower(coalesce(v_project_metadata->>'created_via', '')) in (
          'backend_regression_test',
          'synthetic_fixture',
          'test_fixture'
        )
    )
  );

  return jsonb_build_object(
    'agentRunId', p_agent_run_id,
    'projectId', p_project_id,
    'classification', v_classification,
    'productionEligible', not v_nonproduction,
    'syntheticOrTestDetected', v_nonproduction,
    'reason', v_reason
  );
end;
$$;

revoke all on function agent.record_pgcl_run_learning_provenance(uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.record_pgcl_run_learning_provenance(uuid,uuid)
  to service_role;

comment on function agent.record_pgcl_run_learning_provenance(uuid,uuid) is
  'Classifies any terminal governed agent run for production-learning provenance. Terminal provenance is denominator evidence only and does not imply a positive learning outcome.';
