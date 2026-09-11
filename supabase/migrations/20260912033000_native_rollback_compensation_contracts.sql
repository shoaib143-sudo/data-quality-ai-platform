-- Native rollback/compensation contracts for governed mutating tools.
-- Current profiling and data-quality mutations persist governed evidence. They are
-- replay-safe but intentionally not reversible, so failed execution escalates after
-- certified retries rather than deleting or rewriting authoritative evidence.

with governed_mutations(agent_key, tool_key) as (
  values
    ('data_quality_agent','sync_quality_rules'),
    ('data_quality_agent','execute_quality_rules'),
    ('data_quality_agent','publish_quality_results'),
    ('profiling_agent','profile_dataset'),
    ('profiling_agent','execute_metrics'),
    ('profiling_agent','investigate_profile'),
    ('profiling_agent','compare_profiles'),
    ('profiling_agent','persist_profile_snapshot'),
    ('profiling_agent','complete_profile_run')
)
update agent.tool_definitions t
set execution_config =
      (t.execution_config - 'compensation_tool_key')
      || pg_catalog.jsonb_build_object(
        'rollback_strategy','ESCALATE_ONLY',
        'reversible',false,
        'compensatable',false
      )
from agent.agent_definitions d, governed_mutations m
where t.agent_definition_id=d.id
  and d.agent_key=m.agent_key
  and t.tool_key=m.tool_key
  and d.enabled
  and t.enabled;

do $block$
declare
  v_expected integer;
  v_invalid integer;
  v_missing integer;
begin
  select count(*) into v_expected
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.enabled
    and t.enabled
    and (
      (d.agent_key='data_quality_agent' and t.tool_key=any(array[
        'sync_quality_rules','execute_quality_rules','publish_quality_results'
      ]::text[]))
      or
      (d.agent_key='profiling_agent' and t.tool_key=any(array[
        'profile_dataset','execute_metrics','investigate_profile','compare_profiles',
        'persist_profile_snapshot','complete_profile_run'
      ]::text[]))
    )
    and t.execution_config->>'rollback_strategy'='ESCALATE_ONLY'
    and not coalesce((t.execution_config->>'read_only')::boolean,false)
    and coalesce((t.execution_config->>'idempotent')::boolean,false)
    and coalesce((t.execution_config->>'replay_certified')::boolean,false)
    and not coalesce((t.execution_config->>'reversible')::boolean,false)
    and not coalesce((t.execution_config->>'compensatable')::boolean,false)
    and nullif(t.execution_config->>'compensation_tool_key','') is null;

  select count(*) into v_invalid
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.enabled and t.enabled
    and not coalesce((t.execution_config->>'read_only')::boolean,false)
    and (
      t.execution_config->>'rollback_strategy' not in ('ESCALATE_ONLY','COMPENSATION_TOOL')
      or t.execution_config->>'rollback_strategy' is null
      or (
        t.execution_config->>'rollback_strategy'='ESCALATE_ONLY'
        and (
          coalesce((t.execution_config->>'reversible')::boolean,false)
          or coalesce((t.execution_config->>'compensatable')::boolean,false)
          or nullif(t.execution_config->>'compensation_tool_key','') is not null
        )
      )
      or (
        t.execution_config->>'rollback_strategy'='COMPENSATION_TOOL'
        and (
          not coalesce((t.execution_config->>'compensatable')::boolean,false)
          or nullif(t.execution_config->>'compensation_tool_key','') is null
        )
      )
    );

  select count(*) into v_missing
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id=t.agent_definition_id
  where d.enabled and t.enabled
    and not coalesce((t.execution_config->>'read_only')::boolean,false)
    and nullif(t.execution_config->>'rollback_strategy','') is null;

  if v_expected <> 9 then
    raise exception 'Expected 9 escalation-only governed mutation contracts, found %',v_expected;
  end if;
  if v_invalid <> 0 then
    raise exception 'Found % enabled mutating tools with contradictory rollback contracts',v_invalid;
  end if;
  if v_missing <> 0 then
    raise exception 'Found % enabled mutating tools without rollback strategy',v_missing;
  end if;
end;
$block$;
