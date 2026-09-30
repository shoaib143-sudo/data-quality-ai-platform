-- The independent verifier must evaluate a candidate after its source evidence closes.
create or replace function agent.require_learning_benchmark_after_candidate_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_cutoff timestamptz;
begin
  select evidence_cutoff_at into v_cutoff
  from agent.learning_candidates
  where id = new.candidate_id and project_id = new.project_id;

  if v_cutoff is null or new.observed_at < v_cutoff then
    raise exception 'benchmark observedAt must follow candidate evidenceCutoffAt';
  end if;
  return new;
end;
$$;

revoke all on function agent.require_learning_benchmark_after_candidate_evidence() from public, anon, authenticated;

create trigger require_learning_benchmark_after_candidate_evidence
before insert on agent.learning_candidate_benchmarks
for each row execute function agent.require_learning_benchmark_after_candidate_evidence();
