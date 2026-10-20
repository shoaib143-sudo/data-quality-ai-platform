-- Keep the legacy aggregate benchmark RPC closed until canonical output,
-- evaluator, and accounting evidence can be loaded and attested server-side.
-- Preserve the existing signature and grants so callers fail explicitly.
create or replace function agent.record_learning_candidate_benchmark(
  p_project_id uuid,
  p_candidate_id uuid,
  p_benchmark_key text,
  p_evaluator_id text,
  p_evaluator_type text,
  p_observed_at timestamptz,
  p_case_count integer,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_authority_violations integer,
  p_adversarial_failures integer,
  p_evidence_refs text[],
  p_rollback_ref text,
  p_minimum_case_count integer default 20,
  p_minimum_candidate_score numeric default 0.8,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'legacy aggregate benchmark writes are disabled until server-owned evidence attestation is available';
end;
$$;

comment on function agent.record_learning_candidate_benchmark(
  uuid,uuid,text,text,text,timestamptz,integer,numeric,numeric,integer,integer,text[],text,integer,numeric,uuid
) is
  'Fail-closed legacy RPC. Replace only with a server-derived output, evaluator, and accounting attestation path.';
