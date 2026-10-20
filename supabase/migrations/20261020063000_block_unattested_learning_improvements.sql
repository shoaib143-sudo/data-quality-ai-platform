-- Temporary fail-closed boundary while server-derived evaluation attestations
-- are being implemented. Positive learning results must not be written from
-- caller-supplied aggregates or verification flags.
create or replace function agent.reject_unattested_learning_improvement()
returns trigger
language plpgsql
set search_path = pg_catalog, agent
as $function$
begin
  if new.quality = 'IMPROVED' then
    raise exception using
      errcode = '23514',
      message = 'server-derived evidence attestation is required before recording an improved learning evaluation';
  end if;
  return new;
end;
$function$;

drop trigger if exists reject_unattested_learning_improvement
  on agent.learning_evaluation_results;
create trigger reject_unattested_learning_improvement
before insert on agent.learning_evaluation_results
for each row
execute function agent.reject_unattested_learning_improvement();

comment on function agent.reject_unattested_learning_improvement() is
  'Temporary fail-closed guard. Replace with an attestation-bound result write before enabling IMPROVED learning results.';
