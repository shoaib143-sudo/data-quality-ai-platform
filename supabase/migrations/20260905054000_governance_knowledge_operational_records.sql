with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1),
dv as (select id dataset_version_id from catalog.dataset_versions where dataset_id=(select dataset_id from d) order by version_number desc limit 1),
rules(rule_key,column_name,name,description,dimension,severity,metric_key,operator,threshold,certification_required) as (values
('CUST_ID_COMPLETENESS','customer_id','Customer ID completeness','Customer identifier null rate must be zero for the critical identifier.','COMPLETENESS','CRITICAL','null_rate','LTE',0::numeric,true),
('CUST_ID_UNIQUENESS','customer_id','Customer ID uniqueness','Customer identifier distinct rate must remain at least 99%.','UNIQUENESS','CRITICAL','distinct_rate','GTE',0.99,true),
('CUSTOMER_EMAIL_VALIDITY','email','Customer email validity','Present customer email values should match the approved email pattern at least 95% of the time.','VALIDITY','HIGH','pattern_match_rate','GTE',0.95,true),
('CUSTOMER_EMAIL_SENSITIVE_MONITOR','email','Customer email sensitive-data monitor','Sensitive pattern evidence on the customer email field is monitored because the field is governed as personal information.','VALIDITY','HIGH','sensitive_match_rate','GTE',0.50,false))
insert into profiling.quality_rule_definitions(project_id,dataset_id,dataset_version_id,column_name,rule_key,name,description,dimension,severity,metric_key,operator,threshold,enabled,origin,metadata,rule_type,rule_config,certification_required)
select p.project_id,d.dataset_id,dv.dataset_version_id,r.column_name,r.rule_key,r.name,r.description,r.dimension,r.severity,r.metric_key,r.operator,r.threshold,true,'SYSTEM',jsonb_build_object('synthetic_bootstrap',true,'knowledge_source','SYN-STD-CUSTOMER-DQ'),'METRIC_THRESHOLD','{}'::jsonb,r.certification_required
from p join d on true join dv on true cross join rules r
where not exists(select 1 from profiling.quality_rule_definitions q where q.project_id=p.project_id and q.rule_key=r.rule_key);

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1)
insert into governance.data_contracts(project_id,dataset_id,name,status,current_version)
select p.project_id,d.dataset_id,'Customer Master Data Contract','ACTIVE',1 from p join d on true
where not exists(select 1 from governance.data_contracts c where c.project_id=p.project_id and c.dataset_id=d.dataset_id and c.name='Customer Master Data Contract');

with c as (select dc.id contract_id from governance.data_contracts dc join app.projects p on p.id=dc.project_id where p.name='Profiling Demo Project' and dc.name='Customer Master Data Contract' order by dc.created_at limit 1)
insert into governance.data_contract_versions(contract_id,version_number,compatibility_policy,freshness_sla_hours,row_count_min,quality_requirements,critical_columns,metadata,change_reason,status,effective_at)
select c.contract_id,1,'BACKWARD',24,1,'{"customer_id":{"null_rate_max":0,"distinct_rate_min":0.99},"email":{"pattern_match_rate_min":0.95},"quality_score_min":0.90}'::jsonb,array['customer_id','email','full_name','country','signup_date'],jsonb_build_object('synthetic_bootstrap',true,'knowledge_source','SYN-STD-DATA-CONTRACT'),'Initial synthetic knowledge activation contract','ACTIVE',now() from c
where not exists(select 1 from governance.data_contract_versions v where v.contract_id=c.contract_id and v.version_number=1);

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1)
insert into governance.dataset_certifications(project_id,dataset_id,certification_key,certification_status,certification_level,valid_from,valid_until,evidence,decision_summary,metadata)
select p.project_id,d.dataset_id,'SYN-CERT-CUSTOMER-MASTER','PROVISIONAL','CRITICAL',now(),now()+interval '90 days',jsonb_build_object('synthetic_bootstrap',true,'reason','Knowledge activation example; final production certification requires approved mappings and DQ execution.'),'Provisionally certified for synthetic AI-governance validation only.',jsonb_build_object('synthetic_bootstrap',true,'knowledge_source','SYN-STD-CERTIFICATION') from p join d on true
on conflict(project_id,certification_key) do update set certification_status='PROVISIONAL',valid_from=excluded.valid_from,valid_until=excluded.valid_until,evidence=excluded.evidence,decision_summary=excluded.decision_summary,metadata=excluded.metadata,updated_at=now();

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1)
insert into governance.certification_requests(project_id,dataset_id,status,decision_notes,evidence,requested_at,decided_at)
select p.project_id,d.dataset_id,'APPROVED','Synthetic approval establishes only a provisional validation certification; not a production attestation.',jsonb_build_object('synthetic_bootstrap',true,'certification_key','SYN-CERT-CUSTOMER-MASTER'),now()-interval '2 days',now()-interval '1 day' from p join d on true
where not exists(select 1 from governance.certification_requests r where r.project_id=p.project_id and r.dataset_id=d.dataset_id and r.evidence->>'certification_key'='SYN-CERT-CUSTOMER-MASTER');

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1),assigns(scope_type,scope_key,assignment_type,principal_key,principal_name,accountability) as (values
('DOMAIN','Customer','BUSINESS_OWNER','ROLE:CUSTOMER_DATA_OWNER','Customer Data Owner','Accountable for customer-data business purpose, prioritization and risk acceptance.'),
('DATASET',(select dataset_id::text from d),'TECHNICAL_OWNER','ROLE:CUSTOMER_PLATFORM_OWNER','Customer Platform Technical Owner','Accountable for source operation, technical integrity and delivery SLAs.'),
('DATASET',(select dataset_id::text from d),'DATA_STEWARD','ROLE:CUSTOMER_DATA_STEWARD','Customer Data Steward','Responsible for glossary mappings, classifications, DQ follow-up, certification evidence and issue coordination.'),
('CDE','CUSTOMER_EMAIL','BUSINESS_OWNER','ROLE:CUSTOMER_DATA_OWNER','Customer Data Owner','Accountable for approved use and risk of customer email.'),
('CDE','CUSTOMER_EMAIL','DATA_STEWARD','ROLE:CUSTOMER_DATA_STEWARD','Customer Data Steward','Responsible for definition, classification, quality and governance evidence for customer email.'),
('CDE','CUSTOMER_ID','BUSINESS_OWNER','ROLE:CUSTOMER_DATA_OWNER','Customer Data Owner','Accountable for customer identifier use and criticality.'),
('CDE','CUSTOMER_ID','DATA_STEWARD','ROLE:CUSTOMER_DATA_STEWARD','Customer Data Steward','Responsible for customer identifier definition, quality and mappings.'))
insert into governance.accountability_assignments(project_id,scope_type,scope_key,assignment_type,principal_type,principal_key,principal_name,accountability,status,metadata)
select p.project_id,a.scope_type,a.scope_key,a.assignment_type,'ROLE',a.principal_key,a.principal_name,a.accountability,'ACTIVE',jsonb_build_object('synthetic_bootstrap',true,'knowledge_source','SYN-STD-OWNERSHIP') from p cross join assigns a
on conflict(project_id,scope_type,scope_key,assignment_type,principal_key) do update set principal_name=excluded.principal_name,accountability=excluded.accountability,status='ACTIVE',metadata=excluded.metadata,updated_at=now();
