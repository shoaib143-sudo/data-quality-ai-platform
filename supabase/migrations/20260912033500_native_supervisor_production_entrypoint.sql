-- Register the native supervisor as a controller identity.
-- It owns no tools. Worker authority remains entirely in pinned child-agent manifests.

insert into agent.agent_definitions (
  agent_key,
  name,
  description,
  version,
  system_prompt,
  configuration,
  enabled
)
values (
  'native_supervisor_agent',
  'Native Supervisor',
  'Native DataNexus controller for bounded, deterministic, policy-validated multi-agent execution.',
  '1.0',
  'Coordinate only validated DataNexus worker plans. Never invent tool authority, project scope, approvals, or execution evidence.',
  jsonb_build_object(
    'execution_mode', 'native_supervisor',
    'controller_only', true,
    'mutation_allowed', false,
    'max_plan_steps', 24
  ),
  true
)
on conflict (agent_key, version) do update set
  name = excluded.name,
  description = excluded.description,
  system_prompt = excluded.system_prompt,
  configuration = excluded.configuration,
  enabled = true;

do $block$
declare
  v_definition_id uuid;
  v_tool_count integer;
begin
  select id into v_definition_id
  from agent.agent_definitions
  where agent_key = 'native_supervisor_agent'
    and version = '1.0'
    and enabled;

  if v_definition_id is null then
    raise exception 'Native supervisor definition is unavailable';
  end if;

  select count(*) into v_tool_count
  from agent.tool_definitions
  where agent_definition_id = v_definition_id
    and enabled;

  if v_tool_count <> 0 then
    raise exception 'Native supervisor must not own executable tools; found % enabled tools', v_tool_count;
  end if;
end;
$block$;
