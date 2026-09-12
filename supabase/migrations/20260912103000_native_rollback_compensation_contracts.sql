-- Make rollback/compensation posture explicit for every enabled native tool.
-- Current production mutations are replay-certified but intentionally not reversible or
-- compensatable, so they escalate rather than pretending a rollback exists.

do $block$
declare
  v_ambiguous_mutations integer;
begin
  select count(*) into v_ambiguous_mutations
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.enabled
    and t.enabled
    and not coalesce((t.execution_config->>'read_only')::boolean, false)
    and (
      coalesce((t.execution_config->>'reversible')::boolean, false)
      or coalesce((t.execution_config->>'compensatable')::boolean, false)
      or nullif(btrim(t.execution_config->>'compensation_tool_key'), '') is not null
    );

  if v_ambiguous_mutations <> 0 then
    raise exception 'Rollback migration refuses to infer contracts for % mutation tool(s) already claiming reversal/compensation capability', v_ambiguous_mutations;
  end if;
end;
$block$;

update agent.tool_definitions t
set execution_config = t.execution_config || jsonb_build_object(
  'rollback_strategy',
  case
    when coalesce((t.execution_config->>'read_only')::boolean, false) then 'NOT_APPLICABLE'
    else 'ESCALATE_ONLY'
  end
)
from agent.agent_definitions d
where t.agent_definition_id = d.id
  and d.enabled
  and t.enabled;

do $block$
declare
  v_missing integer;
  v_bad_reads integer;
  v_bad_mutations integer;
  v_bad_escalations integer;
  v_invented_compensation integer;
begin
  select count(*) into v_missing
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.enabled and t.enabled
    and nullif(btrim(t.execution_config->>'rollback_strategy'), '') is null;

  select count(*) into v_bad_reads
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.enabled and t.enabled
    and coalesce((t.execution_config->>'read_only')::boolean, false)
    and t.execution_config->>'rollback_strategy' <> 'NOT_APPLICABLE';

  select count(*) into v_bad_mutations
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.enabled and t.enabled
    and not coalesce((t.execution_config->>'read_only')::boolean, false)
    and t.execution_config->>'rollback_strategy' <> 'ESCALATE_ONLY';

  select count(*) into v_bad_escalations
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.enabled and t.enabled
    and t.execution_config->>'rollback_strategy' = 'ESCALATE_ONLY'
    and (
      coalesce((t.execution_config->>'reversible')::boolean, false)
      or coalesce((t.execution_config->>'compensatable')::boolean, false)
      or nullif(btrim(t.execution_config->>'compensation_tool_key'), '') is not null
    );

  select count(*) into v_invented_compensation
  from agent.tool_definitions t
  join agent.agent_definitions d on d.id = t.agent_definition_id
  where d.enabled and t.enabled
    and t.execution_config->>'rollback_strategy' = 'COMPENSATION_TOOL';

  if v_missing <> 0 then
    raise exception 'Expected every enabled tool to have rollback_strategy; missing %', v_missing;
  end if;
  if v_bad_reads <> 0 then
    raise exception 'Read-only rollback contract contradiction count: %', v_bad_reads;
  end if;
  if v_bad_mutations <> 0 then
    raise exception 'Mutation rollback contract contradiction count: %', v_bad_mutations;
  end if;
  if v_bad_escalations <> 0 then
    raise exception 'ESCALATE_ONLY tools may not claim rollback capabilities; found %', v_bad_escalations;
  end if;
  if v_invented_compensation <> 0 then
    raise exception 'This migration must not invent compensation tools; found %', v_invented_compensation;
  end if;
end;
$block$;
