begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_org_id uuid;
  v_project_id uuid;
  v_dataset_id uuid;
  v_version_id uuid;
  v_rule_id uuid;
  v_term_id uuid;
  v_label_id uuid;
  v_classification_id uuid;
  v_issue_id uuid;
  v_assignment_id uuid;
  v_review jsonb;
  v_count integer;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_user_id,'authenticated','authenticated','data-steward-workflow-fixture@example.invalid',now(),now());

  insert into app.organizations(name,slug,metadata)
  values('Data Steward workflow fixture','data-steward-workflow-'||left(v_user_id::text,8),jsonb_build_object('synthetic',true))
  returning id into v_org_id;

  insert into app.organization_members(organization_id,user_id,role)
  values(v_org_id,v_user_id,'MEMBER');

  insert into app.projects(organization_id,name,slug,metadata)
  values(v_org_id,'Data Steward workflow fixture','data-steward-workflow-'||left(v_user_id::text,8),jsonb_build_object('synthetic',true))
  returning id into v_project_id;

  insert into governance.project_role_bindings(project_id,user_id,role_key,active)
  values(v_project_id,v_user_id,'DATA_STEWARD',true);

  insert into catalog.datasets(project_id,name,source_identifier,business_domain,metadata)
  values(v_project_id,'Synthetic steward dataset','data-steward.synthetic','TEST',jsonb_build_object('synthetic',true))
  returning id into v_dataset_id;

  insert into catalog.dataset_versions(dataset_id,version_number,source_uri,status,row_count,column_count,schema_hash,metadata)
  values(v_dataset_id,1,'table://data_steward.synthetic','AVAILABLE',5,2,'data-steward-schema-v1',jsonb_build_object('synthetic',true))
  returning id into v_version_id;

  -- Data Quality definition must produce immutable semantic-version evidence.
  insert into profiling.quality_rule_definitions(
    project_id,dataset_id,dataset_version_id,rule_key,name,dimension,severity,
    metric_key,operator,threshold,enabled,origin,rule_type,rule_config,created_by
  )
  values(
    v_project_id,v_dataset_id,v_version_id,'data_steward.completeness','Data Steward completeness',
    'COMPLETENESS','MEDIUM','null_rate','LTE',0.05,true,'CUSTOM','METRIC_THRESHOLD','{}'::jsonb,v_user_id
  )
  returning id into v_rule_id;

  select count(*) into v_count from profiling.quality_rule_versions where rule_definition_id=v_rule_id;
  if v_count < 1 then raise exception 'Data Steward quality rule semantic version evidence was not captured'; end if;

  -- Glossary creation must create immutable semantic version evidence.
  insert into governance.glossary_terms(
    project_id,term,definition,domain,status,authority_type,owner_user_id,last_changed_by,provenance,metadata
  )
  values(
    v_project_id,'Customer order','A governed synthetic customer order concept.','TEST','DRAFT',
    'HUMAN_GOVERNED',v_user_id,v_user_id,jsonb_build_object('origin','HUMAN','synthetic',true),jsonb_build_object('synthetic',true)
  )
  returning id into v_term_id;

  select count(*) into v_count from governance.glossary_term_versions where term_id=v_term_id;
  if v_count < 1 then raise exception 'Data Steward glossary semantic version evidence was not captured'; end if;

  -- Classification suggestion + human review must be evidence-bearing and capability gated.
  insert into governance.classification_labels(project_id,code,name,category,description,enabled)
  values(v_project_id,'SYNTHETIC_INTERNAL','Synthetic Internal','SENSITIVITY','Synthetic classification label.',true)
  returning id into v_label_id;

  insert into governance.dataset_classifications(
    project_id,dataset_id,label_id,status,confidence,source,evidence,target_type,origin,authority_state
  )
  values(
    v_project_id,v_dataset_id,v_label_id,'SUGGESTED',0.95,'PROFILING',
    jsonb_build_object('synthetic',true),'DATASET','AI_SUGGESTED','PROPOSED'
  )
  returning id into v_classification_id;

  v_review := governance.review_dataset_classification(
    v_project_id,v_classification_id,v_user_id,'APPROVED','Synthetic Data Steward review'
  );
  if v_review->>'status' is distinct from 'APPROVED'
     or v_review->>'authority_state' is distinct from 'AUTHORITATIVE' then
    raise exception 'Data Steward classification review did not become authoritative: %',v_review;
  end if;

  select count(*) into v_count
  from governance.classification_events
  where classification_id=v_classification_id;
  if v_count < 2 then raise exception 'Classification suggestion/review event history is incomplete: %',v_count; end if;

  select count(*) into v_count
  from governance.audit_events
  where project_id=v_project_id
    and entity_type='DATASET_CLASSIFICATION'
    and entity_id=v_classification_id
    and event_type='GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED';
  if v_count <> 1 then raise exception 'Classification review audit event missing or duplicated: %',v_count; end if;

  -- Stewardship assignment must retain append-only event and audit evidence.
  insert into governance.stewardship_assignments(
    project_id,target_type,dataset_id,user_id,role,accountability,status,origin,
    assigned_by,assigned_at,last_changed_by,evidence
  )
  values(
    v_project_id,'DATASET',v_dataset_id,v_user_id,'DATA_STEWARD',
    'Own operational governance of synthetic fixture.','ACTIVE','HUMAN',
    v_user_id,now(),v_user_id,jsonb_build_object('synthetic',true)
  )
  returning id into v_assignment_id;

  select count(*) into v_count from governance.stewardship_assignment_events where assignment_id=v_assignment_id;
  if v_count < 1 then raise exception 'Stewardship assignment event evidence was not captured'; end if;

  select count(*) into v_count
  from governance.audit_events
  where project_id=v_project_id and entity_type='STEWARDSHIP_ASSIGNMENT' and entity_id=v_assignment_id;
  if v_count < 1 then raise exception 'Stewardship assignment audit evidence was not captured'; end if;

  -- Issue creation represents the canonical Data Steward triage surface.
  insert into governance.issues(
    project_id,dataset_id,dataset_version_id,title,description,severity,status,owner_user_id,created_by,resolution_evidence
  )
  values(
    v_project_id,v_dataset_id,v_version_id,'Synthetic Data Steward issue','Fixture issue for canonical workflow validation.',
    'MEDIUM','OPEN',v_user_id,v_user_id,jsonb_build_object('synthetic',true)
  )
  returning id into v_issue_id;

  if not exists (
    select 1 from governance.issues
    where id=v_issue_id and project_id=v_project_id and status='OPEN' and owner_user_id=v_user_id
  ) then raise exception 'Canonical Data Steward issue state was not persisted'; end if;

  -- Hard-delete guards must preserve governed histories.
  begin
    delete from governance.stewardship_assignments where id=v_assignment_id;
    raise exception 'Stewardship hard-delete guard did not fire';
  exception when sqlstate '55000' then
    null;
  end;

  begin
    delete from governance.dataset_classifications where id=v_classification_id;
    raise exception 'Classification hard-delete guard did not fire';
  exception when others then
    if sqlerrm='Classification hard-delete guard did not fire' then raise; end if;
  end;

  if not exists(select 1 from governance.stewardship_assignments where id=v_assignment_id)
     or not exists(select 1 from governance.dataset_classifications where id=v_classification_id) then
    raise exception 'Governed history was lost after hard-delete negative cases';
  end if;
end
$$;

select 'Data Steward canonical workflow/evidence fixture: PASS' as result;
rollback;
