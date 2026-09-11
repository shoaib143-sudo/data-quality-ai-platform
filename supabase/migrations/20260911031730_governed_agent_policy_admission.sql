create or replace function governance.seed_default_autonomy_policies(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance'
as $function$
declare
  v_count integer := 0;
begin
  insert into governance.autonomy_policies(
    project_id,
    action_key,
    enabled,
    execution_mode,
    min_confidence,
    max_auto_risk_level,
    reversible,
    rollback_strategy,
    allowed_target_types,
    metadata,
    updated_at
  )
  values
    (p_project_id,'CREATE_GOVERNANCE_ISSUE',true,'AUTO',0.80,'CRITICAL',true,'CLOSE_CREATED_ISSUE',array['DATASET','PROJECT'],jsonb_build_object('blast_radius','GOVERNANCE_METADATA_ONLY','production_source_mutation',false),now()),
    (p_project_id,'REQUEST_REPROFILE',true,'APPROVAL_REQUIRED',0.85,'HIGH',false,null,array['DATASET_VERSION'],jsonb_build_object('reason','COMPUTE_AND_SOURCE_READ_SIDE_EFFECT','production_source_mutation',false),now()),
    (p_project_id,'RUN_GOVERNANCE_AGENT',true,'AUTO',1.0,'LOW',true,'DISCARD_NON_AUTHORITATIVE_AGENT_OUTPUT',array['GOVERNANCE_AGENT'],jsonb_build_object('blast_radius','NON_AUTHORITATIVE_GOVERNANCE_ANALYSIS','production_source_mutation',false,'authoritative_governance_mutation',false),now()),
    (p_project_id,'UPDATE_QUALITY_RULE_THRESHOLD',false,'BLOCKED',1.0,'INFO',false,null,array['QUALITY_RULE'],jsonb_build_object('blocked_reason','THRESHOLD_CHANGES_REQUIRE_EXPLICIT_HUMAN_GOVERNANCE'),now()),
    (p_project_id,'MUTATE_SOURCE_DATA',false,'BLOCKED',1.0,'INFO',false,null,array['DATASET'],jsonb_build_object('blocked_reason','SOURCE_DATA_MUTATION_NOT_ALLOWED_FOR_AUTONOMOUS_AGENTS'),now()),
    (p_project_id,'ALTER_SCHEMA',false,'BLOCKED',1.0,'INFO',false,null,array['DATASET'],jsonb_build_object('blocked_reason','SCHEMA_MUTATION_NOT_ALLOWED_FOR_AUTONOMOUS_AGENTS'),now()),
    (p_project_id,'DELETE_DATA',false,'BLOCKED',1.0,'INFO',false,null,array['DATASET'],jsonb_build_object('blocked_reason','DESTRUCTIVE_DATA_ACTION_NOT_ALLOWED_FOR_AUTONOMOUS_AGENTS'),now())
  on conflict(project_id,action_key) do update set
    enabled=excluded.enabled,
    execution_mode=excluded.execution_mode,
    min_confidence=excluded.min_confidence,
    max_auto_risk_level=excluded.max_auto_risk_level,
    reversible=excluded.reversible,
    rollback_strategy=excluded.rollback_strategy,
    allowed_target_types=excluded.allowed_target_types,
    metadata=excluded.metadata,
    updated_at=excluded.updated_at;
  get diagnostics v_count = row_count;
  return jsonb_build_object('project_id',p_project_id,'policies_seeded',v_count);
end;
$function$;

select governance.seed_all_default_autonomy_policies();
