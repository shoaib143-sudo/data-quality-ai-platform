-- Durable dispatch markers are never leased or reclaimed: an unresolved external
-- side effect is ambiguous, not permission to repeat it. Live evidence only.
create table agent.learning_experiment_dispatch_claims (
 id uuid primary key default gen_random_uuid(), project_id uuid not null,
 policy_id uuid not null, candidate_id uuid not null, run_id uuid not null,
 dataset_manifest_id uuid not null, case_key text not null, arm text not null check(arm in ('baseline','candidate')),
 dataset_version_id text not null, artifact_hash text not null check(artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
 execution_manifest_hash text not null check(execution_manifest_hash ~ '^sha256:[a-f0-9]{64}$'),
 input_hash text not null check(input_hash ~ '^sha256:[a-f0-9]{64}$'), attempt integer not null check(attempt=1),
 created_at timestamptz not null default clock_timestamp(),
 unique(project_id,policy_id,run_id,case_key,arm),
 foreign key(policy_id,project_id) references agent.learning_evaluation_policies(id,project_id) on delete restrict,
 foreign key(candidate_id,project_id) references agent.learning_candidates(id,project_id) on delete restrict,
 foreign key(project_id,dataset_manifest_id,case_key) references agent.learning_benchmark_dataset_cases(project_id,dataset_id,case_key) on delete restrict
);
create index learning_dispatch_run_idx on agent.learning_experiment_dispatch_claims(run_id);
create index learning_dispatch_candidate_idx on agent.learning_experiment_dispatch_claims(candidate_id,project_id);
create index learning_dispatch_policy_idx on agent.learning_experiment_dispatch_claims(policy_id,project_id);
create index learning_dispatch_case_idx on agent.learning_experiment_dispatch_claims(project_id,dataset_manifest_id,case_key);
create table agent.learning_experiment_dispatch_outcomes (
 claim_id uuid primary key references agent.learning_experiment_dispatch_claims(id) on delete restrict,
 status text not null check(status in ('completed','failed','cancelled')),
 outcome jsonb, failure_reason text,
 reservation_id uuid unique references agent.learning_experiment_budget_reservations(id) on delete restrict,
 cost_event_id uuid unique references governance.ai_model_cost_events(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 check ((status='completed' and outcome is not null and reservation_id is not null and cost_event_id is not null)
   or (status<>'completed' and outcome is null and failure_reason is not null and length(btrim(failure_reason))>0))
);
alter table agent.learning_experiment_dispatch_claims enable row level security;
alter table agent.learning_experiment_dispatch_outcomes enable row level security;
revoke all on agent.learning_experiment_dispatch_claims,agent.learning_experiment_dispatch_outcomes from public,anon,authenticated,service_role;
grant select,insert on agent.learning_experiment_dispatch_claims,agent.learning_experiment_dispatch_outcomes to service_role;
create trigger learning_dispatch_claims_immutable before update or delete on agent.learning_experiment_dispatch_claims for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger learning_dispatch_outcomes_immutable before update or delete on agent.learning_experiment_dispatch_outcomes for each row execute function agent.reject_learning_candidate_evidence_mutation();

create function agent.claim_learning_experiment_dispatch(p_identity jsonb,p_input_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,agent as $$
declare p agent.learning_evaluation_policies%rowtype; c agent.learning_experiment_dispatch_claims%rowtype; o agent.learning_experiment_dispatch_outcomes%rowtype; acquired uuid;
begin
 select * into p from agent.learning_evaluation_policies where id=(p_identity->>'policyId')::uuid and project_id=(p_identity->>'projectId')::uuid;
 if not found or p.candidate_id is distinct from (p_identity->>'candidateId')::uuid then raise exception 'POLICY_BINDING_MISMATCH'; end if;
 if p_identity->>'artifactHash' is null or p_identity->>'datasetVersionId' is null or not (p_identity->>'datasetVersionId'=any(p.dataset_version_ids))
   or (p_identity->>'attempt')::integer is distinct from 1 then raise exception 'INVALID_DISPATCH_IDENTITY'; end if;
 if not exists(select 1 from agent.learning_benchmark_dataset_cases where project_id=p.project_id and dataset_id=p.dataset_manifest_id and case_key=p_identity->>'caseKey' and split='HELD_OUT') then raise exception 'CASE_NOT_HELD_OUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended((p_identity->>'runId'),1));
 if exists(select 1 from agent.learning_experiment_dispatch_claims previous where previous.run_id=(p_identity->>'runId')::uuid
  and (previous.project_id<>p.project_id or previous.policy_id<>p.id or previous.execution_manifest_hash is distinct from p_identity->>'executionManifestHash'
   or (previous.arm=p_identity->>'arm' and previous.artifact_hash<>p_identity->>'artifactHash')
   or (previous.case_key=p_identity->>'caseKey' and (previous.input_hash<>p_input_hash or previous.dataset_version_id<>p_identity->>'datasetVersionId')))) then raise exception 'RUN_BINDING_MISMATCH'; end if;
 insert into agent.learning_experiment_dispatch_claims(project_id,policy_id,candidate_id,run_id,dataset_manifest_id,case_key,arm,dataset_version_id,artifact_hash,execution_manifest_hash,input_hash,attempt)
 values(p.project_id,p.id,p.candidate_id,(p_identity->>'runId')::uuid,p.dataset_manifest_id,p_identity->>'caseKey',p_identity->>'arm',p_identity->>'datasetVersionId',p_identity->>'artifactHash',p_identity->>'executionManifestHash',p_input_hash,1)
 on conflict(project_id,policy_id,run_id,case_key,arm) do nothing returning id into acquired;
 if acquired is not null then return jsonb_build_object('status','acquired','claimId',acquired); end if;
 select * into c from agent.learning_experiment_dispatch_claims where project_id=p.project_id and policy_id=p.id and run_id=(p_identity->>'runId')::uuid and case_key=p_identity->>'caseKey' and arm=p_identity->>'arm';
 if c.artifact_hash is distinct from p_identity->>'artifactHash' or c.input_hash is distinct from p_input_hash or c.dataset_version_id is distinct from p_identity->>'datasetVersionId' then raise exception 'DISPATCH_IDENTITY_MISMATCH'; end if;
 select * into o from agent.learning_experiment_dispatch_outcomes where claim_id=c.id;
 if not found then return jsonb_build_object('status','ambiguous'); end if;
 return jsonb_build_object('status',o.status,'outcome',o.outcome);
end $$;

create function agent.complete_learning_experiment_dispatch(p_claim_id uuid,p_outcome jsonb,p_reservation_id uuid,p_cost_event_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,agent as $$
declare c agent.learning_experiment_dispatch_claims%rowtype; old agent.learning_experiment_dispatch_outcomes%rowtype;
begin
 -- Serialize terminal writes without requiring mutation rights on immutable claims.
 perform pg_advisory_xact_lock(hashtextextended(p_claim_id::text,0));
 select * into c from agent.learning_experiment_dispatch_claims where id=p_claim_id;
 if not found then raise exception 'CLAIM_NOT_FOUND'; end if;
 select * into old from agent.learning_experiment_dispatch_outcomes where claim_id=p_claim_id;
 if found then
   if old.status='completed' and old.outcome=p_outcome and old.reservation_id=p_reservation_id and old.cost_event_id=p_cost_event_id then return true; end if;
   raise exception 'TERMINAL_EVIDENCE_CONFLICT';
 end if;
 if p_outcome is null or jsonb_typeof(p_outcome)<>'object' or p_outcome->>'provenance' is distinct from 'prospective'
 or p_outcome->'identity' is distinct from jsonb_build_object('projectId',c.project_id,'policyId',c.policy_id,'candidateId',c.candidate_id,'runId',c.run_id,'caseKey',c.case_key,'datasetVersionId',c.dataset_version_id,'arm',c.arm,'attempt',c.attempt,'artifactHash',c.artifact_hash,'executionManifestHash',c.execution_manifest_hash)
 or p_outcome->>'latencyMs' is null or p_outcome->>'latencyMs' !~ '^[0-9]+$'
 or p_outcome->>'inputHash' is distinct from c.input_hash
 or p_outcome->>'reservationId' is distinct from p_reservation_id::text or p_outcome->>'costEventId' is distinct from p_cost_event_id::text
 or nullif(btrim(p_outcome->'output'->>'ref'),'') is null or p_outcome->'output'->>'bytes' is null
 or p_outcome->'output'->>'hash' is distinct from 'sha256:'||encode(sha256(convert_to(p_outcome->'output'->>'bytes','UTF8')),'hex')
 then raise exception 'INVALID_OUTCOME'; end if;
 if not exists(select 1 from agent.learning_experiment_budget_reservations r
 join agent.learning_experiment_budget_settlements s on s.reservation_id=r.id and s.project_id=r.project_id
 join governance.ai_model_cost_events e on e.id=s.cost_event_id and e.project_id=r.project_id and e.invocation_id=r.invocation_id
 where r.id=p_reservation_id and e.id=p_cost_event_id and r.project_id=c.project_id and r.policy_id=c.policy_id and r.candidate_id=c.candidate_id and r.run_id=c.run_id and s.status='ACCOUNTED' and e.accounting_status='PRICED'
 and e.currency='USD' and e.execution_correlation_id=c.run_id
 and s.id::text=p_outcome->>'settlementId' and e.invocation_id::text=p_outcome->>'invocationId'
 and e.total_tokens=s.observed_tokens and e.total_cost=s.observed_cost and s.observed_tokens=(p_outcome->>'tokens')::bigint and s.observed_cost=(p_outcome->>'costUsd')::numeric) then raise exception 'ACCOUNTING_BINDING_MISMATCH'; end if;
 insert into agent.learning_experiment_dispatch_outcomes(claim_id,status,outcome,reservation_id,cost_event_id) values(p_claim_id,'completed',p_outcome,p_reservation_id,p_cost_event_id);
 return true;
end $$;
create function agent.fail_learning_experiment_dispatch(p_claim_id uuid,p_reason text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,agent as $$
declare old agent.learning_experiment_dispatch_outcomes%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_claim_id::text,0));
 if nullif(btrim(p_reason),'') is null then raise exception 'FAILURE_REASON_REQUIRED'; end if;
 select * into old from agent.learning_experiment_dispatch_outcomes where claim_id=p_claim_id;
 if found then
  if old.status='failed' and old.failure_reason=p_reason then return true; end if;
  raise exception 'TERMINAL_EVIDENCE_CONFLICT';
 end if;
 insert into agent.learning_experiment_dispatch_outcomes(claim_id,status,failure_reason) values(p_claim_id,'failed',p_reason);
 return true;
end $$;
revoke all on function agent.claim_learning_experiment_dispatch(jsonb,text),agent.complete_learning_experiment_dispatch(uuid,jsonb,uuid,uuid),agent.fail_learning_experiment_dispatch(uuid,text) from public,anon,authenticated;
grant execute on function agent.claim_learning_experiment_dispatch(jsonb,text),agent.complete_learning_experiment_dispatch(uuid,jsonb,uuid,uuid),agent.fail_learning_experiment_dispatch(uuid,text) to service_role;
