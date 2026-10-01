-- Isolated PostgreSQL fixture. Never execute this on the application database.
\set ON_ERROR_STOP on
create schema agent;
create schema governance;
create table governance.ai_model_pricing_versions(id uuid primary key,project_id uuid not null,provider text,model_id text,currency text,effective_from timestamptz,effective_to timestamptz,reviewed_by uuid,reviewed_at timestamptz,reviewer_capability text,created_by uuid,created_at timestamptz,input_price_per_million_tokens numeric,output_price_per_million_tokens numeric);
create table governance.ai_model_cost_events(id uuid primary key,invocation_id uuid,project_id uuid,execution_correlation_id uuid,provider_id text,model_name text,input_tokens bigint,output_tokens bigint,total_tokens bigint,pricing_version_id uuid,currency text,input_cost numeric,output_cost numeric,total_cost numeric,accounting_status text,observed_at timestamptz);

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema agent,governance to service_role;
grant select,insert on governance.ai_model_cost_events to service_role;
grant select on governance.ai_model_pricing_versions to service_role;
create table agent.learning_candidates(id uuid,project_id uuid,unique(id,project_id));
create table agent.learning_evaluation_policies(
 id uuid primary key,project_id uuid,candidate_id uuid,agent_key text,mode text,
 locked_at timestamptz default clock_timestamp() - interval '1 minute',
 created_at timestamptz default clock_timestamp(),
 total_cost_budget numeric default 1,per_run_cost_budget numeric default .5,
 total_token_budget bigint default 100,per_run_token_budget bigint default 60,
 latency_ms_budget integer default 60000,unique(id,project_id)
);
create function agent.reject_learning_candidate_evidence_mutation() returns trigger language plpgsql as $$ begin raise exception 'immutable evidence'; end $$;
create trigger policy_immutable before update or delete on agent.learning_evaluation_policies for each row execute function agent.reject_learning_candidate_evidence_mutation();
grant select on agent.learning_evaluation_policies to service_role;
\ir ../supabase/migrations/20261001004136_governed_learning_experiment_budget.sql
\ir ../supabase/migrations/20261001073345_learning_experiment_budget_fk_indexes.sql
insert into governance.ai_model_pricing_versions values('90000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture-provider','fixture-model','USD',clock_timestamp()-interval '1 hour',null,'80000000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 minute','policy.approve','80000000-0000-4000-8000-000000000001',clock_timestamp()-interval '1 minute',1,1);
insert into agent.learning_candidates values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into agent.learning_evaluation_policies(id,project_id,candidate_id,agent_key,mode)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','profiling_agent','GUIDED' from generate_series(1,9) n;
-- Keep separate candidates so latest-policy checks do not reject fixture policies.
alter table agent.learning_evaluation_policies disable trigger policy_immutable;
update agent.learning_evaluation_policies set candidate_id=id;
alter table agent.learning_evaluation_policies enable trigger policy_immutable;
insert into agent.learning_candidates select id,project_id from agent.learning_evaluation_policies;
-- Policy9 is reserved for concurrent session runner: 10 reservations x20,
-- capacity100, exactly5 admissions, zero initial spend.
alter table agent.learning_evaluation_policies disable trigger policy_immutable;
update agent.learning_evaluation_policies set per_run_token_budget=100,per_run_cost_budget=1 where id='30000000-0000-4000-8000-000000000009';
alter table agent.learning_evaluation_policies enable trigger policy_immutable;

insert into agent.learning_evaluation_policies(id,project_id,candidate_id,agent_key,mode,created_at)
values('30000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','profiling_agent','GUIDED',clock_timestamp());
insert into agent.learning_evaluation_policies(id,project_id,candidate_id,agent_key,mode,created_at)
select '30000000-0000-4000-8000-000000000011',project_id,candidate_id,agent_key,mode,created_at
from agent.learning_evaluation_policies where id='30000000-0000-4000-8000-000000000005';
insert into governance.ai_model_pricing_versions
select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=2 then '10000000-0000-4000-8000-000000000002'::uuid else project_id end,
 provider,'negative-model-'||n,case when n=3 then 'SGD' else currency end,
 effective_from,case when n=4 then clock_timestamp()-interval '1 second' else null end,
 reviewed_by,reviewed_at,reviewer_capability,created_by,created_at,input_price_per_million_tokens,output_price_per_million_tokens
from governance.ai_model_pricing_versions cross join generate_series(2,4) n where id='90000000-0000-4000-8000-000000000001';
insert into governance.ai_model_pricing_versions
select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,project_id,provider,
 case when n in (5,6) then 'ambiguous-model' else 'expired-latest-model' end,currency,
 case when n=8 then clock_timestamp()-interval '30 minutes' else effective_from end,
 case when n=8 then clock_timestamp()-interval '1 second' else null end,
 reviewed_by,reviewed_at,reviewer_capability,created_by,created_at,input_price_per_million_tokens,output_price_per_million_tokens
from governance.ai_model_pricing_versions cross join generate_series(5,8) n where id='90000000-0000-4000-8000-000000000001';
set role service_role;
do $$
declare
 p uuid := '10000000-0000-4000-8000-000000000001';
 policy uuid := '30000000-0000-4000-8000-000000000001';
 run uuid := gen_random_uuid(); inv uuid := gen_random_uuid(); a jsonb; b jsonb;
 reservation uuid; event_id uuid; n integer;
begin
 a:=agent.reserve_learning_experiment_budget(p,policy,policy,run,inv,'profiling_agent','GUIDED',40,.4,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert (a->>'admitted')::boolean,'first bounded call admitted'; reservation:=(a->>'reservation_id')::uuid;
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,inv,'profiling_agent','GUIDED',40,.4,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='INVOCATION_ALREADY_RESERVED','duplicate execution denied';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',30,.1,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='RUN_BUDGET_EXCEEDED','pending reservation consumes run capacity';
 event_id:=gen_random_uuid();
 insert into governance.ai_model_cost_events values(event_id,inv,p,run,'fixture-provider','fixture-model',5,5,10,'90000000-0000-4000-8000-000000000001','USD',.05,.05,.1,'PRICED',clock_timestamp());
 b:=agent.reconcile_learning_experiment_budget(p,reservation,10,.1,true,event_id);
 assert b->>'status'='ACCOUNTED','canonical complete accounting refunds unused bounds';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',40,.4,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert (b->>'admitted')::boolean,'refund allows bounded next attempt';
 assert b->>'deadline_at'=a->>'deadline_at','retry never resets run deadline';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',60,.5,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='TOTAL_BUDGET_EXCEEDED','pending plus settled costs consume total capacity';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'support_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='POLICY_BINDING_MISMATCH','agent spoof denied';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'profiling_agent','FULL_AUTONOMOUS',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='POLICY_BINDING_MISMATCH','mode spoof denied';
 b:=agent.reserve_learning_experiment_budget(gen_random_uuid(),policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='POLICY_NOT_FOUND','cross project denied';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',0,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='INVALID_RESERVATION','zero bound cannot create unbounded calls';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',1,'NaN','fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='INVALID_RESERVATION','nonfinite numeric denied';
 policy:='30000000-0000-4000-8000-000000000002';
 a:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',20,.2,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 b:=agent.reconcile_learning_experiment_budget(p,(a->>'reservation_id')::uuid,null,null,false);
 assert b->>'status'='UNKNOWN','missing usage retained';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='ACCOUNTING_UNSAFE','unknown blocks entire policy';
 b:=agent.reconcile_learning_experiment_budget(p,(a->>'reservation_id')::uuid,0,0,true);
 assert b->>'reason'='RECONCILIATION_CONFLICT','unknown cannot be rewritten into refund';
 policy:='30000000-0000-4000-8000-000000000003';
 run:=gen_random_uuid(); inv:=gen_random_uuid();
 a:=agent.reserve_learning_experiment_budget(p,policy,policy,run,inv,'profiling_agent','GUIDED',20,.2,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 event_id:=gen_random_uuid();
 insert into governance.ai_model_cost_events values(event_id,inv,p,run,'fixture-provider','fixture-model',10,11,21,'90000000-0000-4000-8000-000000000001','USD',.1,.1,.2,'PRICED',clock_timestamp());
 b:=agent.reconcile_learning_experiment_budget(p,(a->>'reservation_id')::uuid,21,.2,true,event_id);
 assert b->>'status'='EXCEEDED','underreserved usage stops policy';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='ACCOUNTING_UNSAFE','breach blocks whole policy';
 begin
   update agent.learning_evaluation_policies set total_token_budget=999 where id=policy;
   raise exception 'expected immutable policy refusal';
 exception when raise_exception then assert sqlerrm='immutable evidence'; end;
 assert not has_table_privilege('service_role','agent.learning_experiment_budget_reservations','UPDATE'),'server cannot rewrite reservations';
 assert not has_table_privilege('service_role','agent.learning_experiment_budget_settlements','DELETE'),'server cannot erase settlements';
 assert (select bool_and(not prosecdef) from pg_proc where oid in ('agent.reserve_learning_experiment_budget(uuid,uuid,uuid,uuid,uuid,text,text,bigint,numeric,text,text,uuid)'::regprocedure,'agent.reconcile_learning_experiment_budget(uuid,uuid,bigint,numeric,boolean,uuid)'::regprocedure)),'RPCs remain invoker authority';
 assert not has_table_privilege('authenticated','agent.learning_experiment_budget_reservations','INSERT'),'browser cannot reserve';
 assert not has_function_privilege('authenticated','agent.reserve_learning_experiment_budget(uuid,uuid,uuid,uuid,uuid,text,text,bigint,numeric,text,text,uuid)','EXECUTE'),'browser RPC denied';
 assert not has_function_privilege('anon','agent.reconcile_learning_experiment_budget(uuid,uuid,bigint,numeric,boolean,uuid)','EXECUTE'),'anonymous reconciliation denied';
 assert (select bool_and(relrowsecurity) from pg_class where oid in ('agent.learning_experiment_budget_reservations'::regclass,'agent.learning_experiment_budget_settlements'::regclass)),'RLS enabled';

 policy:='30000000-0000-4000-8000-000000000004';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='POLICY_NOT_CURRENT','stale policy denied';
 policy:='30000000-0000-4000-8000-000000000005';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='POLICY_NOT_CURRENT','tied policy chronology denied';
 b:=agent.reserve_learning_experiment_budget(p,'30000000-0000-4000-8000-000000000011',policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='POLICY_NOT_CURRENT','both tied policies denied';
 policy:='30000000-0000-4000-8000-000000000006'; run:=gen_random_uuid();
 insert into agent.learning_experiment_budget_reservations(project_id,policy_id,candidate_id,run_id,invocation_id,agent_key,mode,reserved_tokens,reserved_cost,deadline_at,provider_id,model_name,pricing_version_id)
 values(p,policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',20,.2,clock_timestamp()-interval '1 second','fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,run,gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='RUN_DEADLINE_EXCEEDED','expired run cannot resume or refund';
 assert (select sum(reserved_tokens)=20 from agent.learning_experiment_budget_reservations where policy_id=policy),'expired uncertain spend remains reserved';
 policy:='30000000-0000-4000-8000-000000000007'; run:=gen_random_uuid(); inv:=gen_random_uuid();
 a:=agent.reserve_learning_experiment_budget(p,policy,policy,run,inv,'profiling_agent','GUIDED',20,.2,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 event_id:=gen_random_uuid();
 insert into governance.ai_model_cost_events values(event_id,gen_random_uuid(),p,run,'fixture-provider','fixture-model',5,5,10,'90000000-0000-4000-8000-000000000001','USD',.05,.05,.1,'PRICED',clock_timestamp());
 b:=agent.reconcile_learning_experiment_budget(p,(a->>'reservation_id')::uuid,10,.1,true,event_id);
 assert b->>'status'='UNKNOWN','wrong invocation canonical evidence cannot refund';
 policy:='30000000-0000-4000-8000-000000000008'; run:=gen_random_uuid(); inv:=gen_random_uuid();
 a:=agent.reserve_learning_experiment_budget(p,policy,policy,run,inv,'profiling_agent','GUIDED',20,.2,'fixture-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 event_id:=gen_random_uuid();
 insert into governance.ai_model_cost_events values(event_id,inv,p,run,'fixture-provider','fixture-model',5,5,9,'90000000-0000-4000-8000-000000000001','USD',.05,.05,.1,'PRICED',clock_timestamp());
 b:=agent.reconcile_learning_experiment_budget(p,(a->>'reservation_id')::uuid,9,.1,true,event_id);
 assert b->>'status'='UNKNOWN','inconsistent canonical token total cannot refund';
 policy:='30000000-0000-4000-8000-000000000009';
 for n in 2..4 loop
   b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','negative-model-'||n,('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid);
   assert b->>'reason'='PRICING_UNSAFE','wrong project/currency/expired quote denied';
 end loop;
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'wrong-provider','fixture-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='PRICING_UNSAFE','wrong provider quote denied';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','wrong-model','90000000-0000-4000-8000-000000000001');
 assert b->>'reason'='PRICING_UNSAFE','wrong model quote denied';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','ambiguous-model','90000000-0000-4000-8000-000000000005');
 assert b->>'reason'='PRICING_UNSAFE','overlapping price authority denied';
 b:=agent.reserve_learning_experiment_budget(p,policy,policy,gen_random_uuid(),gen_random_uuid(),'profiling_agent','GUIDED',1,0,'fixture-provider','expired-latest-model','90000000-0000-4000-8000-000000000007');
 assert b->>'reason'='PRICING_UNSAFE','expired newest price cannot fall back to older price';
 assert not exists(select 1 from agent.learning_experiment_budget_reservations where policy_id=policy),'pricing rejections leave concurrent fixture capacity intact';
 raise notice 'Learning experiment budget SQL behavior assertions passed';
end $$;
reset role;
