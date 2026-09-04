-- Synthetic, reversible governance knowledge bootstrap for Profiling Demo Project.
-- Content is original project seed data informed by public guidance; it is not copied guidance and is not legal advice.

with target as (
  select p.id project_id from app.projects p where p.name='Profiling Demo Project' order by p.created_at limit 1
), docs(document_key,document_type,title,summary,content,domain,jurisdiction,source_url,metadata) as (values
('SYN-POL-PERSONAL-DATA','POLICY','Enterprise Personal Data Governance Policy','Synthetic policy for governing personal information across the enterprise.','Purpose: ensure personal information is collected and managed for defined business purposes with accountable ownership. Principles: collect only data needed for an approved purpose; maintain reasonable accuracy; define retention periods; protect sensitive fields with access controls and encryption; record stewardship and ownership; document exceptions and approvals; periodically review whether personal information remains necessary. High-risk personal data must be traceable to affected datasets and critical data elements. AI-generated classifications are recommendations until approved by an authorized steward.','Enterprise','Global','https://www.edpb.europa.eu/topics/key-gdpr-concepts/basic-principles_en','{"synthetic_bootstrap":true,"research_basis":["EDPB GDPR basic principles","NIST Privacy Framework"],"not_legal_advice":true}'::jsonb),
('SYN-STD-CUSTOMER-DQ','STANDARD','Customer Master Data Quality Standard','Synthetic standard defining measurable quality expectations for customer master data.','Customer master data must be measured for completeness, uniqueness, consistency, timeliness, validity and accuracy. Critical identifiers should be complete and unique. Email values should conform to an approved email pattern when present. Country values should use an approved reference domain. Customer activity status must use a controlled boolean representation. Signup dates must not be in the future. Quality thresholds and exceptions must be explicit, versioned and supported by evidence. Material deterioration must generate a finding and be reviewable by the Data Quality Agent and steward.','Customer','Global','https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework','{"synthetic_bootstrap":true,"research_basis":["UK Government Data Quality Framework","ISO 8000 overview"]}'::jsonb),
('SYN-STD-CDE','STANDARD','Critical Data Element Management Standard','Synthetic standard for identifying and governing business-critical data elements.','A Critical Data Element is a data element whose failure or misuse can materially affect customers, regulatory obligations, financial reporting or essential business processes. Each active CDE must have a definition, domain, criticality, owner role, steward role, source mappings, applicable classifications and evidence of quality monitoring. CDE mappings proposed by AI remain suggested until approved. Changes to CDE source fields require impact review using lineage where available.','Enterprise','Global','https://www.nist.gov/cyberframework','{"synthetic_bootstrap":true,"research_basis":["NIST CSF 2.0 governance and asset-management concepts"]}'::jsonb),
('SYN-PROC-RETENTION','PROCEDURE','Data Retention and Lifecycle Procedure','Synthetic procedure for evidence-based retention and disposal decisions.','Retention periods must be justified by business, contractual or regulatory needs and linked to the data being governed. Personal data should not be retained indefinitely without an approved purpose. Retention exceptions require recorded rationale and approval. Expired artifacts should be deleted through governed lifecycle controls, and the deletion outcome should be auditable. The authoritative policy and evidence remain in PostgreSQL; object-store lifecycle actions are execution mechanisms.','Enterprise','Global','https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/','{"synthetic_bootstrap":true,"research_basis":["ICO storage limitation guidance"],"not_legal_advice":true}'::jsonb))
insert into governance.knowledge_documents(project_id,document_key,document_type,title,summary,content,domain,jurisdiction,status,effective_at,source_kind,source_url,content_hash,metadata)
select t.project_id,d.document_key,d.document_type,d.title,d.summary,d.content,d.domain,d.jurisdiction,'ACTIVE',now(),'SYNTHETIC',d.source_url,encode(digest(d.content,'sha256'),'hex'),d.metadata
from target t cross join docs d
on conflict(project_id,document_key) do update set title=excluded.title,summary=excluded.summary,content=excluded.content,domain=excluded.domain,jurisdiction=excluded.jurisdiction,source_url=excluded.source_url,content_hash=excluded.content_hash,metadata=excluded.metadata,updated_at=now();

with target as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
terms(term,definition,domain,synonyms) as (values
('Customer Identifier','Stable identifier used to distinguish one customer record from another.','Customer',array['customer id','customer_id','client identifier']),
('Customer Full Name','Human-readable name associated with a customer record.','Customer',array['full name','customer name','full_name']),
('Customer Email Address','Electronic mail address used to contact a customer.','Customer',array['email','email address','customer_email']),
('Customer Country','Country associated with the customer for business or contact context.','Customer',array['country','customer country']),
('Customer Age','Age value associated with a customer at the relevant observation time.','Customer',array['age','customer age']),
('Customer Active Status','Indicator showing whether the customer record is currently active.','Customer',array['is_active','active status']),
('Customer Signup Date','Date on which the customer relationship or account was initiated.','Customer',array['signup date','signup_date','registration date']),
('Record Creation Timestamp','Timestamp representing when a governed record was created.','Enterprise',array['created_at','creation time']),
('Personally Identifiable Information','Information that can identify, distinguish or contact an individual either alone or in combination with other data.','Privacy',array['PII','personal information','personal data']),
('Critical Data Element','Business-important data element requiring explicit ownership, quality monitoring and impact awareness.','Governance',array['CDE','critical field']),
('Data Owner','Accountable business role for appropriate use and governance of a data asset.','Governance',array['business owner','data accountable']),
('Data Steward','Role responsible for day-to-day governance quality, definitions, classifications and issue follow-up.','Governance',array['steward']),
('Data Quality Score','Normalized measure summarizing observed quality performance for a governed data asset.','Data Quality',array['DQ score','quality score']),
('Completeness','Degree to which expected records or required values are present.','Data Quality',array['complete','missingness']),
('Uniqueness','Degree to which records or identifiers are not duplicated when uniqueness is expected.','Data Quality',array['duplicate rate','deduplication']),
('Consistency','Degree to which representations of the same concept do not conflict across fields or datasets.','Data Quality',array['consistent']),
('Timeliness','Degree to which data is current enough and available within the time required for its intended use.','Data Quality',array['freshness','current data']),
('Validity','Degree to which values conform to expected formats, domains and business rules.','Data Quality',array['valid']),
('Accuracy','Degree to which data correctly represents the real-world value or event it is intended to describe.','Data Quality',array['accurate']),
('Data Classification','Governed label describing the sensitivity or handling category of a data asset or field.','Governance',array['classification','sensitivity label']),
('Data Contract','Versioned agreement describing structural, quality, freshness or operational expectations for data.','Governance',array['contract','data SLA']),
('Certification','Governed decision that a data asset meets defined evidence and control expectations at a point in time.','Governance',array['certified','certification status']),
('Lineage','Record of how data assets and fields depend on or transform from upstream sources.','Governance',array['data lineage','dependency']),
('Retention Period','Approved duration for which governed data or an artifact should be retained.','Governance',array['retention','retention duration']),
('Governance Evidence','Traceable information supporting a governance decision, recommendation, approval or verification outcome.','Governance',array['evidence','audit evidence']),
('Semantic Type','Meaning-oriented type inferred from names, values and context rather than only physical storage type.','Profiling',array['semantic classification','semantic_type']),
('Candidate Key','Field or set of fields that profiling evidence suggests may uniquely identify a record.','Profiling',array['candidate identifier','key candidate']),
('Quality Finding','Evidence-backed observation identifying a quality weakness, anomaly or governance concern.','Data Quality',array['finding','DQ finding']),
('Governance Recommendation','Evidence-grounded suggested action intended to improve quality, compliance, ownership or governance posture.','Governance',array['recommendation','suggested action']),
('Remediation Verification','Post-action assessment that determines whether a governed remediation produced the intended measurable outcome.','Governance',array['verification','post-remediation check']))
insert into governance.glossary_terms(project_id,term,definition,domain,synonyms,status,metadata)
select t.project_id,x.term,x.definition,x.domain,x.synonyms,'APPROVED',jsonb_build_object('synthetic_bootstrap',true,'source','AI_GOVERNANCE_KNOWLEDGE_BOOTSTRAP')
from target t cross join terms x
where not exists(select 1 from governance.glossary_terms g where g.project_id=t.project_id and lower(g.term)=lower(x.term));

with target as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
pii as (select id from governance.classification_labels where code='PII' and enabled=true order by project_id nulls first limit 1),
cdes(cde_key,name,definition,domain,criticality,regulatory_relevance,owner_role,steward_role,is_pii) as (values
('CUSTOMER_ID','Customer Identifier','Stable identifier used to link customer records and downstream customer processes.','Customer','CRITICAL',array['privacy','customer operations'],'Customer Data Owner','Customer Data Steward',true),
('CUSTOMER_FULL_NAME','Customer Full Name','Customer name used for identification and service interactions.','Customer','HIGH',array['privacy'],'Customer Data Owner','Customer Data Steward',true),
('CUSTOMER_EMAIL','Customer Email Address','Customer email used for approved communications and identity/contact workflows.','Customer','CRITICAL',array['privacy','communications'],'Customer Data Owner','Customer Data Steward',true),
('CUSTOMER_COUNTRY','Customer Country','Country context used for service, segmentation and applicable governance decisions.','Customer','HIGH',array['privacy','jurisdiction'],'Customer Data Owner','Customer Data Steward',true),
('CUSTOMER_AGE','Customer Age','Age attribute used only for approved customer processes requiring age context.','Customer','HIGH',array['privacy'],'Customer Data Owner','Customer Data Steward',true),
('CUSTOMER_ACTIVE_STATUS','Customer Active Status','Indicator determining whether a customer is currently active in operational processes.','Customer','HIGH',array['customer operations'],'Customer Data Owner','Customer Data Steward',false),
('CUSTOMER_SIGNUP_DATE','Customer Signup Date','Date establishing when the customer relationship began for lifecycle and analytical purposes.','Customer','HIGH',array['retention','customer operations'],'Customer Data Owner','Customer Data Steward',false),
('RECORD_CREATED_AT','Record Creation Timestamp','System timestamp providing provenance for creation and lifecycle reasoning.','Enterprise','MEDIUM',array['audit','retention'],'Platform Data Owner','Platform Data Steward',false))
insert into governance.critical_data_elements(project_id,cde_key,name,definition,domain,criticality,regulatory_relevance,classification_label_id,owner_role,steward_role,status,metadata)
select t.project_id,c.cde_key,c.name,c.definition,c.domain,c.criticality,c.regulatory_relevance,case when c.is_pii then pii.id else null end,c.owner_role,c.steward_role,'ACTIVE',jsonb_build_object('synthetic_bootstrap',true,'source','AI_GOVERNANCE_KNOWLEDGE_BOOTSTRAP')
from target t cross join cdes c cross join pii
on conflict(project_id,cde_key) do update set name=excluded.name,definition=excluded.definition,criticality=excluded.criticality,regulatory_relevance=excluded.regulatory_relevance,classification_label_id=excluded.classification_label_id,owner_role=excluded.owner_role,steward_role=excluded.steward_role,metadata=excluded.metadata,updated_at=now();

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1),
map(cde_key,column_name,confidence) as (values ('CUSTOMER_ID','customer_id',0.99::numeric),('CUSTOMER_FULL_NAME','full_name',0.99),('CUSTOMER_EMAIL','email',0.99),('CUSTOMER_COUNTRY','country',0.96),('CUSTOMER_AGE','age',0.96),('CUSTOMER_ACTIVE_STATUS','is_active',0.98),('CUSTOMER_SIGNUP_DATE','signup_date',0.98),('RECORD_CREATED_AT','created_at',0.99))
insert into governance.cde_mappings(project_id,cde_id,dataset_id,column_name,confidence,status,source,evidence)
select p.project_id,c.id,d.dataset_id,m.column_name,m.confidence,'SUGGESTED','KNOWLEDGE_BOOTSTRAP',jsonb_build_object('synthetic_bootstrap',true,'basis','column name + business-domain bootstrap mapping')
from p join d on true join map m on true join governance.critical_data_elements c on c.project_id=p.project_id and c.cde_key=m.cde_key
on conflict(project_id,cde_id,dataset_id,column_name) do update set confidence=excluded.confidence,status='SUGGESTED',source=excluded.source,evidence=excluded.evidence,updated_at=now();

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1),
pairs(term,column_name,confidence) as (values ('Customer Identifier','customer_id',0.99::numeric),('Customer Full Name','full_name',0.99),('Customer Email Address','email',0.99),('Customer Country','country',0.96),('Customer Age','age',0.96),('Customer Active Status','is_active',0.98),('Customer Signup Date','signup_date',0.98),('Record Creation Timestamp','created_at',0.99))
insert into governance.glossary_mappings(term_id,dataset_id,column_name,confidence,approved)
select g.id,d.dataset_id,x.column_name,x.confidence,false
from p join d on true join pairs x on true join governance.glossary_terms g on g.project_id=p.project_id and g.term=x.term
where not exists(select 1 from governance.glossary_mappings gm where gm.term_id=g.id and gm.dataset_id=d.dataset_id and gm.column_name=x.column_name);

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
d as (select id dataset_id from catalog.datasets where project_id=(select project_id from p) and name='Customer 2nd Master' order by created_at limit 1),
pii as (select id label_id from governance.classification_labels where code='PII' and enabled=true order by project_id nulls first limit 1),
cols(column_name,confidence,reason) as (values ('customer_id',0.94::numeric,'Identifier can distinguish a customer record.'),('full_name',0.97,'Full name can directly identify an individual.'),('email',0.99,'Email address can directly contact and identify an individual.'),('country',0.78,'Country may contribute to identification or jurisdiction context when combined with other fields.'),('age',0.82,'Age may contribute to identification when combined with other customer attributes.'))
insert into governance.dataset_classifications(project_id,dataset_id,column_name,label_id,status,confidence,source,evidence)
select p.project_id,d.dataset_id,c.column_name,pii.label_id,'SUGGESTED',c.confidence,'KNOWLEDGE_BOOTSTRAP',jsonb_build_object('synthetic_bootstrap',true,'reason',c.reason,'human_approval_required',true)
from p join d on true join pii on true join cols c on true
where not exists(select 1 from governance.dataset_classifications dc where dc.project_id=p.project_id and dc.dataset_id=d.dataset_id and dc.column_name=c.column_name and dc.label_id=pii.label_id);

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
pii as (select id label_id from governance.classification_labels where code='PII' and enabled=true order by project_id nulls first limit 1)
insert into governance.classification_policies(project_id,label_id,name,description,required_controls,retention_days,encryption_required,masking_required,approval_required,enabled)
select p.project_id,pii.label_id,'Synthetic Personal Data Handling Controls','Bootstrap handling policy for PII-classified customer data. Final classification and policy applicability require steward approval.',jsonb_build_object('least_privilege',true,'audit_access',true,'purpose_documentation',true,'retention_review',true,'steward_approval_for_classification',true),3650,true,true,true,true
from p join pii on true
where not exists(select 1 from governance.classification_policies cp where cp.project_id=p.project_id and cp.name='Synthetic Personal Data Handling Controls');

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
reqs(document_key,requirement_key,title,requirement_text,obligation_type,priority) as (values
('SYN-POL-PERSONAL-DATA','PD-01','Purpose and minimisation','Personal information must be collected and used only for documented approved purposes, and unnecessary personal fields should be challenged.','PRINCIPLE','HIGH'),
('SYN-POL-PERSONAL-DATA','PD-02','Accuracy and quality','Personal information used for material decisions must have appropriate quality controls and issue escalation.','CONTROL','HIGH'),
('SYN-POL-PERSONAL-DATA','PD-03','Retention accountability','Retention must be justified, reviewable and linked to an approved lifecycle decision.','CONTROL','HIGH'),
('SYN-POL-PERSONAL-DATA','PD-04','Protection of sensitive fields','Sensitive personal fields require restricted access and protection appropriate to their risk.','CONTROL','CRITICAL'),
('SYN-STD-CUSTOMER-DQ','DQ-01','Completeness expectation','Required customer identifiers must not be missing beyond an approved exception threshold.','QUALITY_EXPECTATION','CRITICAL'),
('SYN-STD-CUSTOMER-DQ','DQ-02','Uniqueness expectation','Customer identifiers expected to identify one record must be monitored for duplication.','QUALITY_EXPECTATION','CRITICAL'),
('SYN-STD-CUSTOMER-DQ','DQ-03','Validity expectation','Customer email, country, boolean status and date fields must conform to approved domains or formats.','QUALITY_EXPECTATION','HIGH'),
('SYN-STD-CUSTOMER-DQ','DQ-04','Timeliness expectation','Customer data used operationally must meet an explicitly documented freshness expectation.','QUALITY_EXPECTATION','HIGH'),
('SYN-STD-CDE','CDE-01','CDE ownership','Every active CDE must have an accountable owner role and steward role.','CONTROL','HIGH'),
('SYN-STD-CDE','CDE-02','CDE source mapping','Every active CDE must map to one or more authoritative source fields with approval status and evidence.','EVIDENCE','HIGH'),
('SYN-STD-CDE','CDE-03','CDE quality monitoring','Every critical CDE must have measurable quality monitoring appropriate to its business use.','CONTROL','CRITICAL'),
('SYN-PROC-RETENTION','RET-01','Retention review','Governed retention decisions must be periodically reviewed and exceptions must retain rationale and approval evidence.','PROCESS','HIGH'))
insert into governance.knowledge_requirements(project_id,document_id,requirement_key,title,requirement_text,obligation_type,priority,metadata)
select p.project_id,d.id,r.requirement_key,r.title,r.requirement_text,r.obligation_type,r.priority,jsonb_build_object('synthetic_bootstrap',true)
from p join reqs r on true join governance.knowledge_documents d on d.project_id=p.project_id and d.document_key=r.document_key
on conflict(project_id,requirement_key) do update set title=excluded.title,requirement_text=excluded.requirement_text,obligation_type=excluded.obligation_type,priority=excluded.priority,metadata=excluded.metadata,updated_at=now();

with p as (select id project_id from app.projects where name='Profiling Demo Project' order by created_at limit 1),
rels(source_type,source_key,relationship_type,target_type,target_key,confidence) as (values
('KNOWLEDGE_DOCUMENT','SYN-POL-PERSONAL-DATA','GOVERNS','CRITICAL_DATA_ELEMENT','CUSTOMER_ID',0.95::numeric),
('KNOWLEDGE_DOCUMENT','SYN-POL-PERSONAL-DATA','GOVERNS','CRITICAL_DATA_ELEMENT','CUSTOMER_FULL_NAME',0.99),
('KNOWLEDGE_DOCUMENT','SYN-POL-PERSONAL-DATA','GOVERNS','CRITICAL_DATA_ELEMENT','CUSTOMER_EMAIL',0.99),
('KNOWLEDGE_DOCUMENT','SYN-POL-PERSONAL-DATA','GOVERNS','CRITICAL_DATA_ELEMENT','CUSTOMER_COUNTRY',0.82),
('KNOWLEDGE_DOCUMENT','SYN-POL-PERSONAL-DATA','GOVERNS','CRITICAL_DATA_ELEMENT','CUSTOMER_AGE',0.86),
('KNOWLEDGE_DOCUMENT','SYN-STD-CUSTOMER-DQ','SETS_QUALITY_EXPECTATIONS_FOR','CRITICAL_DATA_ELEMENT','CUSTOMER_ID',0.99),
('KNOWLEDGE_DOCUMENT','SYN-STD-CUSTOMER-DQ','SETS_QUALITY_EXPECTATIONS_FOR','CRITICAL_DATA_ELEMENT','CUSTOMER_EMAIL',0.96),
('KNOWLEDGE_DOCUMENT','SYN-STD-CDE','DEFINES_GOVERNANCE_FOR','CRITICAL_DATA_ELEMENT','CUSTOMER_ID',1.0),
('KNOWLEDGE_DOCUMENT','SYN-STD-CDE','DEFINES_GOVERNANCE_FOR','CRITICAL_DATA_ELEMENT','CUSTOMER_EMAIL',1.0),
('KNOWLEDGE_DOCUMENT','SYN-PROC-RETENTION','APPLIES_TO','CRITICAL_DATA_ELEMENT','CUSTOMER_SIGNUP_DATE',0.90),
('KNOWLEDGE_DOCUMENT','SYN-PROC-RETENTION','APPLIES_TO','CRITICAL_DATA_ELEMENT','RECORD_CREATED_AT',0.88))
insert into governance.knowledge_relationships(project_id,source_type,source_key,relationship_type,target_type,target_key,confidence,status,evidence,metadata)
select p.project_id,r.source_type,r.source_key,r.relationship_type,r.target_type,r.target_key,r.confidence,'ACTIVE',jsonb_build_object('synthetic_bootstrap',true),jsonb_build_object('source','AI_GOVERNANCE_KNOWLEDGE_BOOTSTRAP')
from p cross join rels r
on conflict(project_id,source_type,source_key,relationship_type,target_type,target_key) do update set confidence=excluded.confidence,status='ACTIVE',evidence=excluded.evidence,metadata=excluded.metadata,updated_at=now();
