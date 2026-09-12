-- Make lineage authority explicit without changing existing lineage writer authority.
-- Current legacy rows are deterministically classifiable from governed metadata.

alter table governance.lineage_edges
  add column if not exists authority_state text,
  add column if not exists origin text;

update governance.lineage_edges
set authority_state = case
      when metadata ? 'ai_suggestion_id' and coalesce((metadata->>'human_confirmed')::boolean,false) then 'HUMAN_CONFIRMED'
      when coalesce((metadata->>'manual')::boolean,false) then 'HUMAN_CONFIRMED'
      when coalesce((metadata->>'auto_discovered')::boolean,false) then 'SOURCE_OBSERVED'
      else 'LEGACY_UNCLASSIFIED'
    end,
    origin = case
      when metadata ? 'ai_suggestion_id' and coalesce((metadata->>'human_confirmed')::boolean,false) then 'AI_INFERRED'
      when coalesce((metadata->>'manual')::boolean,false) then 'MANUAL'
      when metadata ? 'external_event_id' then 'EXTERNAL_INGEST'
      when coalesce((metadata->>'auto_discovered')::boolean,false) then 'SYSTEM_DISCOVERY'
      else 'LEGACY'
    end
where authority_state is null or origin is null;

alter table governance.lineage_edges
  alter column authority_state set not null,
  alter column origin set not null;

alter table governance.lineage_edges
  drop constraint if exists lineage_edges_authority_state_check,
  add constraint lineage_edges_authority_state_check
    check (authority_state in ('SOURCE_OBSERVED','HUMAN_CONFIRMED','LEGACY_UNCLASSIFIED'));

alter table governance.lineage_edges
  drop constraint if exists lineage_edges_origin_check,
  add constraint lineage_edges_origin_check
    check (origin in ('SYSTEM_DISCOVERY','EXTERNAL_INGEST','MANUAL','AI_INFERRED','LEGACY'));

create or replace function governance.enforce_lineage_edge_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_authority text;
  v_origin text;
begin
  if new.metadata ? 'ai_suggestion_id'
     and coalesce((new.metadata->>'human_confirmed')::boolean,false) then
    v_authority := 'HUMAN_CONFIRMED';
    v_origin := 'AI_INFERRED';
  elsif coalesce((new.metadata->>'manual')::boolean,false) then
    v_authority := 'HUMAN_CONFIRMED';
    v_origin := 'MANUAL';
  elsif coalesce((new.metadata->>'auto_discovered')::boolean,false) then
    v_authority := 'SOURCE_OBSERVED';
    v_origin := case when new.metadata ? 'external_event_id' then 'EXTERNAL_INGEST' else 'SYSTEM_DISCOVERY' end;
  else
    raise exception 'Lineage edge lacks governed authority evidence';
  end if;

  if tg_op = 'UPDATE' then
    if new.authority_state is distinct from old.authority_state
       or new.origin is distinct from old.origin then
      raise exception 'Lineage authority classification is immutable';
    end if;
    if v_authority <> old.authority_state or v_origin <> old.origin then
      raise exception 'Lineage metadata cannot reclassify an existing authority boundary';
    end if;
    return new;
  end if;

  if new.authority_state is not null and new.authority_state <> v_authority then
    raise exception 'Lineage authority_state conflicts with governed writer evidence';
  end if;
  if new.origin is not null and new.origin <> v_origin then
    raise exception 'Lineage origin conflicts with governed writer evidence';
  end if;

  new.authority_state := v_authority;
  new.origin := v_origin;
  return new;
end;
$$;

drop trigger if exists lineage_edge_authority_guard on governance.lineage_edges;
create trigger lineage_edge_authority_guard
before insert or update on governance.lineage_edges
for each row execute function governance.enforce_lineage_edge_authority();

create or replace view governance.authoritative_lineage_edges
with (security_invoker = true)
as
select *
from governance.lineage_edges
where authority_state in ('SOURCE_OBSERVED','HUMAN_CONFIRMED');

comment on view governance.authoritative_lineage_edges is
  'Canonical lineage projection for impact/governance consumers. AI_INFERRED is provenance/origin only after explicit human confirmation; unclassified legacy edges are excluded.';

grant select on governance.authoritative_lineage_edges to authenticated, service_role;

create or replace function governance.verify_lineage_authority_posture(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'valid',
      count(*) filter (where authority_state='LEGACY_UNCLASSIFIED') = 0
      and count(*) filter (where origin='AI_INFERRED' and authority_state<>'HUMAN_CONFIRMED') = 0,
    'state','LINEAGE_AUTHORITY_CLASSES_GOVERNED',
    'project_id',p_project_id,
    'source_observed',count(*) filter (where authority_state='SOURCE_OBSERVED'),
    'human_confirmed',count(*) filter (where authority_state='HUMAN_CONFIRMED'),
    'ai_inferred_origin',count(*) filter (where origin='AI_INFERRED'),
    'legacy_unclassified',count(*) filter (where authority_state='LEGACY_UNCLASSIFIED'),
    'authority_violations',count(*) filter (where origin='AI_INFERRED' and authority_state<>'HUMAN_CONFIRMED'),
    'impact_authority_projection','governance.authoritative_lineage_edges',
    'ai_semantics','AI_INFERRED origin is never authoritative unless separately HUMAN_CONFIRMED'
  )
  from governance.lineage_edges
  where project_id=p_project_id;
$$;

revoke all on function governance.verify_lineage_authority_posture(uuid) from public, anon;
grant execute on function governance.verify_lineage_authority_posture(uuid) to authenticated, service_role;

select pg_notify('pgrst','reload schema');
