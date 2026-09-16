begin;

do $do$
declare
  v_project_id uuid;
  v_dataset_id uuid;
  v_version_id uuid;
  v_run_id uuid;
  v_column_id uuid;
  v_metric jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_contract jsonb;
  v_metric_count integer;
  v_finding_count integer;
  v_definition record;
begin
  select id into v_project_id from app.projects order by created_at asc limit 1;
  if v_project_id is null then
    raise exception 'Profiling lifecycle acceptance requires a reconstructed project fixture';
  end if;

  insert into catalog.datasets(project_id,name,description,source_identifier,metadata)
  values (v_project_id,'Synthetic profiling lifecycle','Disposable runtime acceptance dataset','runtime://synthetic',jsonb_build_object('synthetic',true))
  returning id into v_dataset_id;

  insert into catalog.dataset_versions(dataset_id,version_number,source_uri,schema_hash,row_count,column_count,status,metadata)
  values (v_dataset_id,1,'runtime://synthetic/v1','runtime-schema',2,1,'READY',jsonb_build_object('synthetic',true))
  returning id into v_version_id;

  insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,row_count,column_count,schema_hash,summary)
  values (v_version_id,'RUNNING','runtime-acceptance','1',2,1,'runtime-schema',jsonb_build_object('score',jsonb_build_object(
    'completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)))
  returning id into v_run_id;

  insert into profiling.profile_columns(profile_run_id,column_name,ordinal_position,source_type,inferred_type,nullable,total_count,non_null_count,null_count,blank_count,distinct_count)
  values (v_run_id,'id',1,'text','STRING',false,2,2,0,0,2)
  returning id into v_column_id;

  for v_definition in
    select id,metric_key,scope,value_type from profiling.metric_definitions where enabled order by metric_key
  loop
    v_metric := jsonb_build_object(
      'metric_definition_id',v_definition.id,
      'profile_column_id',case when v_definition.scope='DATASET' then null else v_column_id end,
      'metric_key',v_definition.metric_key
    );
    v_metric := v_metric || case v_definition.value_type
      when 'NUMBER' then jsonb_build_object('numeric_value',1)
      when 'STRING' then jsonb_build_object('text_value','runtime')
      when 'BOOLEAN' then jsonb_build_object('boolean_value',true)
      else jsonb_build_object('json_value',jsonb_build_object('runtime',true))
    end;
    v_metrics := v_metrics || jsonb_build_array(v_metric);
  end loop;

  perform profiling.persist_profiling_results(
    v_run_id,
    v_version_id,
    v_metrics,
    jsonb_build_array(jsonb_build_object(
      'profile_column_id',v_column_id,
      'finding_type','RUNTIME_ACCEPTANCE',
      'severity','LOW',
      'title','Disposable lifecycle finding',
      'description','Synthetic finding proving atomic persistence',
      'confidence',1,
      'evidence',jsonb_build_object('synthetic',true)
    )),
    jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1),
    jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)),
    'COMPLETED'
  );

  select profiling.validate_metric_execution_contract(v_run_id) into v_contract;
  if coalesce((v_contract->>'valid')::boolean,false) is not true then
    raise exception 'Completed profiling lifecycle contract invalid: %',v_contract;
  end if;

  if (select count(*) from profiling.profile_metrics where profile_run_id=v_run_id) <> jsonb_array_length(v_metrics) then
    raise exception 'Metric persistence count mismatch';
  end if;
  if not exists(select 1 from profiling.profile_findings where profile_run_id=v_run_id and finding_type='RUNTIME_ACCEPTANCE') then
    raise exception 'Finding persistence missing';
  end if;
  if not exists(select 1 from profiling.data_quality_scores where profile_run_id=v_run_id and overall_score=1) then
    raise exception 'Quality score persistence missing';
  end if;
  if not exists(select 1 from profiling.profile_runs where id=v_run_id and status='COMPLETED' and completed_at is not null) then
    raise exception 'Final profiling run state missing';
  end if;

  if not exists(
    select 1
    from profiling.profile_run_governance_insights
    where profile_run_id=v_run_id
      and dataset_version_id=v_version_id
      and run_status='COMPLETED'
      and row_count=2
      and column_count=1
      and overall_score=1
      and completeness_score=1
      and uniqueness_score=1
      and validity_score=1
      and total_findings=1
      and high_findings=0
      and medium_findings=0
      and info_findings=0
      and investigation_present=false
  ) then
    raise exception 'Governance insight projection missing or inconsistent';
  end if;

  select count(*) into v_metric_count from profiling.profile_metrics where profile_run_id=v_run_id;
  select count(*) into v_finding_count from profiling.profile_findings where profile_run_id=v_run_id;

  begin
    perform profiling.persist_profiling_results(
      v_run_id,
      gen_random_uuid(),
      v_metrics,
      '[]'::jsonb,
      jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1),
      jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)),
      'COMPLETED'
    );
    raise exception 'Mismatched dataset version persistence unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Mismatched dataset version persistence unexpectedly succeeded' then raise; end if;
      if sqlerrm not like 'Profiling run % was not found for dataset version %' then
        raise exception 'Unexpected mismatched-version failure: %',sqlerrm;
      end if;
  end;

  if (select count(*) from profiling.profile_metrics where profile_run_id=v_run_id) <> v_metric_count
     or (select count(*) from profiling.profile_findings where profile_run_id=v_run_id) <> v_finding_count then
    raise exception 'Failed persistence attempt mutated completed artifacts';
  end if;

  update profiling.profile_runs set status='CANCELLED' where id=v_run_id;
  begin
    perform profiling.persist_profiling_results(
      v_run_id,v_version_id,v_metrics,'[]'::jsonb,
      jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1),
      jsonb_build_object('score',jsonb_build_object('completeness_score',1,'uniqueness_score',1,'validity_score',1,'accuracy_score',null,'overall_score',1)),
      'COMPLETED'
    );
    raise exception 'Cancelled run persistence unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'Cancelled run persistence unexpectedly succeeded' then raise; end if;
      if sqlerrm not like 'Profiling run % has been cancelled' then
        raise exception 'Unexpected cancelled-run failure: %',sqlerrm;
      end if;
  end;

  if not exists(select 1 from profiling.profile_runs where id=v_run_id and status='CANCELLED') then
    raise exception 'Cancelled run state was not preserved';
  end if;
end;
$do$;

rollback;
