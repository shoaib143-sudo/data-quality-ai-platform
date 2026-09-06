-- Autonomous actions requiring human authority must use a dedicated pinned workflow, not any approved workflow.
insert into governance.workflow_definitions(project_id,workflow_key,name,entity_type,version,steps,enabled,created_by)
select p.id,'AUTONOMY_ACTION_APPROVAL','Autonomous governance action approval','AUTONOMY_ACTION',1,
  jsonb_build_array(jsonb_build_object('index',0,'name','Governance authority approval','capability','policy.approve','description','Review the exact autonomous action, pinned policy semantics, risk and evidence before execution.')),
  true,null
from app.projects p
where not exists(select 1 from governance.workflow_definitions d where d.project_id=p.id and d.workflow_key='AUTONOMY_ACTION_APPROVAL' and d.version=1);

create or replace function governance.enforce_autonomy_action_policy()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance','agent' as $$
declare v_policy governance.autonomy_policies%rowtype; v_version governance.autonomy_policy_versions%rowtype; v_workflow governance.workflow_instances%rowtype; v_requires_approval boolean;
begin
 select * into v_policy from governance.autonomy_policies where id=new.policy_id;
 if not found or v_policy.project_id<>new.project_id or v_policy.action_key<>new.action_key then raise exception 'Autonomy action policy mismatch'; end if;
 if tg_op='INSERT' then new.policy_version_id:=v_policy.current_version_id;
 elsif new.policy_version_id is distinct from old.policy_version_id or new.policy_id is distinct from old.policy_id then raise exception 'Autonomy action policy identity/version is immutable after creation'; end if;
 select * into v_version from governance.autonomy_policy_versions where id=new.policy_version_id and policy_id=new.policy_id and project_id=new.project_id;
 if not found then raise exception 'Pinned autonomy policy version is invalid'; end if;
 if new.source_agent_run_id is not null and not exists(select 1 from agent.agent_runs r where r.id=new.source_agent_run_id and r.project_id=new.project_id) then raise exception 'Source agent run is outside action project'; end if;
 if upper(new.action_key) in ('UPDATE_QUALITY_RULE_THRESHOLD','MUTATE_SOURCE_DATA','ALTER_SCHEMA','DELETE_DATA') and new.status not in ('BLOCKED','REJECTED') then raise exception 'Hard-blocked autonomous action cannot execute'; end if;
 if not coalesce((v_version.snapshot->>'enabled')::boolean,false) or v_version.snapshot->>'execution_mode'='BLOCKED' then if new.status not in ('BLOCKED','REJECTED') then raise exception 'Disabled or blocked autonomy policy cannot authorize action status %',new.status; end if; return new; end if;
 if new.status in ('APPROVED','EXECUTING','EXECUTED') and new.confidence < (v_version.snapshot->>'min_confidence')::numeric then raise exception 'Autonomy action confidence is below pinned policy minimum'; end if;
 v_requires_approval := v_version.snapshot->>'execution_mode'='APPROVAL_REQUIRED' or (v_version.snapshot->>'execution_mode'='AUTO' and governance.autonomy_risk_rank(new.risk_level)>governance.autonomy_risk_rank(v_version.snapshot->>'max_auto_risk_level'));
 if new.status in ('APPROVED','EXECUTING','EXECUTED') and v_requires_approval then
   if new.approval_workflow_instance_id is null then raise exception 'Autonomy action requires approved human workflow'; end if;
   select * into v_workflow from governance.workflow_instances where id=new.approval_workflow_instance_id;
   if not found or v_workflow.project_id<>new.project_id or v_workflow.status<>'APPROVED' or upper(v_workflow.entity_type)<>'AUTONOMY_ACTION' or v_workflow.entity_id<>new.id
      or coalesce(v_workflow.definition_snapshot->>'workflow_key','')<>'AUTONOMY_ACTION_APPROVAL' then
     raise exception 'Approval workflow is not exact dedicated authority for this autonomy action';
   end if;
 end if;
 if tg_op='UPDATE' and old.approval_workflow_instance_id is not null and new.approval_workflow_instance_id is distinct from old.approval_workflow_instance_id then raise exception 'Autonomy action approval workflow evidence is immutable once pinned'; end if;
 return new;
end;
$$;
revoke all on function governance.enforce_autonomy_action_policy() from public,anon,authenticated,service_role;
