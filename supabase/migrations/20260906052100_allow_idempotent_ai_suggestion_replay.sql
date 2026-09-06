-- Idempotent replay may issue a no-op UPDATE; preserve immutability while allowing byte-identical evidence replay.
create or replace function governance.ai_governance_evidence_immutable()
returns trigger language plpgsql
set search_path='pg_catalog','governance' as $$
begin
  if tg_op='UPDATE' and new is not distinct from old then
    return new;
  end if;
  raise exception 'AI governance suggestion evidence is append-only';
end;
$$;
revoke all on function governance.ai_governance_evidence_immutable() from public,anon,authenticated,service_role;
