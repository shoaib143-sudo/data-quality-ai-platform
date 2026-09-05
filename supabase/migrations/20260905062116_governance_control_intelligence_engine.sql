create table governance.control_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  control_key text not null,
  name text not null,
  description text not null,
  control_type text not null default 'AUTOMATED' check (control_type in ('AUTOMATED','MANUAL','HYBRID')),
  evaluation_method text not null default 'EVIDENCE_ASSERTION' check (evaluation_method in ('EVIDENCE_ASSERTION','HUMAN_ATTESTATION')),
  severity text not null default 'MEDIUM' check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  lifecycle_status text not null default 'PROPOSED' check (lifecycle_status in ('PROPOSED','ACTIVE','REJECTED','RETIRED')),
  review_status text not null default 'PENDING' check (review_status in ('PENDING','APPROVED','REJECTED')),
  authority_class text not null default 'UNVERIFIED' check (authority_class in ('UNVERIFIED','BOOTSTRAP','ENTERPRISE')),
  definition jsonb not null default '{}'::jsonb,
  definition_hash text not null,
  proposed_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, control_key)
);

create table governance.requirement_control_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  requirement_id uuid not null references governance.knowledge_requirements(id) on delete cascade,
  control_id uuid not null references governance.control_definitions(id) on delete cascade,
  relation_type text not null default 'IMPLEMENTS' check (relation_type in ('IMPLEMENTS','SUPPORTS','DERIVED_FROM')),
  confidence numeric(5,4) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id, requirement_id, control_id, relation_type)
);

create table governance.control_scope_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  control_id uuid not null references governance.control_definitions(id) on delete cascade,
  scope_type text not null check (scope_type in ('PROJECT','DATASET','CDE','GLOSSARY_TERM','LINEAGE_ASSET','DATA_CONTRACT','QUALITY_RULE','DOMAIN')),
  scope_id uuid,
  scope_key text,
  scope_filter jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_id is not null or nullif(btrim(coalesce(scope_key,'')),'') is not null)
);
create unique index control_scope_binding_identity on governance.control_scope_bindings(project_id, control_id, scope_type, scope_id, scope_key) nulls not distinct;

create table governance.control_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  control_id uuid not null references governance.control_definitions(id) on delete cascade,
  scope_binding_id uuid references governance.control_scope_bindings(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('CDE','GLOSSARY','DATA_DICTIONARY','LINEAGE','QUALITY_RULE_RUN','DATA_CONTRACT','CLASSIFICATION','STEWARDSHIP','ATTESTATION','AUDIT','MANUAL','AGENT')),
  evidence_key text not null,
  subject_type text,
  subject_id uuid,
  source_table text,
  source_record_id uuid,
  status text not null default 'CURRENT' check (status in ('CURRENT','SUPERSEDED')),
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  evidence_hash text not null,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index control_evidence_identity on governance.control_evidence(project_id, control_id, scope_binding_id, evidence_type, evidence_key) nulls not distinct;

create table governance.control_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  control_id uuid not null references governance.control_definitions(id) on delete cascade,
  scope_binding_id uuid references governance.control_scope_bindings(id) on delete cascade,
  result text not null check (result in ('PASS','WARN','FAIL','UNKNOWN')),
  score numeric(6,5) check (score is null or (score >= 0 and score <= 1)),
  rationale text not null,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  evaluated_by_type text not null check (evaluated_by_type in ('SYSTEM','USER','AGENT')),
  evaluated_by uuid,
  evaluation_version text not null default 'v1',
  input_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now()
);
create unique index control_evaluation_input_identity on governance.control_evaluations(project_id, control_id, scope_binding_id, input_hash) nulls not distinct;

create table governance.governance_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  control_id uuid not null references governance.control_definitions(id) on delete cascade,
  evaluation_id uuid references governance.control_evaluations(id) on delete set null,
  finding_key text not null,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','WAIVED')),
  severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null,
  description text not null,
  remediation jsonb not null default '{}'::jsonb,
  owner_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, finding_key)
);

create index idx_control_definitions_project_status on governance.control_definitions(project_id,lifecycle_status,review_status,severity);
create index idx_requirement_control_links_control on governance.requirement_control_links(project_id,control_id);
create index idx_requirement_control_links_requirement on governance.requirement_control_links(project_id,requirement_id);
create index idx_control_scope_bindings_control on governance.control_scope_bindings(project_id,control_id,status);
create index idx_control_evidence_current on governance.control_evidence(project_id,control_id,scope_binding_id,status,evidence_type,observed_at desc);
create index idx_control_evaluations_latest on governance.control_evaluations(project_id,control_id,scope_binding_id,evaluated_at desc);
create index idx_governance_findings_open on governance.governance_findings(project_id,status,severity,last_detected_at desc);

alter table governance.control_definitions enable row level security;
alter table governance.requirement_control_links enable row level security;
alter table governance.control_scope_bindings enable row level security;
alter table governance.control_evidence enable row level security;
alter table governance.control_evaluations enable row level security;
alter table governance.governance_findings enable row level security;

create policy control_definitions_project_read on governance.control_definitions for select to authenticated using (app_private.is_project_member(project_id));
create policy requirement_control_links_project_read on governance.requirement_control_links for select to authenticated using (app_private.is_project_member(project_id));
create policy control_scope_bindings_project_read on governance.control_scope_bindings for select to authenticated using (app_private.is_project_member(project_id));
create policy control_evidence_project_read on governance.control_evidence for select to authenticated using (app_private.is_project_member(project_id));
create policy control_evaluations_project_read on governance.control_evaluations for select to authenticated using (app_private.is_project_member(project_id));
create policy governance_findings_project_read on governance.governance_findings for select to authenticated using (app_private.is_project_member(project_id));

grant select on governance.control_definitions, governance.requirement_control_links, governance.control_scope_bindings, governance.control_evidence, governance.control_evaluations, governance.governance_findings to authenticated;
revoke insert, update, delete on governance.control_definitions, governance.requirement_control_links, governance.control_scope_bindings, governance.control_evidence, governance.control_evaluations, governance.governance_findings from public, anon, authenticated;

create or replace function governance.protect_governance_control_review()
returns trigger language plpgsql set search_path='' as $function$
declare
  v_context boolean := coalesce(pg_catalog.current_setting('governance.control_review_context',true),'')='true';
  v_material_change boolean := false;
begin
  if tg_op='INSERT' then
    if not v_context then
      new.lifecycle_status := 'PROPOSED'; new.review_status := 'PENDING'; new.authority_class := 'UNVERIFIED';
      new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
    end if;
    return new;
  end if;
  if not v_context and (
    new.lifecycle_status is distinct from old.lifecycle_status or new.review_status is distinct from old.review_status or
    new.authority_class is distinct from old.authority_class or new.reviewed_by is distinct from old.reviewed_by or
    new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note
  ) then raise exception 'Governance control review state may only be changed through the governed review lifecycle'; end if;
  v_material_change := new.control_key is distinct from old.control_key or new.name is distinct from old.name or
    new.description is distinct from old.description or new.control_type is distinct from old.control_type or
    new.evaluation_method is distinct from old.evaluation_method or new.severity is distinct from old.severity or
    new.definition is distinct from old.definition or new.definition_hash is distinct from old.definition_hash;
  if not v_context and old.lifecycle_status='ACTIVE' and v_material_change then
    new.lifecycle_status := 'PROPOSED'; new.review_status := 'PENDING'; new.authority_class := 'UNVERIFIED';
    new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  end if;
  return new;
end;
$function$;
revoke execute on function governance.protect_governance_control_review() from public, anon, authenticated;
create trigger trg_protect_governance_control_review before insert or update on governance.control_definitions for each row execute function governance.protect_governance_control_review();

create or replace function governance.propose_governance_control(p_project_id uuid,p_actor uuid,p_requirement_ids jsonb,p_control jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_control governance.control_definitions%rowtype;
  v_control_key text := btrim(coalesce(p_control->>'controlKey',p_control->>'control_key',''));
  v_name text := btrim(coalesce(p_control->>'name',''));
  v_description text := btrim(coalesce(p_control->>'description',''));
  v_control_type text := upper(btrim(coalesce(p_control->>'controlType',p_control->>'control_type','AUTOMATED')));
  v_method text := upper(btrim(coalesce(p_control->>'evaluationMethod',p_control->>'evaluation_method','EVIDENCE_ASSERTION')));
  v_severity text := upper(btrim(coalesce(p_control->>'severity','MEDIUM')));
  v_definition jsonb := coalesce(p_control->'definition','{}'::jsonb);
  v_metadata jsonb := coalesce(p_control->'metadata','{}'::jsonb);
  v_req jsonb; v_req_id uuid; v_count integer := 0; v_definition_hash text; v_assertion jsonb; v_kind text; v_minimum integer;
begin
  if p_actor is null then raise exception 'Governance control proposal requires an accountable actor'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'catalog.update') then raise exception 'Actor is not authorized for catalog.update in this project'; end if;
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if jsonb_typeof(coalesce(p_control,'{}'::jsonb))<>'object' then raise exception 'control must be a JSON object'; end if;
  if jsonb_typeof(coalesce(p_requirement_ids,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_requirement_ids,'[]'::jsonb))=0 then raise exception 'At least one source requirement is required'; end if;
  if v_control_key='' or v_name='' or v_description='' then raise exception 'controlKey, name and description are required'; end if;
  if v_control_type not in ('AUTOMATED','MANUAL','HYBRID') then raise exception 'Unsupported controlType %',v_control_type; end if;
  if v_method not in ('EVIDENCE_ASSERTION','HUMAN_ATTESTATION') then raise exception 'Unsupported evaluationMethod %',v_method; end if;
  if v_severity not in ('LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'Unsupported severity %',v_severity; end if;
  if jsonb_typeof(v_definition)<>'object' or jsonb_typeof(v_metadata)<>'object' then raise exception 'definition and metadata must be JSON objects'; end if;
  if char_length(v_control_key)>200 or char_length(v_name)>500 or char_length(v_description)>4000 then raise exception 'Governance control input exceeds supported field length'; end if;
  if v_method='EVIDENCE_ASSERTION' then
    v_assertion := v_definition->'assertion';
    if jsonb_typeof(v_assertion)<>'object' then raise exception 'EVIDENCE_ASSERTION requires definition.assertion'; end if;
    v_kind := upper(btrim(coalesce(v_assertion->>'kind','')));
    if v_kind<>'EVIDENCE_COUNT' then raise exception 'Initial control engine supports assertion kind EVIDENCE_COUNT only'; end if;
    if jsonb_typeof(coalesce(v_assertion->'evidenceTypes','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_assertion->'evidenceTypes','[]'::jsonb))=0 then raise exception 'EVIDENCE_COUNT requires evidenceTypes'; end if;
    begin v_minimum := (v_assertion->>'minimum')::integer; exception when others then raise exception 'EVIDENCE_COUNT minimum must be an integer'; end;
    if v_minimum < 1 then raise exception 'EVIDENCE_COUNT minimum must be at least 1'; end if;
    if upper(coalesce(v_assertion->>'failureResult','FAIL')) not in ('FAIL','WARN','UNKNOWN') then raise exception 'failureResult must be FAIL, WARN or UNKNOWN'; end if;
  end if;
  for v_req in select value from jsonb_array_elements(p_requirement_ids) loop
    begin v_req_id := trim(both '"' from v_req::text)::uuid; exception when others then raise exception 'Invalid requirement id %',v_req::text; end;
    if not exists(select 1 from governance.knowledge_requirements where id=v_req_id and project_id=p_project_id) then raise exception 'Requirement % was not found in this project',v_req_id; end if;
    v_count := v_count + 1;
  end loop;
  if exists(select 1 from governance.control_definitions where project_id=p_project_id and control_key=v_control_key) then raise exception 'Control key % already exists in this project',v_control_key; end if;
  v_definition_hash := encode(extensions.digest(convert_to(v_definition::text,'UTF8'),'sha256'),'hex');
  insert into governance.control_definitions(project_id,control_key,name,description,control_type,evaluation_method,severity,definition,definition_hash,proposed_by,metadata)
  values(p_project_id,v_control_key,v_name,v_description,v_control_type,v_method,v_severity,v_definition,v_definition_hash,p_actor,(v_metadata-'approved'-'authority_class')||jsonb_build_object('proposal_source','GOVERNANCE_REQUIREMENT','proposed_at',now())) returning * into v_control;
  for v_req in select value from jsonb_array_elements(p_requirement_ids) loop
    v_req_id := trim(both '"' from v_req::text)::uuid;
    insert into governance.requirement_control_links(project_id,requirement_id,control_id,relation_type,confidence,metadata)
    values(p_project_id,v_req_id,v_control.id,'DERIVED_FROM',1.0,jsonb_build_object('linked_by',p_actor,'linked_at',now()));
  end loop;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,'USER','GOVERNANCE_CONTROL_PROPOSED','GOVERNANCE_CONTROL',v_control.id,jsonb_build_object('control_key',v_control.control_key,'requirement_count',v_count,'review_status',v_control.review_status,'lifecycle_status',v_control.lifecycle_status,'human_approval_required',true,'atomic_with_control',true,'database_capability_verified',true));
  return jsonb_build_object('id',v_control.id,'control_key',v_control.control_key,'lifecycle_status',v_control.lifecycle_status,'review_status',v_control.review_status,'authority_class',v_control.authority_class,'requirement_count',v_count,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.review_governance_control(p_project_id uuid,p_control_id uuid,p_reviewer uuid,p_decision text,p_comment text default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_control governance.control_definitions%rowtype; v_decision text := upper(btrim(coalesce(p_decision,''))); v_authority text; v_previous_review text; v_previous_lifecycle text;
begin
  if p_reviewer is null then raise exception 'Governance control review requires an accountable reviewer'; end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'policy.approve') then raise exception 'Reviewer is not authorized for policy.approve in this project'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED'; end if;
  if char_length(coalesce(p_comment,''))>2000 then raise exception 'Review comment must be 2000 characters or fewer'; end if;
  select * into v_control from governance.control_definitions where id=p_control_id and project_id=p_project_id for update;
  if not found then raise exception 'Governance control was not found in this project'; end if;
  v_previous_review := v_control.review_status; v_previous_lifecycle := v_control.lifecycle_status;
  if v_decision='APPROVED' then
    select case
      when exists(select 1 from governance.requirement_control_links l join governance.knowledge_requirements r on r.id=l.requirement_id and r.project_id=l.project_id join governance.knowledge_documents d on d.id=r.document_id and d.project_id=r.project_id where l.project_id=p_project_id and l.control_id=p_control_id and d.source_kind<>'SYNTHETIC' and d.status='ACTIVE' and d.review_status='APPROVED' and not (coalesce(d.metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb)) then 'ENTERPRISE'
      when exists(select 1 from governance.requirement_control_links l join governance.knowledge_requirements r on r.id=l.requirement_id and r.project_id=l.project_id join governance.knowledge_documents d on d.id=r.document_id and d.project_id=r.project_id where l.project_id=p_project_id and l.control_id=p_control_id and d.status='ACTIVE' and d.source_kind='SYNTHETIC') then 'BOOTSTRAP'
      else null end into v_authority;
    if v_authority is null then raise exception 'Control cannot be activated until at least one linked requirement belongs to active eligible governance authority'; end if;
  else v_authority := 'UNVERIFIED'; end if;
  perform pg_catalog.set_config('governance.control_review_context','true',true);
  update governance.control_definitions set review_status=v_decision,lifecycle_status=case when v_decision='APPROVED' then 'ACTIVE' else 'REJECTED' end,authority_class=v_authority,reviewed_by=p_reviewer,reviewed_at=now(),review_note=nullif(btrim(coalesce(p_comment,'')),''),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('control_review',jsonb_build_object('decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'authority_class',v_authority)),updated_at=now() where id=p_control_id and project_id=p_project_id returning * into v_control;
  perform pg_catalog.set_config('governance.control_review_context','false',true);
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_reviewer,'USER','GOVERNANCE_CONTROL_REVIEWED','GOVERNANCE_CONTROL',p_control_id,jsonb_build_object('decision',v_decision,'previous_review_status',v_previous_review,'previous_lifecycle_status',v_previous_lifecycle,'authority_class',v_authority,'human_review',true,'ai_override_prohibited',true,'atomic_with_decision',true,'database_capability_verified',true));
  return jsonb_build_object('id',v_control.id,'control_key',v_control.control_key,'previous_review_status',v_previous_review,'review_status',v_control.review_status,'lifecycle_status',v_control.lifecycle_status,'authority_class',v_control.authority_class,'reviewed_by',v_control.reviewed_by,'reviewed_at',v_control.reviewed_at,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.bind_governance_control_scope(p_project_id uuid,p_control_id uuid,p_actor uuid,p_scope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_scope governance.control_scope_bindings%rowtype; v_type text := upper(btrim(coalesce(p_scope->>'scopeType',p_scope->>'scope_type',''))); v_id uuid; v_key text := nullif(btrim(coalesce(p_scope->>'scopeKey',p_scope->>'scope_key','')),''); v_filter jsonb := coalesce(p_scope->'scopeFilter',p_scope->'scope_filter','{}'::jsonb); v_metadata jsonb := coalesce(p_scope->'metadata','{}'::jsonb); v_exists boolean := false;
begin
  if p_actor is null then raise exception 'Scope binding requires an accountable actor'; end if;
  if not governance.has_project_capability(p_project_id,p_actor,'catalog.update') then raise exception 'Actor is not authorized for catalog.update in this project'; end if;
  if not exists(select 1 from governance.control_definitions where id=p_control_id and project_id=p_project_id) then raise exception 'Governance control was not found in this project'; end if;
  if jsonb_typeof(coalesce(p_scope,'{}'::jsonb))<>'object' or jsonb_typeof(v_filter)<>'object' or jsonb_typeof(v_metadata)<>'object' then raise exception 'scope, scopeFilter and metadata must be JSON objects'; end if;
  if v_type not in ('PROJECT','DATASET','CDE','GLOSSARY_TERM','LINEAGE_ASSET','DATA_CONTRACT','QUALITY_RULE','DOMAIN') then raise exception 'Unsupported scopeType %',v_type; end if;
  if nullif(p_scope->>'scopeId','') is not null or nullif(p_scope->>'scope_id','') is not null then begin v_id := coalesce(nullif(p_scope->>'scopeId',''),nullif(p_scope->>'scope_id',''))::uuid; exception when others then raise exception 'scopeId must be a UUID'; end; end if;
  if v_type='PROJECT' then if v_id is null then v_id := p_project_id; end if; v_exists := v_id=p_project_id;
  elsif v_type='DATASET' then v_exists := v_id is not null and exists(select 1 from governance.dataset_catalog where project_id=p_project_id and dataset_id=v_id);
  elsif v_type='CDE' then v_exists := v_id is not null and exists(select 1 from governance.critical_data_elements where project_id=p_project_id and id=v_id);
  elsif v_type='GLOSSARY_TERM' then v_exists := v_id is not null and exists(select 1 from governance.glossary_terms where project_id=p_project_id and id=v_id);
  elsif v_type='LINEAGE_ASSET' then v_exists := v_id is not null and exists(select 1 from governance.lineage_assets where project_id=p_project_id and id=v_id);
  elsif v_type='DATA_CONTRACT' then v_exists := v_id is not null and exists(select 1 from governance.data_contracts where project_id=p_project_id and id=v_id);
  elsif v_type='QUALITY_RULE' then v_exists := v_id is not null and exists(select 1 from profiling.quality_rule_definitions where project_id=p_project_id and id=v_id);
  elsif v_type='DOMAIN' then v_exists := v_key is not null; end if;
  if not v_exists then raise exception 'Scope target was not found in this project or is invalid for scope type %',v_type; end if;
  insert into governance.control_scope_bindings(project_id,control_id,scope_type,scope_id,scope_key,scope_filter,metadata,updated_at)
  values(p_project_id,p_control_id,v_type,v_id,v_key,v_filter,v_metadata||jsonb_build_object('bound_by',p_actor,'bound_at',now()),now())
  on conflict (project_id,control_id,scope_type,scope_id,scope_key) do update set status='ACTIVE',scope_filter=excluded.scope_filter,metadata=excluded.metadata,updated_at=now() returning * into v_scope;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,'USER','GOVERNANCE_CONTROL_SCOPE_BOUND','GOVERNANCE_CONTROL',p_control_id,jsonb_build_object('scope_binding_id',v_scope.id,'scope_type',v_scope.scope_type,'scope_id',v_scope.scope_id,'scope_key',v_scope.scope_key,'atomic_with_binding',true,'database_capability_verified',true));
  return jsonb_build_object('id',v_scope.id,'control_id',v_scope.control_id,'scope_type',v_scope.scope_type,'scope_id',v_scope.scope_id,'scope_key',v_scope.scope_key,'status',v_scope.status,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.record_governance_control_evidence(p_project_id uuid,p_control_id uuid,p_actor uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_control governance.control_definitions%rowtype; v_evidence governance.control_evidence%rowtype; v_scope_id uuid; v_type text := upper(btrim(coalesce(p_evidence->>'evidenceType',p_evidence->>'evidence_type',''))); v_key text := btrim(coalesce(p_evidence->>'evidenceKey',p_evidence->>'evidence_key','')); v_subject_type text := nullif(upper(btrim(coalesce(p_evidence->>'subjectType',p_evidence->>'subject_type',''))),''); v_subject_id uuid; v_payload jsonb := coalesce(p_evidence->'payload','{}'::jsonb); v_source_table text := nullif(btrim(coalesce(p_evidence->>'sourceTable',p_evidence->>'source_table','')),''); v_source_record_id uuid; v_observed timestamptz := now(); v_expires timestamptz; v_hash text;
begin
  select * into v_control from governance.control_definitions where id=p_control_id and project_id=p_project_id;
  if not found then raise exception 'Governance control was not found in this project'; end if;
  if v_control.lifecycle_status<>'ACTIVE' or v_control.review_status<>'APPROVED' then raise exception 'Evidence may only be recorded for an active approved control'; end if;
  if p_actor is not null and not (governance.has_project_capability(p_project_id,p_actor,'agent.execute') or governance.has_project_capability(p_project_id,p_actor,'catalog.update')) then raise exception 'Actor is not authorized to record governance control evidence'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or jsonb_typeof(v_payload)<>'object' then raise exception 'evidence and payload must be JSON objects'; end if;
  if v_type not in ('CDE','GLOSSARY','DATA_DICTIONARY','LINEAGE','QUALITY_RULE_RUN','DATA_CONTRACT','CLASSIFICATION','STEWARDSHIP','ATTESTATION','AUDIT','MANUAL','AGENT') then raise exception 'Unsupported evidenceType %',v_type; end if;
  if v_key='' then raise exception 'evidenceKey is required'; end if;
  if nullif(p_evidence->>'scopeBindingId','') is not null or nullif(p_evidence->>'scope_binding_id','') is not null then begin v_scope_id := coalesce(nullif(p_evidence->>'scopeBindingId',''),nullif(p_evidence->>'scope_binding_id',''))::uuid; exception when others then raise exception 'scopeBindingId must be a UUID'; end; if not exists(select 1 from governance.control_scope_bindings where id=v_scope_id and project_id=p_project_id and control_id=p_control_id and status='ACTIVE') then raise exception 'Active scope binding was not found for this control'; end if; end if;
  if nullif(p_evidence->>'subjectId','') is not null or nullif(p_evidence->>'subject_id','') is not null then begin v_subject_id := coalesce(nullif(p_evidence->>'subjectId',''),nullif(p_evidence->>'subject_id',''))::uuid; exception when others then raise exception 'subjectId must be a UUID'; end; end if;
  if nullif(p_evidence->>'sourceRecordId','') is not null or nullif(p_evidence->>'source_record_id','') is not null then begin v_source_record_id := coalesce(nullif(p_evidence->>'sourceRecordId',''),nullif(p_evidence->>'source_record_id',''))::uuid; exception when others then raise exception 'sourceRecordId must be a UUID'; end; end if;
  if nullif(p_evidence->>'observedAt','') is not null then v_observed := (p_evidence->>'observedAt')::timestamptz; end if;
  if nullif(p_evidence->>'expiresAt','') is not null then v_expires := (p_evidence->>'expiresAt')::timestamptz; end if;
  v_hash := encode(extensions.digest(convert_to(jsonb_build_object('type',v_type,'key',v_key,'scope',v_scope_id,'subject_type',v_subject_type,'subject_id',v_subject_id,'source_table',v_source_table,'source_record_id',v_source_record_id,'observed_at',v_observed,'expires_at',v_expires,'payload',v_payload)::text,'UTF8'),'sha256'),'hex');
  insert into governance.control_evidence(project_id,control_id,scope_binding_id,evidence_type,evidence_key,subject_type,subject_id,source_table,source_record_id,observed_at,expires_at,payload,evidence_hash,recorded_by,updated_at)
  values(p_project_id,p_control_id,v_scope_id,v_type,v_key,v_subject_type,v_subject_id,v_source_table,v_source_record_id,v_observed,v_expires,v_payload,v_hash,p_actor,now())
  on conflict (project_id,control_id,scope_binding_id,evidence_type,evidence_key) do update set subject_type=excluded.subject_type,subject_id=excluded.subject_id,source_table=excluded.source_table,source_record_id=excluded.source_record_id,status='CURRENT',observed_at=excluded.observed_at,expires_at=excluded.expires_at,payload=excluded.payload,evidence_hash=excluded.evidence_hash,recorded_by=excluded.recorded_by,updated_at=now() returning * into v_evidence;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,case when p_actor is null then 'SYSTEM' else 'USER' end,'GOVERNANCE_CONTROL_EVIDENCE_RECORDED','GOVERNANCE_CONTROL',p_control_id,jsonb_build_object('evidence_id',v_evidence.id,'evidence_type',v_type,'evidence_key',v_key,'scope_binding_id',v_scope_id,'evidence_hash',v_hash,'atomic_with_evidence',true,'database_capability_verified',true));
  return jsonb_build_object('id',v_evidence.id,'control_id',v_evidence.control_id,'scope_binding_id',v_evidence.scope_binding_id,'evidence_type',v_evidence.evidence_type,'evidence_key',v_evidence.evidence_key,'evidence_hash',v_evidence.evidence_hash,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.evaluate_governance_control(p_project_id uuid,p_control_id uuid,p_scope_binding_id uuid default null,p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_control governance.control_definitions%rowtype; v_assertion jsonb; v_kind text; v_types text[]; v_minimum integer; v_failure text; v_count integer; v_hashes text; v_input_hash text; v_result text; v_rationale text; v_eval governance.control_evaluations%rowtype; v_existing governance.control_evaluations%rowtype; v_finding_key text;
begin
  select * into v_control from governance.control_definitions where id=p_control_id and project_id=p_project_id;
  if not found then raise exception 'Governance control was not found in this project'; end if;
  if v_control.lifecycle_status<>'ACTIVE' or v_control.review_status<>'APPROVED' then raise exception 'Only active approved controls may be evaluated'; end if;
  if v_control.evaluation_method<>'EVIDENCE_ASSERTION' then raise exception 'Control evaluation method % is not machine-evaluable by this engine version',v_control.evaluation_method; end if;
  if p_actor is not null and not governance.has_project_capability(p_project_id,p_actor,'agent.execute') then raise exception 'Actor is not authorized for agent.execute in this project'; end if;
  if p_scope_binding_id is not null and not exists(select 1 from governance.control_scope_bindings where id=p_scope_binding_id and project_id=p_project_id and control_id=p_control_id and status='ACTIVE') then raise exception 'Active scope binding was not found for this control'; end if;
  v_assertion := v_control.definition->'assertion'; v_kind := upper(coalesce(v_assertion->>'kind',''));
  if v_kind<>'EVIDENCE_COUNT' then raise exception 'Unsupported assertion kind %',v_kind; end if;
  select array_agg(upper(value)) into v_types from jsonb_array_elements_text(v_assertion->'evidenceTypes');
  v_minimum := (v_assertion->>'minimum')::integer; v_failure := upper(coalesce(v_assertion->>'failureResult','FAIL'));
  select count(*),coalesce(string_agg(evidence_hash,',' order by evidence_hash),'') into v_count,v_hashes from governance.control_evidence where project_id=p_project_id and control_id=p_control_id and scope_binding_id is not distinct from p_scope_binding_id and status='CURRENT' and (expires_at is null or expires_at>now()) and evidence_type=any(v_types);
  v_result := case when v_count>=v_minimum then 'PASS' else v_failure end;
  v_rationale := format('EVIDENCE_COUNT observed %s qualifying evidence item(s); minimum required is %s.',v_count,v_minimum);
  v_input_hash := encode(extensions.digest(convert_to(v_control.definition_hash||':'||coalesce(p_scope_binding_id::text,'PROJECT')||':'||v_hashes,'UTF8'),'sha256'),'hex');
  select * into v_existing from governance.control_evaluations where project_id=p_project_id and control_id=p_control_id and scope_binding_id is not distinct from p_scope_binding_id and input_hash=v_input_hash order by evaluated_at desc limit 1;
  if found then return jsonb_build_object('id',v_existing.id,'control_id',v_existing.control_id,'scope_binding_id',v_existing.scope_binding_id,'result',v_existing.result,'evidence_count',v_existing.evidence_count,'input_hash',v_existing.input_hash,'reused',true,'database_capability_verified',true); end if;
  insert into governance.control_evaluations(project_id,control_id,scope_binding_id,result,score,rationale,evidence_count,evaluated_by_type,evaluated_by,evaluation_version,input_hash,metadata)
  values(p_project_id,p_control_id,p_scope_binding_id,v_result,case when v_count>=v_minimum then 1.0 else greatest(0.0,least(1.0,v_count::numeric/v_minimum::numeric)) end,v_rationale,v_count,case when p_actor is null then 'SYSTEM' else 'AGENT' end,p_actor,'v1',v_input_hash,jsonb_build_object('assertion_kind',v_kind,'evidence_types',v_types,'minimum',v_minimum)) returning * into v_eval;
  v_finding_key := v_control.control_key||':'||coalesce(p_scope_binding_id::text,'PROJECT');
  if v_result in ('FAIL','WARN') then
    insert into governance.governance_findings(project_id,control_id,evaluation_id,finding_key,status,severity,title,description,remediation,metadata,last_detected_at,updated_at)
    values(p_project_id,p_control_id,v_eval.id,v_finding_key,'OPEN',v_control.severity,v_control.name||' '||v_result,v_rationale,jsonb_build_object('recommended_action','Collect or remediate the governance evidence required by the active control.'),jsonb_build_object('control_key',v_control.control_key,'evaluation_result',v_result),now(),now())
    on conflict(project_id,finding_key) do update set control_id=excluded.control_id,evaluation_id=excluded.evaluation_id,status='OPEN',severity=excluded.severity,title=excluded.title,description=excluded.description,remediation=excluded.remediation,metadata=excluded.metadata,last_detected_at=now(),resolved_at=null,updated_at=now();
  elsif v_result='PASS' then update governance.governance_findings set status='RESOLVED',evaluation_id=v_eval.id,resolved_at=now(),updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('resolved_by_evaluation',v_eval.id) where project_id=p_project_id and finding_key=v_finding_key and status in ('OPEN','ACKNOWLEDGED'); end if;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,case when p_actor is null then 'SYSTEM' else 'AGENT' end,'GOVERNANCE_CONTROL_EVALUATED','GOVERNANCE_CONTROL',p_control_id,jsonb_build_object('evaluation_id',v_eval.id,'scope_binding_id',p_scope_binding_id,'result',v_result,'evidence_count',v_count,'input_hash',v_input_hash,'deterministic_evaluation',true,'atomic_with_evaluation',true,'database_capability_verified',true));
  return jsonb_build_object('id',v_eval.id,'control_id',v_eval.control_id,'scope_binding_id',v_eval.scope_binding_id,'result',v_eval.result,'score',v_eval.score,'rationale',v_eval.rationale,'evidence_count',v_eval.evidence_count,'input_hash',v_eval.input_hash,'reused',false,'audit_atomic',true,'database_capability_verified',true);
end;
$function$;

create or replace function governance.invalidate_controls_on_requirement_change()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_link record;
begin
  if tg_op='UPDATE' and new.document_id is not distinct from old.document_id and new.requirement_key is not distinct from old.requirement_key and new.title is not distinct from old.title and new.requirement_text is not distinct from old.requirement_text and new.obligation_type is not distinct from old.obligation_type and new.priority is not distinct from old.priority then return new; end if;
  perform pg_catalog.set_config('governance.control_review_context','true',true);
  for v_link in select l.control_id,l.project_id,c.control_key,c.lifecycle_status,c.review_status from governance.requirement_control_links l join governance.control_definitions c on c.id=l.control_id and c.project_id=l.project_id where l.requirement_id=old.id loop
    if v_link.lifecycle_status='ACTIVE' or v_link.review_status='APPROVED' then
      update governance.control_definitions set lifecycle_status='PROPOSED',review_status='PENDING',authority_class='UNVERIFIED',reviewed_by=null,reviewed_at=null,review_note=null,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('invalidated_by_requirement_change',jsonb_build_object('requirement_id',old.id,'changed_at',now())),updated_at=now() where id=v_link.control_id and project_id=v_link.project_id;
      insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata) values(v_link.project_id,null,'SYSTEM','GOVERNANCE_CONTROL_INVALIDATED','GOVERNANCE_CONTROL',v_link.control_id,jsonb_build_object('control_key',v_link.control_key,'requirement_id',old.id,'reason','SOURCE_REQUIREMENT_CHANGED_OR_REMOVED','human_reapproval_required',true,'database_enforced',true));
    end if;
  end loop;
  perform pg_catalog.set_config('governance.control_review_context','false',true);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke execute on function governance.invalidate_controls_on_requirement_change() from public, anon, authenticated;
create trigger trg_invalidate_controls_on_requirement_change before update or delete on governance.knowledge_requirements for each row execute function governance.invalidate_controls_on_requirement_change();

revoke execute on function governance.propose_governance_control(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function governance.review_governance_control(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function governance.bind_governance_control_scope(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function governance.record_governance_control_evidence(uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke execute on function governance.evaluate_governance_control(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function governance.propose_governance_control(uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function governance.review_governance_control(uuid,uuid,uuid,text,text) to service_role;
grant execute on function governance.bind_governance_control_scope(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function governance.record_governance_control_evidence(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function governance.evaluate_governance_control(uuid,uuid,uuid,uuid) to service_role;
