-- Durable, idempotent result artifacts for successful agent executions.
-- Result artifacts are derived only from genuine persisted agent-run output.

alter table agent.agent_artifacts
  add constraint agent_artifacts_run_type_version_key
  unique (agent_run_id, artifact_type, artifact_version);

comment on constraint agent_artifacts_run_type_version_key on agent.agent_artifacts is
  'A run can publish at most one canonical artifact for an artifact type/version. Retries must be content-identical.';

create or replace function agent.persist_agent_run_result(
  p_agent_run_id uuid,
  p_output jsonb,
  p_artifact_type text default 'AGENT_RUN_RESULT',
  p_artifact_version text default '1.0',
  p_name text default 'Agent run result',
  p_completed_at timestamptz default now()
)
returns table (
  artifact_id uuid,
  content_hash text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run agent.agent_runs%rowtype;
  v_artifact agent.agent_artifacts%rowtype;
  v_type text := nullif(btrim(p_artifact_type), '');
  v_version text := nullif(btrim(p_artifact_version), '');
  v_name text := nullif(btrim(p_name), '');
  v_hash text;
begin
  if p_agent_run_id is null then
    raise exception 'agent_run_id is required';
  end if;
  if p_output is null then
    raise exception 'agent run result output is required';
  end if;
  if v_type is null or v_version is null then
    raise exception 'artifact type and version are required';
  end if;

  select * into v_run
    from agent.agent_runs
   where id = p_agent_run_id
   for update;

  if not found then
    raise exception 'agent run % was not found', p_agent_run_id;
  end if;
  if v_run.status not in ('RUNNING', 'SUCCEEDED') then
    raise exception 'agent run % cannot publish a result artifact from status %', p_agent_run_id, v_run.status;
  end if;

  v_hash := 'sha256:' || pg_catalog.encode(extensions.digest(p_output::text, 'sha256'), 'hex');

  select * into v_artifact
    from agent.agent_artifacts
   where agent_run_id = p_agent_run_id
     and artifact_type = v_type
     and artifact_version = v_version
   for update;

  if found and v_artifact.content_hash is distinct from v_hash then
    raise exception 'agent run % artifact integrity conflict for % v%', p_agent_run_id, v_type, v_version;
  end if;

  update agent.agent_runs
     set status = 'SUCCEEDED',
         output = p_output,
         error_code = null,
         error_message = null,
         completed_at = coalesce(completed_at, p_completed_at, now())
   where id = p_agent_run_id;

  if v_artifact.id is null then
    insert into agent.agent_artifacts (
      agent_run_id, artifact_type, artifact_version, name, payload, content_hash
    ) values (
      p_agent_run_id, v_type, v_version, v_name, p_output, v_hash
    )
    returning * into v_artifact;
  end if;

  return query select v_artifact.id, v_artifact.content_hash, v_artifact.created_at;
end;
$function$;

comment on function agent.persist_agent_run_result(uuid,jsonb,text,text,text,timestamptz) is
  'Atomically finalizes or enriches a successful agent run and publishes one idempotent, content-addressed result artifact. A retry with different content is rejected.';

revoke all on function agent.persist_agent_run_result(uuid,jsonb,text,text,text,timestamptz) from public;
revoke all on function agent.persist_agent_run_result(uuid,jsonb,text,text,text,timestamptz) from anon;
revoke all on function agent.persist_agent_run_result(uuid,jsonb,text,text,text,timestamptz) from authenticated;
grant execute on function agent.persist_agent_run_result(uuid,jsonb,text,text,text,timestamptz) to service_role;

-- Artifact writes must go through the governed persistence function. Authenticated
-- project members retain RLS-scoped read access through artifact_select.
revoke insert, update, delete, truncate on agent.agent_artifacts from service_role;
revoke select on agent.agent_artifacts from anon;
