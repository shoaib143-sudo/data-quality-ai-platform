begin;

do $$
declare
  v_org_id uuid;
  v_project_id uuid;
  v_actor uuid := gen_random_uuid();
  v_subject uuid := gen_random_uuid();
  v_expired governance.agent_approval_authorities%rowtype;
  v_current governance.agent_approval_authorities%rowtype;
  v_authority_count integer;
  v_audit_count integer;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (v_actor,'authenticated','authenticated','authority-reassign-actor@example.invalid',now(),now()),
    (v_subject,'authenticated','authenticated','authority-reassign-subject@example.invalid',now(),now());

  insert into app.organizations(name,slug,metadata)
  values(
    'Authority expiry reassignment runtime',
    'authority-reassign-' || left(v_actor::text,8),
    jsonb_build_object('synthetic',true)
  )
  returning id into v_org_id;

  insert into app.organization_members(organization_id,user_id,role) values
    (v_org_id,v_actor,'OWNER'),
    (v_org_id,v_subject,'MEMBER');

  insert into app.projects(organization_id,name,slug,metadata)
  values(
    v_org_id,
    'Authority expiry reassignment runtime',
    'authority-reassign-runtime',
    jsonb_build_object('synthetic',true)
  )
  returning id into v_project_id;

  insert into governance.critical_data_elements(project_id,cde_key,name,definition,domain,metadata)
  values(
    v_project_id,
    'authority-reassign-cde',
    'Authority reassignment CDE',
    'Synthetic CDE for expiry/reassignment authority testing',
    'Product',
    jsonb_build_object('synthetic',true)
  );

  v_expired := governance.assign_agent_approval_authority(
    v_actor,
    v_subject,
    v_project_id,
    'Product',
    'BUSINESS',
    array['RUN_SUPERVISOR'],
    'HIGH',
    now() - interval '2 days',
    now() - interval '1 day',
    'expired authority for reassignment regression'
  );

  if governance.is_agent_approval_authority(
    v_subject,v_project_id,'Product','BUSINESS','RUN_SUPERVISOR','HIGH'
  ) then
    raise exception 'Expired authority unexpectedly remained effective before reassignment';
  end if;

  v_current := governance.assign_agent_approval_authority(
    v_actor,
    v_subject,
    v_project_id,
    'Product',
    'BUSINESS',
    array['RUN_SUPERVISOR'],
    'HIGH',
    now(),
    null,
    'current authority after expired assignment'
  );

  if v_current.id = v_expired.id then
    raise exception 'Reassignment reused expired authority identity instead of creating a new audited grant';
  end if;

  if not governance.is_agent_approval_authority(
    v_subject,v_project_id,'Product','BUSINESS','RUN_SUPERVISOR','HIGH'
  ) then
    raise exception 'Current authority was not effective after expired authority reassignment';
  end if;

  select count(*) into v_authority_count
  from governance.agent_approval_authorities
  where user_id = v_subject
    and project_id = v_project_id
    and domain = 'Product'
    and approval_axis = 'BUSINESS';

  if v_authority_count <> 2 then
    raise exception 'Expected expired and current authority history rows, found %', v_authority_count;
  end if;

  select count(*) into v_audit_count
  from governance.agent_approval_authority_audit
  where actor_user_id = v_actor
    and subject_user_id = v_subject
    and project_id = v_project_id
    and domain = 'Product'
    and approval_axis = 'BUSINESS'
    and event_type = 'ASSIGNED';

  if v_audit_count <> 2 then
    raise exception 'Expected two audited assignment events across expiry/reassignment, found %', v_audit_count;
  end if;
end
$$;

rollback;
