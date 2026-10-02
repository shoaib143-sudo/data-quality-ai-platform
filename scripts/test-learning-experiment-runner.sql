-- Disposable local fixture only. Includes real budget migrations and assertions.
\set ON_ERROR_STOP on
\ir test-learning-experiment-budget.sql
alter table agent.learning_evaluation_policies add column dataset_manifest_id uuid;
alter table agent.learning_evaluation_policies add column dataset_version_ids text[];
create table agent.learning_benchmark_dataset_cases(project_id uuid,dataset_id uuid,case_key text,split text,unique(project_id,dataset_id,case_key));
grant select on agent.learning_benchmark_dataset_cases to service_role;
\ir ../supabase/migrations/20261001152250_learning_experiment_runner_evidence.sql
insert into agent.learning_candidates values('20000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001');
insert into agent.learning_evaluation_policies(id,project_id,candidate_id,agent_key,mode,dataset_manifest_id,dataset_version_ids)
values('30000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000099','profiling_agent','GUIDED','40000000-0000-4000-8000-000000000099',array['version-99']);
insert into agent.learning_benchmark_dataset_cases values
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000099',repeat('a',64),'HELD_OUT'),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000099',repeat('b',64),'TRAINING');
set role service_role;
do $$
declare
 identity jsonb := jsonb_build_object('projectId','10000000-0000-4000-8000-000000000001','policyId','30000000-0000-4000-8000-000000000099','candidateId','20000000-0000-4000-8000-000000000099','runId','50000000-0000-4000-8000-000000000099','caseKey',repeat('a',64),'datasetVersionId','version-99','arm','baseline','attempt',1,'artifactHash','sha256:'||repeat('c',64),'executionManifestHash','sha256:'||repeat('e',64));
 response jsonb; claim uuid; reservation uuid; event_id uuid := gen_random_uuid(); invocation uuid := gen_random_uuid(); settlement uuid; outcome jsonb; denied boolean;
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
 begin perform agent.complete_learning_experiment_dispatch(claim,jsonb_set(outcome,'{latencyMs}','6'),reservation,event_id); exception when others then denied:=sqlerrm='TERMINAL_EVIDENCE_CONFLICT'; end;
 assert denied,'terminal substitution denied';
 response:=agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('arm','candidate','artifactHash','sha256:'||repeat('f',64)),'sha256:'||repeat('d',64));
 assert response->>'status'='acquired','second arm distinct claim';
 assert agent.fail_learning_experiment_dispatch((response->>'claimId')::uuid,'fixture failure'),'terminal failure recorded';
 response:=agent.claim_learning_experiment_dispatch(identity||jsonb_build_object('arm','candidate','artifactHash','sha256:'||repeat('f',64)),'sha256:'||repeat('d',64));
 assert response->>'status'='failed','failed attempt cannot redispatch';
 raise notice 'Learning runner SQL behavior assertions passed';
end $$;
reset role;
do $$ begin
 assert not has_table_privilege('anon','agent.learning_experiment_dispatch_claims','SELECT'),'anon denied';
 assert not has_table_privilege('authenticated','agent.learning_experiment_dispatch_outcomes','INSERT'),'browser insert denied';
 assert not has_function_privilege('authenticated','agent.claim_learning_experiment_dispatch(jsonb,text)','EXECUTE'),'browser RPC denied';
 assert not has_table_privilege('service_role','agent.learning_experiment_dispatch_claims','UPDATE'),'service cannot mutate claims';
 assert not has_table_privilege('service_role','agent.learning_experiment_dispatch_outcomes','DELETE'),'service cannot delete outcomes';
 assert (select count(*)=2 from pg_class where oid in ('agent.learning_experiment_dispatch_claims'::regclass,'agent.learning_experiment_dispatch_outcomes'::regclass) and relrowsecurity),'RLS enabled';
end $$;
