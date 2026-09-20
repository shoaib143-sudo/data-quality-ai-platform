begin;

create or replace function agent.place_evidence_legal_hold_internal(
  p_project_id uuid,
  p_evidence_type text,
  p_evidence_id uuid,
  p_reason text,
  p_placed_by uuid
)
returns table(
  id uuid,
  project_id uuid,
  evidence_type text,
  evidence_id uuid,
  reason text,
  placed_by uuid,
  placed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_project_id uuid;
  v_projects uuid[];
begin
  if p_evidence_type not in ('ARTIFACT', 'MESSAGE', 'AUDIT_RECORD') then
    raise exception 'Unsupported agent evidence type for legal hold.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A legal-hold reason is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_evidence_type || ':' || p_evidence_id::text, 0));

  if p_evidence_type = 'ARTIFACT' then
    select r.project_id
      into v_project_id
    from agent.agent_artifacts a
    join agent.agent_runs r on r.id = a.agent_run_id
    where a.id = p_evidence_id;
  elsif p_evidence_type = 'MESSAGE' then
    select array_agg(distinct r.project_id)
      into v_projects
    from agent.agent_messages m
    left join agent.agent_runs r
      on r.id = m.source_agent_run_id or r.id = m.target_agent_run_id
    where m.id = p_evidence_id;

    if coalesce(cardinality(v_projects), 0) <> 1 then
      raise exception 'Agent message does not resolve to exactly one governed project.';
    end if;
    v_project_id := v_projects[1];
  else
    select a.project_id
      into v_project_id
    from governance.audit_events a
    where a.id = p_evidence_id
      and a.event_hash is not null
      and coalesce(a.chain_version, 0) >= 1;
  end if;

  if v_project_id is null then
    raise exception 'Agent evidence was not found or is not eligible for legal hold.';
  end if;
  if v_project_id <> p_project_id then
    raise exception 'Agent evidence is outside the requested project.';
  end if;

  if exists (
    select 1
    from agent.evidence_legal_holds h
    where h.project_id = p_project_id
      and h.evidence_type = p_evidence_type
      and h.evidence_id = p_evidence_id
      and h.active = true
  ) then
    raise exception 'An active legal hold already exists for this evidence.';
  end if;

  return query
  insert into agent.evidence_legal_holds(
    project_id,
    evidence_type,
    evidence_id,
    reason,
    active,
    placed_by
  )
  values (
    p_project_id,
    p_evidence_type,
    p_evidence_id,
    btrim(p_reason),
    true,
    p_placed_by
  )
  returning
    evidence_legal_holds.id,
    evidence_legal_holds.project_id,
    evidence_legal_holds.evidence_type,
    evidence_legal_holds.evidence_id,
    evidence_legal_holds.reason,
    evidence_legal_holds.placed_by,
    evidence_legal_holds.placed_at;
end;
$$;

create or replace function agent.cleanup_expired_evidence_internal(
  p_limit integer default 50
)
returns table(
  evidence_type text,
  evidence_id uuid,
  disposition text,
  detail text
)
language plpgsql
security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_candidate record;
  v_locked record;
begin
  for v_candidate in
    select a.id
    from agent.agent_artifacts a
    where a.retention_until <= now()
    order by a.retention_until asc, a.id asc
    limit v_limit
  loop
    perform pg_advisory_xact_lock(hashtextextended('ARTIFACT:' || v_candidate.id::text, 0));

    select a.id, a.retention_until, a.storage_uri
      into v_locked
    from agent.agent_artifacts a
    where a.id = v_candidate.id
      and a.retention_until <= now()
    for update;

    if not found then
      continue;
    end if;

    evidence_type := 'ARTIFACT';
    evidence_id := v_candidate.id;
    detail := null;

    if exists (
      select 1
      from agent.evidence_legal_holds h
      where h.evidence_type = 'ARTIFACT'
        and h.evidence_id = v_candidate.id
        and h.active = true
    ) then
      disposition := 'LEGAL_HOLD';
      detail := 'Active legal hold prevents deletion.';
    elsif exists (
      select 1
      from governance.ai_governance_suggestions s
      where s.source_artifact_id = v_candidate.id
    ) then
      disposition := 'GOVERNANCE_REFERENCE';
      detail := 'Governance suggestion retains this artifact as referenced evidence.';
    elsif v_locked.storage_uri is not null then
      disposition := 'STORAGE_BACKED';
      detail := 'Storage-backed artifact requires provider-neutral object lifecycle cleanup before row deletion.';
    else
      delete from agent.agent_artifacts a
      where a.id = v_candidate.id
        and a.retention_until <= now();
      disposition := 'DELETED';
    end if;

    return next;
  end loop;

  for v_candidate in
    select m.id
    from agent.agent_messages m
    where m.retention_until <= now()
    order by m.retention_until asc, m.id asc
    limit v_limit
  loop
    perform pg_advisory_xact_lock(hashtextextended('MESSAGE:' || v_candidate.id::text, 0));

    select m.id, m.retention_until
      into v_locked
    from agent.agent_messages m
    where m.id = v_candidate.id
      and m.retention_until <= now()
    for update;

    if not found then
      continue;
    end if;

    evidence_type := 'MESSAGE';
    evidence_id := v_candidate.id;
    detail := null;

    if exists (
      select 1
      from agent.evidence_legal_holds h
      where h.evidence_type = 'MESSAGE'
        and h.evidence_id = v_candidate.id
        and h.active = true
    ) then
      disposition := 'LEGAL_HOLD';
      detail := 'Active legal hold prevents deletion.';
    else
      delete from agent.agent_messages m
      where m.id = v_candidate.id
        and m.retention_until <= now();
      disposition := 'DELETED';
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function agent.place_evidence_legal_hold_internal(uuid,text,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function agent.place_evidence_legal_hold_internal(uuid,text,uuid,text,uuid)
  to service_role;

revoke all on function agent.cleanup_expired_evidence_internal(integer)
  from public, anon, authenticated;
grant execute on function agent.cleanup_expired_evidence_internal(integer)
  to service_role;

comment on function agent.cleanup_expired_evidence_internal(integer) is
  'Deletes expired inline agent artifacts and messages only after atomic legal-hold recheck. Immutable audit records, governance-referenced artifacts and storage-backed artifacts are preserved.';

commit;
