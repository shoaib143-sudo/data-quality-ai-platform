alter function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb)
  rename to ingest_lineage_batch_atomic_impl;

revoke execute on function governance.ingest_lineage_batch_atomic_impl(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated, service_role;

create function governance.ingest_lineage_batch_atomic(
  p_project_id uuid,
  p_actor uuid,
  p_source_key text,
  p_source_name text,
  p_source_system text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event jsonb;
  v_event_id text;
  v_payload_hash text;
  v_existing record;
  v_source_key text := btrim(coalesce(p_source_key,''));
  v_source_system text := upper(btrim(coalesce(p_source_system,'')));
  v_result jsonb;
begin
  if jsonb_typeof(coalesce(p_events,'null'::jsonb)) <> 'array' or jsonb_array_length(p_events)=0 then
    raise exception 'events must be a non-empty JSON array';
  end if;

  if exists (
    select 1
    from (
      select btrim(coalesce(value->>'externalEventId','')) as external_event_id,
             count(distinct lower(btrim(coalesce(value->>'payloadHash','')))) as payload_hash_count
      from jsonb_array_elements(p_events)
      group by btrim(coalesce(value->>'externalEventId',''))
    ) d
    where d.external_event_id <> '' and d.payload_hash_count > 1
  ) then
    raise exception 'A lineage batch cannot contain the same externalEventId with different payload hashes';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    if jsonb_typeof(v_event) <> 'object' then raise exception 'Each lineage event must be a JSON object'; end if;
    v_event_id := btrim(coalesce(v_event->>'externalEventId',''));
    v_payload_hash := lower(btrim(coalesce(v_event->>'payloadHash','')));
    if v_event_id='' then raise exception 'Each lineage event requires externalEventId'; end if;
    if v_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'Each lineage event requires a SHA-256 payloadHash'; end if;

    select e.payload_hash, i.source_key, i.integration_type
      into v_existing
    from governance.lineage_ingestion_events e
    left join governance.lineage_integrations i on i.id=e.integration_id
    where e.project_id=p_project_id and e.external_event_id=v_event_id;

    if found then
      if lower(btrim(v_existing.payload_hash)) <> v_payload_hash then
        raise exception 'Lineage replay payload mismatch for externalEventId %', v_event_id;
      end if;
      if btrim(coalesce(v_existing.source_key,'')) <> v_source_key
         or upper(btrim(coalesce(v_existing.integration_type,''))) <> v_source_system then
        raise exception 'Lineage replay source mismatch for externalEventId %', v_event_id;
      end if;
    end if;
  end loop;

  v_result := governance.ingest_lineage_batch_atomic_impl(
    p_project_id,p_actor,p_source_key,p_source_name,p_source_system,p_events
  );
  return v_result;
end;
$function$;

revoke execute on function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function governance.ingest_lineage_batch_atomic(uuid,uuid,text,text,text,jsonb) to service_role;
