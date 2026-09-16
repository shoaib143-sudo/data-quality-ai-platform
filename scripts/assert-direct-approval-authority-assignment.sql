begin;

do $$
declare
  v_org_id uuid;
  v_project_id uuid;
  v_actor uuid := gen_random_uuid();
  v_business uuid := gen_random_uuid();
  v_governance uuid := gen_random_uuid();
  v_low uuid := gen_random_uuid();
  v_medium uuid := gen_random_uuid();
  v_critical uuid := gen_random_uuid();
  v_nonmember uuid := gen_random_uuid();
  v_expired uuid := gen_random_uuid();
  v_future uuid := gen_random_uuid();
  v_authority governance.agent_approval_authorities%rowtype;
  v_audit_count integer;
  v_failed boolean;
  v_signature text := 'governance.assign_agent_approval_authority(uuid,uuid,uuid,text,text,text[],text,timestamp with time zone,timestamp with time zone,text)';
begin
  insert into auth.users(id,aud,role,email,created_at,updated_at) values
    (v_actor,'authenticated','authenticated','authority-actor@example.invalid',now(),now()),
    (v_business,'authenticated','authenticated','authority-business@example.invalid',now(),now()),
    (v_governance,'authenticated','authenticated','authority-governance@example.invalid',now(),now()),
    (v_low,'authenticated','authenticated','authority-low@example.invalid',now(),now()),
    (v_medium,'authenticated','authenticated','authority-medium@example.invalid',now(),now()),
    (v_critical,'authenticated','authenticated','authority-critical@example.invalid',now(),now()),
    (v_nonmember,'authenticated','authenticated','authority-nonmember@example.invalid',now(),now()),
    (v_expired,'authenticated','authenticated','authority-expired@example.invalid',now(),now()),
    (v_future,'authenticated','authenticated','authority-future@example.invalid',now(),now());

  insert into app.organizations(name,slug,metadata)
  values('Direct authority runtime matrix','direct-authority-' || left(v_actor::text,8),jsonb_build_object('synthetic',true))
  returning id into v_org_id;

  insert into app.organization_members(organization_id,user_id,role) values
    (v_org_id,v_actor,'OWNER'),
    (v_org_id,v_business,'MEMBER'),
    (v_org_id,v_governance,'MEMBER'),
    (v_org_id,v_low,'MEMBER'),
    (v_org_id,v_medium,'MEMBER'),
    (v_org_id,v_critical,'MEMBER'),
    (v_org_id,v_expired,'MEMBER'),
    (v_org_id,v_future,'MEMBER');

  insert into app.projects(organization_id,name,slug,metadata)
  values(v_org_id,'Direct authority runtime matrix','direct-authority-runtime',jsonb_build_object('synthetic',true))
  returning id into v_project_id;

  insert into governance.critical_data_elements(project_id,cde_key,name,definition,domain,metadata)
  values(v_project_id,'runtime-test-cde','Runtime test CDE','Synthetic CDE for direct approval authority runtime testing','Product',jsonb_build_object('synthetic',true));

  if has_function_privilege('public', v_signature, 'EXECUTE')
     or has_function_privilege('anon', v_signature, 'EXECUTE')
     or has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'Direct authority assignment RPC is executable by a browser/public role';
  end if;
  if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'Direct authority assignment RPC is not executable by service_role';
  end if;

  v_authority := governance.assign_agent_approval_authority(
    v_actor,v_business,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'runtime positive business authority'
  );
  if v_authority.user_id <> v_business or v_authority.approval_axis <> 'BUSINESS' or v_authority.max_risk <> 'HIGH' then
    raise exception 'Positive Business authority assignment returned unexpected authority: %', row_to_json(v_authority);
  end if;

  select count(*) into v_audit_count
  from governance.agent_approval_authority_audit
  where authority_id = v_authority.id
    and actor_user_id = v_actor
    and subject_user_id = v_business
    and event_type = 'ASSIGNED';
  if v_audit_count <> 1 then
    raise exception 'Positive authority assignment did not persist exactly one audit record';
  end if;

  if not governance.is_agent_approval_authority(v_business,v_project_id,'Product','BUSINESS','RUN_SUPERVISOR','LOW') then
    raise exception 'HIGH authority did not authorize a LOW-risk allowed action';
  end if;
  if not governance.is_agent_approval_authority(v_business,v_project_id,'Product','BUSINESS','RUN_SUPERVISOR','HIGH') then
    raise exception 'HIGH authority did not authorize a HIGH-risk allowed action';
  end if;
  if governance.is_agent_approval_authority(v_business,v_project_id,'Product','BUSINESS','RUN_SUPERVISOR','CRITICAL') then
    raise exception 'HIGH authority incorrectly authorized CRITICAL risk';
  end if;
  if governance.is_agent_approval_authority(v_business,v_project_id,'Product','BUSINESS','RUN_DATA_QUALITY','LOW') then
    raise exception 'Direct authority action allowlist was widened';
  end if;

  perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','GOVERNANCE',array['RUN_SUPERVISOR'],'HIGH',now(),null,'runtime positive governance authority');
  if not governance.is_agent_approval_authority(v_governance,v_project_id,'Product','GOVERNANCE','RUN_SUPERVISOR','HIGH') then
    raise exception 'Distinct Governance authority was not effective';
  end if;

  perform governance.assign_agent_approval_authority(v_actor,v_low,v_project_id,'Product','BUSINESS',array['RUN_PROFILING'],'LOW',now(),null,'LOW ceiling');
  if not governance.is_agent_approval_authority(v_low,v_project_id,'Product','BUSINESS','RUN_PROFILING','LOW')
     or governance.is_agent_approval_authority(v_low,v_project_id,'Product','BUSINESS','RUN_PROFILING','MEDIUM') then
    raise exception 'LOW risk ceiling enforcement failed';
  end if;

  perform governance.assign_agent_approval_authority(v_actor,v_medium,v_project_id,'Product','BUSINESS',array['RUN_PROFILING'],'MEDIUM',now(),null,'MEDIUM ceiling');
  if not governance.is_agent_approval_authority(v_medium,v_project_id,'Product','BUSINESS','RUN_PROFILING','MEDIUM')
     or governance.is_agent_approval_authority(v_medium,v_project_id,'Product','BUSINESS','RUN_PROFILING','HIGH') then
    raise exception 'MEDIUM risk ceiling enforcement failed';
  end if;

  perform governance.assign_agent_approval_authority(v_actor,v_critical,v_project_id,'Product','BUSINESS',array['RUN_PROFILING'],'CRITICAL',now(),null,'CRITICAL ceiling');
  if not governance.is_agent_approval_authority(v_critical,v_project_id,'Product','BUSINESS','RUN_PROFILING','CRITICAL') then
    raise exception 'CRITICAL risk ceiling enforcement failed';
  end if;

  perform governance.assign_agent_approval_authority(v_actor,v_expired,v_project_id,'Product','BUSINESS',array['RUN_PROFILING'],'LOW',now() - interval '2 days',now() - interval '1 day','expired authority');
  if governance.is_agent_approval_authority(v_expired,v_project_id,'Product','BUSINESS','RUN_PROFILING','LOW') then
    raise exception 'Expired direct authority remained effective';
  end if;

  perform governance.assign_agent_approval_authority(v_actor,v_future,v_project_id,'Product','BUSINESS',array['RUN_PROFILING'],'LOW',now() + interval '1 day',now() + interval '2 days','future authority');
  if governance.is_agent_approval_authority(v_future,v_project_id,'Product','BUSINESS','RUN_PROFILING','LOW') then
    raise exception 'Future direct authority became effective before its start time';
  end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(null,v_governance,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'missing actor');
  exception when others then v_failed := position('Administrator and approver identities are required' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Missing administrator identity was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,null,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'missing approver');
  exception when others then v_failed := position('Administrator and approver identities are required' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Missing approver identity was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'   ');
  exception when others then v_failed := position('Authority assignment reason is required' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Blank assignment reason was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_actor,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'self assignment');
  exception when others then v_failed := position('cannot assign direct approval authority to themselves' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Self-assignment was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_business,v_project_id,'Product','GOVERNANCE',array['RUN_SUPERVISOR'],'HIGH',now(),null,'cross-axis overlap');
  exception when others then v_failed := position('same individual cannot hold overlapping Business and Governance authority' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Same-person cross-axis overlap was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_business,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'duplicate');
  exception when others then v_failed := position('overlapping direct approval authority already exists' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Duplicate overlapping authority was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_nonmember,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'nonmember');
  exception when others then v_failed := position('member of the project organization' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Non-member authority assignment was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,gen_random_uuid(),'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'unknown project');
  exception when others then v_failed := position('Approval project does not exist' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Unknown project was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'UnknownDomain','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),null,'unknown domain');
  exception when others then v_failed := position('domain is not governed by this project' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Unknown governed domain was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','BUSINESS',array[]::text[],'HIGH',now(),null,'empty actions');
  exception when others then v_failed := position('at least one explicitly scoped action' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Empty action allowlist was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','BUSINESS',array['UNKNOWN_ACTION'],'HIGH',now(),null,'unknown action');
  exception when others then v_failed := position('Unsupported governed agent action' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Unknown governed action was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','INVALID',array['RUN_SUPERVISOR'],'HIGH',now(),null,'invalid axis');
  exception when others then v_failed := position('Unsupported approval axis' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Invalid approval axis was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'INVALID',now(),null,'invalid risk');
  exception when others then v_failed := position('Unsupported approval risk ceiling' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Invalid risk ceiling was not rejected'; end if;

  v_failed := false;
  begin
    perform governance.assign_agent_approval_authority(v_actor,v_governance,v_project_id,'Product','BUSINESS',array['RUN_SUPERVISOR'],'HIGH',now(),now() - interval '1 second','invalid window');
  exception when others then v_failed := position('end time must be after its start time' in sqlerrm) > 0; end;
  if not v_failed then raise exception 'Invalid authority validity window was not rejected'; end if;
end
$$;

rollback;
