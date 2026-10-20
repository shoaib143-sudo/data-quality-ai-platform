-- Persist cancellation and stop evidence for every acquired dispatch claim.
-- An unresolved provider call remains budget-reserved and is never retried.
create or replace function agent.terminalize_learning_experiment_dispatch(
  p_claim_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, agent
as $function$
declare
  v_existing agent.learning_experiment_dispatch_outcomes%rowtype;
begin
  if p_claim_id is null or p_status is null or p_status not in ('failed', 'cancelled')
    or nullif(btrim(p_reason), '') is null then
    raise exception 'INVALID_TERMINAL_DISPATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_claim_id::text, 0));
  if not exists (select 1 from agent.learning_experiment_dispatch_claims where id = p_claim_id) then
    raise exception 'CLAIM_NOT_FOUND';
  end if;

  select * into v_existing
  from agent.learning_experiment_dispatch_outcomes
  where claim_id = p_claim_id;
  if found then
    if v_existing.status = p_status and v_existing.failure_reason = left(btrim(p_reason), 240) then
      return true;
    end if;
    raise exception 'TERMINAL_EVIDENCE_CONFLICT';
  end if;

  insert into agent.learning_experiment_dispatch_outcomes(claim_id, status, failure_reason)
  values (p_claim_id, p_status, left(btrim(p_reason), 240));
  return true;
end;
$function$;

revoke all on function agent.terminalize_learning_experiment_dispatch(uuid, text, text)
  from public, anon, authenticated;
grant execute on function agent.terminalize_learning_experiment_dispatch(uuid, text, text)
  to service_role;

comment on function agent.terminalize_learning_experiment_dispatch(uuid, text, text) is
  'Writes immutable failed/cancelled terminal evidence for an acquired learning dispatch; does not release an unresolved reservation or permit retry.';
