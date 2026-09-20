-- Read-only grouped analytics over immutable governance audit evidence.
-- Keeps multi-year aggregation in PostgreSQL instead of transferring raw audit rows.

create or replace function governance.query_audit_event_analytics(
  p_project_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_actor_type text default null,
  p_event_prefix text default null,
  p_entity_type text default null,
  p_limit integer default 2000
)
returns table(
  bucket_start timestamptz,
  actor_type text,
  event_type text,
  entity_type text,
  domain text,
  event_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, governance
as $$
  select
    date_trunc('day', a.created_at) as bucket_start,
    a.actor_type,
    a.event_type,
    a.entity_type,
    nullif(
      coalesce(
        nullif(btrim(a.metadata->>'domain'), ''),
        nullif(btrim(a.metadata->>'business_domain'), ''),
        nullif(btrim(a.metadata->>'governance_domain'), '')
      ),
      ''
    ) as domain,
    count(*)::bigint as event_count
  from governance.audit_events a
  where a.project_id = p_project_id
    and (p_from is null or a.created_at >= p_from)
    and (p_to is null or a.created_at <= p_to)
    and (p_actor_type is null or a.actor_type = p_actor_type)
    and (p_event_prefix is null or a.event_type like p_event_prefix || '%')
    and (p_entity_type is null or a.entity_type = p_entity_type)
  group by
    date_trunc('day', a.created_at),
    a.actor_type,
    a.event_type,
    a.entity_type,
    nullif(
      coalesce(
        nullif(btrim(a.metadata->>'domain'), ''),
        nullif(btrim(a.metadata->>'business_domain'), ''),
        nullif(btrim(a.metadata->>'governance_domain'), '')
      ),
      ''
    )
  order by bucket_start desc, event_count desc, event_type asc
  limit greatest(1, least(coalesce(p_limit, 2000), 5000));
$$;

revoke all on function governance.query_audit_event_analytics(
  uuid,timestamptz,timestamptz,text,text,text,integer
) from public, anon, authenticated;

grant execute on function governance.query_audit_event_analytics(
  uuid,timestamptz,timestamptz,text,text,text,integer
) to service_role;

comment on function governance.query_audit_event_analytics(
  uuid,timestamptz,timestamptz,text,text,text,integer
) is
  'Read-only grouped audit analytics over immutable project audit events. Returns daily counts by actor, event, entity and available domain metadata without weakening audit append-only authority.';
