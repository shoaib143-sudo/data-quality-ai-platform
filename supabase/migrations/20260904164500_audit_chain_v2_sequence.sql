create sequence if not exists governance.audit_event_chain_sequence;

alter table governance.audit_events
  add column if not exists chain_version smallint,
  add column if not exists chain_sequence bigint;

update governance.audit_events
set chain_version = 1
where chain_version is null;

alter table governance.audit_events
  alter column chain_version set default 2,
  alter column chain_version set not null,
  alter column chain_sequence set default nextval('governance.audit_event_chain_sequence');

create index if not exists audit_events_project_chain_sequence_idx
  on governance.audit_events(project_id, chain_version, chain_sequence desc)
  where chain_version >= 2;

create or replace function governance.prepare_audit_event_hash()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance'
as $function$
declare
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.project_id::text,'GLOBAL'),0));

  if new.chain_version is null then
    new.chain_version := 2;
  end if;
  if new.chain_sequence is null then
    new.chain_sequence := nextval('governance.audit_event_chain_sequence');
  end if;

  if new.chain_version >= 2 then
    select event_hash into v_prev
    from governance.audit_events
    where project_id is not distinct from new.project_id
      and chain_version = new.chain_version
      and event_hash is not null
    order by chain_sequence desc
    limit 1;
  else
    select event_hash into v_prev
    from governance.audit_events
    where project_id is not distinct from new.project_id
      and chain_version = new.chain_version
      and event_hash is not null
    order by created_at desc,id desc
    limit 1;
  end if;

  new.previous_hash := v_prev;
  new.event_hash := governance.compute_audit_event_hash(
    v_prev,new.id,new.project_id,new.actor_user_id,new.actor_type,new.event_type,
    new.entity_type,new.entity_id,new.correlation_id,new.metadata,new.created_at
  );
  return new;
end;
$function$;

create or replace function governance.verify_audit_chain(p_project_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance'
as $function$
declare
  r record;
  v_project_marker text := null;
  v_chain_version smallint := null;
  v_prev text := null;
  v_expected text;
  v_checked integer := 0;
  v_failures integer := 0;
  v_legacy_checked integer := 0;
  v_legacy_failures integer := 0;
  v_strict_checked integer := 0;
  v_strict_failures integer := 0;
  v_legacy_forks integer := 0;
begin
  -- Legacy v1 rows were produced before deterministic sequence ordering existed.
  -- Preserve their hashes unchanged and verify each stored hash plus its predecessor reference.
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash
    from governance.audit_events
    where chain_version = 1
      and (p_project_id is null or project_id=p_project_id)
  loop
    v_expected := governance.compute_audit_event_hash(
      r.previous_hash,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_legacy_checked := v_legacy_checked + 1;
    if r.event_hash is distinct from v_expected
       or (r.previous_hash is not null and not exists (
         select 1 from governance.audit_events p
         where p.chain_version = 1
           and p.project_id is not distinct from r.project_id
           and p.event_hash = r.previous_hash
       )) then
      v_failures := v_failures + 1;
      v_legacy_failures := v_legacy_failures + 1;
    end if;
  end loop;

  select count(*) into v_legacy_forks
  from (
    select project_id, previous_hash
    from governance.audit_events
    where chain_version = 1
      and previous_hash is not null
      and (p_project_id is null or project_id=p_project_id)
    group by project_id, previous_hash
    having count(*) > 1
  ) forks;

  -- Version 2+ is a strict, sequence-ordered chain. Any fork or ordering mismatch fails verification.
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,
           correlation_id,metadata,created_at,previous_hash,event_hash,chain_version,chain_sequence
    from governance.audit_events
    where chain_version >= 2
      and (p_project_id is null or project_id=p_project_id)
    order by coalesce(project_id::text,''),chain_version,chain_sequence
  loop
    if v_project_marker is distinct from coalesce(r.project_id::text,'')
       or v_chain_version is distinct from r.chain_version then
      v_project_marker := coalesce(r.project_id::text,'');
      v_chain_version := r.chain_version;
      v_prev := null;
    end if;

    v_expected := governance.compute_audit_event_hash(
      v_prev,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,
      r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at
    );
    v_checked := v_checked + 1;
    v_strict_checked := v_strict_checked + 1;
    if r.chain_sequence is null
       or r.previous_hash is distinct from v_prev
       or r.event_hash is distinct from v_expected then
      v_failures := v_failures + 1;
      v_strict_failures := v_strict_failures + 1;
    end if;
    v_prev := r.event_hash;
  end loop;

  return jsonb_build_object(
    'valid',v_failures=0,
    'events_checked',v_checked,
    'failures',v_failures,
    'legacy_events_checked',v_legacy_checked,
    'legacy_failures',v_legacy_failures,
    'legacy_forks_observed',v_legacy_forks,
    'strict_events_checked',v_strict_checked,
    'strict_failures',v_strict_failures,
    'chain_version',2,
    'verified_at',now()
  );
end;
$function$;

comment on column governance.audit_events.chain_version is
'Version 1 preserves legacy timestamp/UUID-linked history; version 2+ uses deterministic sequence ordering.';
comment on column governance.audit_events.chain_sequence is
'Monotonic sequence used to serialize and verify audit chain version 2+ independently of timestamp/UUID ordering.';
