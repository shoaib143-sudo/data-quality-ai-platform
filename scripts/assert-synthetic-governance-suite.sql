begin;

do $$
declare
  v_result jsonb;
  v_user_id uuid := gen_random_uuid();
  v_org_id uuid;
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values(v_user_id,'authenticated','authenticated','synthetic-readiness@example.invalid',now(),now());

  insert into app.organizations(name,slug,metadata)
  values('Synthetic readiness authority','synthetic-readiness-'||left(v_user_id::text,8),jsonb_build_object('synthetic',true))
  returning id into v_org_id;

  insert into app.organization_members(organization_id,user_id,role)
  values(v_org_id,v_user_id,'OWNER');

  insert into app.projects(organization_id,name,slug,metadata)
  values(v_org_id,'Synthetic readiness authority','synthetic-readiness',jsonb_build_object('synthetic',true));

  v_result := governance.run_synthetic_governance_integration_suite();

  if v_result->>'status' is distinct from 'PASSED' then
    raise exception 'Synthetic governance integration suite failed: %', v_result;
  end if;

  if jsonb_typeof(v_result->'checks') is distinct from 'object'
     or coalesce(
       (select bool_and(value = 'true'::jsonb) from jsonb_each(v_result->'checks')),
       false
     ) is not true then
    raise exception 'Synthetic governance integration suite returned incomplete or failing checks: %', v_result;
  end if;
end
$$;

rollback;
