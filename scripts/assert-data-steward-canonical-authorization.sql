begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_org_id uuid;
  v_project_id uuid;
  v_other_project_id uuid;
  v_positive text[] := array[
    'catalog.read','catalog.update','glossary.manage','quality.execute',
    'issues.manage','classification.review','stewardship.manage',
    'profiling.execute','agent.execute','execution.retry','execution.cancel'
  ];
  v_negative text[] := array[
    'admin.manage','source.manage','schedule.manage','policy.approve',
    'quality.exception.approve','execution.approve','agent.admin'
  ];
  v_capability text;
  v_org_role text;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_user_id,'authenticated','authenticated','data-steward-canonical-fixture@example.invalid',now(),now());

  insert into app.organizations(name,slug,metadata)
  values(
    'Data Steward canonical fixture',
    'data-steward-canonical-'||left(v_user_id::text,8),
    jsonb_build_object('synthetic',true,'persona','data-steward')
  )
  returning id into v_org_id;

  insert into app.organization_members(organization_id,user_id,role)
  values(v_org_id,v_user_id,'MEMBER');

  insert into app.projects(organization_id,name,slug,metadata)
  values(
    v_org_id,
    'Data Steward authorized project',
    'data-steward-authorized-'||left(v_user_id::text,8),
    jsonb_build_object('synthetic',true)
  )
  returning id into v_project_id;

  insert into app.projects(organization_id,name,slug,metadata)
  values(
    v_org_id,
    'Data Steward negative-scope project',
    'data-steward-negative-'||left(v_user_id::text,8),
    jsonb_build_object('synthetic',true)
  )
  returning id into v_other_project_id;

  insert into governance.project_role_bindings(project_id,user_id,role_key,active)
  values(v_project_id,v_user_id,'DATA_STEWARD',true);

  select role::text into v_org_role
  from app.organization_members
  where organization_id=v_org_id and user_id=v_user_id;

  if v_org_role is distinct from 'MEMBER' then
    raise exception 'Data Steward fixture must retain MEMBER organization tenancy, found %', v_org_role;
  end if;

  if (select count(*) from governance.project_role_bindings where user_id=v_user_id and active) <> 1 then
    raise exception 'Data Steward fixture must have exactly one active persona binding';
  end if;

  foreach v_capability in array v_positive loop
    if governance.has_project_capability(v_project_id,v_user_id,v_capability) is not true then
      raise exception 'Data Steward expected capability denied: %', v_capability;
    end if;
  end loop;

  foreach v_capability in array v_negative loop
    if governance.has_project_capability(v_project_id,v_user_id,v_capability) is not false then
      raise exception 'Data Steward prohibited capability granted: %', v_capability;
    end if;
  end loop;

  foreach v_capability in array array['stewardship.manage','quality.execute','glossary.manage','classification.review','issues.manage','agent.execute']::text[] loop
    if governance.has_project_capability(v_other_project_id,v_user_id,v_capability) is not false then
      raise exception 'Data Steward capability leaked across project boundary: %', v_capability;
    end if;
  end loop;
end
$$;

select 'Data Steward canonical authorization on clean reconstructed database: PASS' as result;
rollback;
