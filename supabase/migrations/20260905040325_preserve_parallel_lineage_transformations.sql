drop index if exists governance.lineage_edge_identity;
create unique index lineage_edge_identity
  on governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,transformation_id)
  nulls not distinct;

comment on index governance.lineage_edge_identity is
  'Lineage edge identity preserves parallel transformation-specific edges while keeping NULL-transformation edges idempotent.';

do $migration$
declare
  v_oid regprocedure;
  v_def text;
  v_patched text;
  v_old_compact text := 'on conflict(project_id,source_type,source_id,target_type,target_id,relationship)';
  v_new_compact text := 'on conflict(project_id,source_type,source_id,target_type,target_id,relationship,transformation_id)';
  v_old_spaced text := 'on conflict (project_id,source_type,source_id,target_type,target_id,relationship)';
  v_new_spaced text := 'on conflict (project_id,source_type,source_id,target_type,target_id,relationship,transformation_id)';
begin
  foreach v_oid in array array[
    'governance.ingest_lineage_batch_atomic_impl(uuid,uuid,text,text,text,jsonb)'::regprocedure,
    'governance.upsert_manual_lineage_edge(uuid,uuid,text,uuid,text,uuid,text,jsonb)'::regprocedure,
    'governance.record_lineage_for_dataset()'::regprocedure,
    'governance.record_lineage_for_dataset_version()'::regprocedure,
    'governance.record_lineage_for_profile_run()'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_oid) into v_def;
    v_patched := replace(replace(v_def,v_old_compact,v_new_compact),v_old_spaced,v_new_spaced);
    if v_patched=v_def then
      raise exception 'Expected legacy lineage edge conflict identity was not found in %',v_oid;
    end if;
    execute v_patched;
  end loop;
end;
$migration$;
