-- Disposable local fixture only. Includes real budget migrations and assertions.
\set ON_ERROR_STOP on
\ir test-learning-experiment-budget.sql
create schema auth;
create table auth.users(id uuid primary key);
create schema app;
alter table agent.learning_evaluation_policies add column dataset_manifest_id uuid;
alter table agent.learning_evaluation_policies add column dataset_version_ids text[];
alter table agent.learning_evaluation_policies add column evaluator_actor_id text;
alter table agent.learning_evaluation_policies add column proposer_actor_id text;
alter table agent.learning_evaluation_policies add column rubric_ref text;
alter table agent.learning_evaluation_policies add column calibration_ref text;
create table agent.learning_benchmark_dataset_cases(project_id uuid,dataset_id uuid,case_key text,split text,unique(project_id,dataset_id,case_key));
grant select on agent.learning_benchmark_dataset_cases to service_role;
create table agent.learning_evaluation_results(
 id uuid primary key default gen_random_uuid(), policy_id uuid not null, project_id uuid not null,
 candidate_id uuid not null, recorded_by text not null, observed_at timestamptz not null
);
\ir ../supabase/migrations/20261020043616_learning_evaluation_trusted_assignments.sql
\ir ../supabase/migrations/20261001152250_learning_experiment_runner_evidence.sql
\ir ../supabase/migrations/20261020070000_terminalize_learning_experiment_dispatch.sql
\ir ../supabase/migrations/20261020110000_persist_learning_experiment_attempt_scores.sql
insert into agent.learning_candidates values('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001');
insert into agent.learning_evaluation_policies(id,project_id,candidate_id,agent_key,mode,dataset_manifest_id,dataset_version_ids,evaluator_actor_id,proposer_actor_id,rubric_ref,calibration_ref)
values('30000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099','profiling_agent','GUIDED','40000000-0000-4000-8000-000000000099',array['version-99'],'80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','fixture-rubric:v1','fixture-calibration:v1');
insert into auth.users(id) values('80000000-0000-4000-8000-000000000002'),('80000000-0000-4000-8000-000000000003');
insert into agent.learning_evaluation_assignments(id,policy_id,project_id,candidate_id,proposer_user_id,evaluator_user_id,assigned_by_user_id,scope_digest,assigned_at) values('81000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099','80000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','sha256:'||repeat('a',64),clock_timestamp()-interval '2 hours');
insert into agent.learning_evaluation_assignment_acknowledgements values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099','80000000-0000-4000-8000-000000000002','sha256:'||repeat('a',64),'80000000-0000-4000-8000-000000000002',clock_timestamp()-interval '1 hour');
insert into agent.learning_benchmark_dataset_cases values
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000099',repeat('a',64),'HELD_OUT'),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000099',repeat('b',64),'TRAINING');
set role service_role;
do $$
declare
 identity jsonb := jsonb_build_object('projectId','10000000-0000-4000-8000-000000000001','policyId','30000000-0000-4000-8000-000000000099','candidateId','20000000-0000-4000-8000-000000000099','runId','50000000-0000-4000-8000-000000000099','caseKey',repeat('a',64),'datasetVersionId','version-99','arm','baseline','attempt',1,'artifactHash','sha256:'||repeat('c',64),'executionManifestHash','sha256:'||repeat('e',64));
 response jsonb; claim uuid; reservation uuid; score_id uuid; event_id uuid := gen_random_uuid(); invocation uuid := gen_random_uuid(); settlement uuid; outcome jsonb; denied boolean;
begin
 response := agent.claim_learning_experiment_dispatch(identity,'sha256:'||repeat('d',64));
 assert response->>'status'='acquired','first durable claim acquired'; claim := (response->>'claimId')::uuid;
 response := agent.claim_learning_experiment_dispatch(identity,'sha256:'||repeat('d',64));
 assert response->>'status'='ambiguous','unresolved dispatch must never redispatch';
 denied:=false;
 begin perform agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('executionManifestHash','sha256:'||repeat('f',64)),'sha256:'||repeat('d',64)); exception when others then denied:=sqlerrm='RUN_BINDING_MISMATCH'; end;
 assert denied,'manifest drift denied';
 denied:=false;
 begin perform agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('caseKey',repeat('b',64)),'sha256:'||repeat('d',64)); exception when others then denied:=sqlerrm='CASE_NOT_HELD_OUT'; end;
 assert denied,'training case denied';
 denied:=false;
 begin perform agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('projectId','10000000-0000-4000-8000-000000000002'),'sha256:'||repeat('d',64)); exception when others then denied:=sqlerrm='POLICY_BINDING_MISMATCH'; end;
 assert denied,'wrong project denied';
 denied:=false;
 begin perform agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('arm','candidate'),'sha256:'||repeat('f',64)); exception when others then denied:=sqlerrm='RUN_BINDING_MISMATCH'; end;
 assert denied,'paired input drift denied';
 response:=agent.reserve_learning_experiment_budget((identity->>'projectId')::uuid,(identity->>'policyId')::uuid,(identity->>'candidateId')::uuid,(identity->>'runId')::uuid,invocation,'profiling_agent','GUIDED',20,.2,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert (response->>'admitted')::boolean,'actual budget guard admitted disposable attempt'; reservation:=(response->>'reservation_id')::uuid;
 insert into governance.ai_model_cost_events values(event_id,invocation,(identity->>'projectId')::uuid,(identity->>'runId')::uuid,'fixture-provider','fixture-model',5,5,10,'90000000-0000-4000-8000-000000000001','USD',.05,.05,.1,'PRICED',clock_timestamp());
 response:=agent.reconcile_learning_experiment_budget((identity->>'projectId')::uuid,reservation,10,.1,true,event_id);
 assert response->>'status'='ACCOUNTED','actual canonical settlement';
 select id into settlement from agent.learning_experiment_budget_settlements where reservation_id=reservation;
 outcome:=jsonb_build_object('identity',identity,'inputHash','sha256:'||repeat('d',64),'output',jsonb_build_object('ref','fixture-output','bytes','{"answer":true}','hash','sha256:'||encode(sha256(convert_to('{"answer":true}','UTF8')),'hex')),'provenance','prospective','invocationId',invocation,'reservationId',reservation,'settlementId',settlement,'costEventId',event_id,'costUsd','0.1','tokens',10,'latencyMs',5);
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{tokens}','11'),reservation,event_id); exception when others then denied:=sqlerrm='ACCOUNTING_BINDING_MISMATCH'; end;
 assert denied,'submitted accounting cannot override canonical row';
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{tokens}','null'),reservation,event_id); exception when others then denied:=sqlerrm='ACCOUNTING_BINDING_MISMATCH'; end;
 assert denied,'NULL tokens cannot bypass canonical accounting';
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{costUsd}','null'),reservation,event_id); exception when others then denied:=sqlerrm='ACCOUNTING_BINDING_MISMATCH'; end;
 assert denied,'NULL cost cannot bypass canonical accounting';
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{invocationId}','null'),reservation,event_id); exception when others then denied:=sqlerrm='ACCOUNTING_BINDING_MISMATCH'; end;
 assert denied,'NULL invocation cannot bypass canonical accounting';
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{latencyMs}','-1'),reservation,event_id); exception when others then denied:=sqlerrm='INVALID_OUTCOME'; end;
 assert denied,'negative latency denied';

 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{provenance}','"synthetic"'),reservation,event_id); exception when others then denied:=sqlerrm='INVALID_OUTCOME'; end;
 assert denied,'synthetic cannot enter live evidence';
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{output,bytes}','"substituted"'),reservation,event_id); exception when others then denied:=sqlerrm='INVALID_OUTCOME'; end;
 assert denied,'output bytes must match digest';
 assert agent.complete_learning_experiment_dispatch(claim,outcome,reservation,event_id),'canonical completion';
 assert agent.complete_learning_experiment_dispatch(claim,outcome,reservation,event_id),'identical completion idempotent';
 response:=agent.claim_learning_experiment_dispatch(identity,'sha256:'||repeat('d',64));
 assert response->>'status'='completed' and response->'outcome'=outcome,'resume reuses immutable canonical outcome';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','sha256:'||repeat('0',64),'sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8}]'::jsonb,.8); exception when others then denied:=sqlerrm='OUTPUT_BINDING_MISMATCH'; end;
 assert denied,'score cannot substitute completed output hash';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8}]'::jsonb,.8); exception when others then denied:=sqlerrm='EVALUATOR_ASSIGNMENT_MISMATCH'; end;
 assert denied,'proposer cannot score as the assigned evaluator';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001',gen_random_uuid(),outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8}]'::jsonb,.8); exception when others then denied:=sqlerrm='EVALUATOR_ACKNOWLEDGEMENT_MISMATCH'; end;
 assert denied,'missing acknowledgement cannot authorize a score';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":1.2}]'::jsonb,1.2); exception when others then denied:=sqlerrm='INVALID_ATTEMPT_SCORE'; end;
 assert denied,'out-of-range criterion and overall score denied';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8},{"key":"accuracy","score":0.9}]'::jsonb,.8); exception when others then denied:=sqlerrm='INVALID_ATTEMPT_SCORE'; end;
 assert denied,'duplicate criterion score denied';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),jsonb_build_array(jsonb_build_object('key',repeat('k',101),'score',0.8)),.8); exception when others then denied:=sqlerrm='INVALID_ATTEMPT_SCORE'; end;
 assert denied,'overlong criterion key denied';
 score_id:=agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8}]'::jsonb,.8);
 assert score_id is not null,'assigned evaluator score is persisted';
 assert agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8}]'::jsonb,.8)=score_id,'identical score retry is idempotent';
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001',outcome #>> '{output,hash}','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.7}]'::jsonb,.7); exception when others then denied:=sqlerrm='ATTEMPT_SCORE_CONFLICT'; end;
 assert denied,'conflicting retry cannot replace immutable score';
 denied:=false;
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{latencyMs}','6'),reservation,event_id); exception when others then denied:=sqlerrm='TERMINAL_EVIDENCE_CONFLICT'; end;
 assert denied,'terminal substitution denied';
 response:=agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('arm','candidate','artifactHash','sha256:'||repeat('f',64)),'sha256:'||repeat('d',64));
 assert response->>'status'='acquired','second arm distinct claim';
 claim := (response->>'claimId')::uuid;
 denied:=false;
 begin perform agent.record_learning_experiment_attempt_score(claim,'80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','sha256:'||repeat('1',64),'sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'[{"key":"accuracy","score":0.8}]'::jsonb,.8); exception when others then denied:=sqlerrm='COMPLETED_DISPATCH_REQUIRED'; end;
 assert denied,'failed claim cannot receive an evaluator score';
 assert agent.terminalize_learning_experiment_dispatch(claim,'failed','fixture failure'),'terminal failure recorded';
 assert agent.terminalize_learning_experiment_dispatch(claim,'failed','fixture failure'),'identical terminalization idempotent';
 denied:=false;
 begin perform agent.terminalize_learning_experiment_dispatch(claim,'cancelled','fixture failure'); exception when others then denied:=sqlerrm='TERMINAL_EVIDENCE_CONFLICT'; end;
 assert denied,'conflicting terminal status denied';
 denied:=false;
 begin perform agent.terminalize_learning_experiment_dispatch(claim,'failed','  '); exception when others then denied:=sqlerrm='INVALID_TERMINAL_DISPATCH'; end;
 assert denied,'empty terminal reason denied';
 denied:=false;
 begin perform agent.terminalize_learning_experiment_dispatch(gen_random_uuid(),'failed','missing claim'); exception when others then denied:=sqlerrm='CLAIM_NOT_FOUND'; end;
 assert denied,'missing claim terminalization denied';
 response:=agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('arm','candidate','artifactHash','sha256:'||repeat('f',64)),'sha256:'||repeat('d',64));
 assert response->>'status'='failed','failed attempt cannot redispatch';
 raise notice 'Learning runner SQL behavior assertions passed';
end $$;
reset role;
do $$ begin
 assert not has_table_privilege('anon','agent.learning_experiment_dispatch_claims','SELECT'),'anon denied';
 assert not has_table_privilege('authenticated','agent.learning_experiment_dispatch_outcomes','INSERT'),'browser insert denied';
 assert not has_function_privilege('authenticated','agent.claim_learning_experiment_dispatch(jsonb,text)','EXECUTE'),'browser RPC denied';
 assert not has_table_privilege('service_role','agent.learning_experiment_dispatch_claims','INSERT'),'service direct claim insert denied';
 assert not has_table_privilege('service_role','agent.learning_experiment_dispatch_outcomes','INSERT'),'service direct outcome insert denied';
 assert not has_table_privilege('service_role','agent.learning_experiment_dispatch_claims','UPDATE'),'service cannot mutate claims';
 assert not has_table_privilege('service_role','agent.learning_experiment_dispatch_outcomes','DELETE'),'service cannot delete outcomes';
 assert not has_table_privilege('service_role','agent.learning_experiment_attempt_scores','INSERT'),'service cannot bypass score validation';
 assert not has_table_privilege('service_role','agent.learning_experiment_attempt_scores','UPDATE'),'service cannot revise evaluator scores';
 assert not has_table_privilege('service_role','agent.learning_experiment_attempt_scores','DELETE'),'service cannot erase evaluator scores';
 assert not has_table_privilege('authenticated','agent.learning_experiment_attempt_scores','SELECT'),'browser cannot read evaluator score evidence';
 assert not has_function_privilege('authenticated','agent.record_learning_experiment_attempt_score(uuid,uuid,uuid,uuid,text,text,text,jsonb,numeric)','EXECUTE'),'browser score RPC denied';
 assert (select count(*)=5 from pg_proc where oid in ('agent.claim_learning_experiment_dispatch(jsonb,text)'::regprocedure,'agent.complete_learning_experiment_dispatch(uuid,jsonb,uuid,uuid)'::regprocedure,'agent.fail_learning_experiment_dispatch(uuid,text)'::regprocedure,'agent.terminalize_learning_experiment_dispatch(uuid,text,text)'::regprocedure,'agent.record_learning_experiment_attempt_score(uuid,uuid,uuid,uuid,text,text,text,jsonb,numeric)'::regprocedure) and prosecdef),'dispatch write RPCs run with definer privileges';
 assert (select count(*)=3 from pg_class where oid in ('agent.learning_experiment_dispatch_claims'::regclass,'agent.learning_experiment_dispatch_outcomes'::regclass,'agent.learning_experiment_attempt_scores'::regclass) and relrowsecurity),'RLS enabled';
end $$;
