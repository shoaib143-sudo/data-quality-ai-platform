create or replace function orchestration.project_agent_run_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_actor_id text;
  v_event_type text;
  v_occurred_at timestamptz;
begin
  select organization_id into v_org_id from app.projects where id=new.project_id;
  if v_org_id is null then raise exception 'Cannot project agent run % because project % is missing',new.id,new.project_id; end if;
  v_actor_id := auth.uid()::text;
  v_event_type := case when tg_op='INSERT' then 'AGENT.RUN_CREATED' else 'AGENT.RUN_UPDATED' end;
  v_occurred_at := coalesce(new.completed_at,new.started_at,new.created_at,now());

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,aggregate_version,correlation_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),new.project_id,v_org_id,1,'APPEND',v_event_type,v_occurred_at,
    'AGENT_RUN',new.id::text,null,new.correlation_id::text,
    case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,
    jsonb_build_object(
      'agentDefinitionId',new.agent_definition_id,
      'datasetId',new.dataset_id,
      'datasetVersionId',new.dataset_version_id,
      'parentRunId',new.parent_run_id,
      'status',new.status::text,
      'errorCode',new.error_code,
      'startedAt',new.started_at,
      'completedAt',new.completed_at,
      'cancelRequestedAt',new.cancel_requested_at,
      'cancelledAt',new.cancelled_at,
      'cancellationReason',new.cancellation_reason
    )
  );
  return new;
end;
$$;
revoke all on function orchestration.project_agent_run_change() from public,anon,authenticated;
drop trigger if exists agent_runs_projection_outbox on agent.agent_runs;
create trigger agent_runs_projection_outbox
after insert or update of status,error_code,started_at,completed_at,cancel_requested_at,cancelled_at,cancellation_reason
on agent.agent_runs
for each row execute function orchestration.project_agent_run_change();

create or replace function orchestration.project_governance_issue_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row governance.issues%rowtype;
  v_org_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op='DELETE' then old else new end;
  select organization_id into v_org_id from app.projects where id=v_row.project_id;
  if v_org_id is null then return case when tg_op='DELETE' then old else new end; end if;
  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op='DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op='INSERT' then 'GOVERNANCE.ISSUE_CREATED' when tg_op='DELETE' then 'GOVERNANCE.ISSUE_DELETED' else 'GOVERNANCE.ISSUE_UPDATED' end;
  v_occurred_at := case when tg_op='DELETE' then now() else coalesce(new.updated_at,new.created_at,now()) end;

  if tg_op='DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument',jsonb_build_object('objectType','ISSUE','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'datasetId',v_row.dataset_id,'datasetVersionId',v_row.dataset_version_id,'profileRunId',v_row.profile_run_id,
      'findingId',v_row.finding_id,'qualityRuleRunId',v_row.quality_rule_run_id,
      'severity',v_row.severity,'status',v_row.status,'ownerUserId',v_row.owner_user_id,'dueAt',v_row.due_at,
      'resolvedAt',v_row.resolved_at,
      'knowledgeDocument',jsonb_build_object(
        'objectType','ISSUE','objectId',v_row.id::text,'label',v_row.title,'description',v_row.description,
        'content',concat_ws(' ',v_row.title,v_row.description,v_row.severity,v_row.status,v_row.resolution_summary),
        'href','/issues/'||v_row.id::text,
        'metadata',jsonb_build_object(
          'datasetId',v_row.dataset_id,'datasetVersionId',v_row.dataset_version_id,'profileRunId',v_row.profile_run_id,
          'severity',v_row.severity,'status',v_row.status,'ownerUserId',v_row.owner_user_id,'dueAt',v_row.due_at,'resolvedAt',v_row.resolved_at
        ),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_row.project_id,v_org_id,1,v_operation,v_event_type,v_occurred_at,
    'ISSUE',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_governance_issue_change() from public,anon,authenticated;
drop trigger if exists issues_projection_outbox on governance.issues;
create trigger issues_projection_outbox
after insert or delete or update of title,description,severity,status,owner_user_id,due_at,resolution_summary,resolved_at
on governance.issues
for each row execute function orchestration.project_governance_issue_change();

create or replace function orchestration.project_observability_incident_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row governance.observability_incidents%rowtype;
  v_org_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
  v_payload jsonb;
begin
  v_row := case when tg_op='DELETE' then old else new end;
  select organization_id into v_org_id from app.projects where id=v_row.project_id;
  if v_org_id is null then return case when tg_op='DELETE' then old else new end; end if;
  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op='DELETE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op='INSERT' then 'OBSERVABILITY.INCIDENT_CREATED' when tg_op='DELETE' then 'OBSERVABILITY.INCIDENT_DELETED' else 'OBSERVABILITY.INCIDENT_UPDATED' end;
  v_occurred_at := case when tg_op='DELETE' then now() else coalesce(new.updated_at,new.last_observed_at,new.created_at,now()) end;

  if tg_op='DELETE' then
    v_payload := jsonb_build_object('knowledgeDocument',jsonb_build_object('objectType','QUALITY_INCIDENT','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'datasetId',v_row.dataset_id,'status',v_row.status,'severity',v_row.severity,'confidence',v_row.confidence,
      'approvalRequired',v_row.approval_required,'workflowInstanceId',v_row.workflow_instance_id,
      'firstObservedAt',v_row.first_observed_at,'lastObservedAt',v_row.last_observed_at,
      'acknowledgedAt',v_row.acknowledged_at,'responseDueAt',v_row.response_due_at,
      'resolvedAt',v_row.resolved_at,'escalationLevel',v_row.escalation_level,'lastEscalatedAt',v_row.last_escalated_at,
      'knowledgeDocument',jsonb_build_object(
        'objectType','QUALITY_INCIDENT','objectId',v_row.id::text,'label',v_row.title,'description',v_row.summary,
        'content',concat_ws(' ',v_row.title,v_row.summary,v_row.business_impact,v_row.severity,v_row.status),
        'href','/observability/incidents/'||v_row.id::text,
        'metadata',jsonb_build_object(
          'datasetId',v_row.dataset_id,'severity',v_row.severity,'status',v_row.status,'confidence',v_row.confidence,
          'approvalRequired',v_row.approval_required,'escalationLevel',v_row.escalation_level,'firstObservedAt',v_row.first_observed_at,
          'lastObservedAt',v_row.last_observed_at,'resolvedAt',v_row.resolved_at
        ),
        'updatedAt',v_occurred_at
      )
    );
  end if;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_row.project_id,v_org_id,1,v_operation,v_event_type,v_occurred_at,
    'OBSERVABILITY_INCIDENT',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_observability_incident_change() from public,anon,authenticated;
drop trigger if exists observability_incidents_projection_outbox on governance.observability_incidents;
create trigger observability_incidents_projection_outbox
after insert or delete or update of status,severity,title,summary,business_impact,confidence,approval_required,workflow_instance_id,last_observed_at,resolved_at,acknowledged_at,response_due_at,escalation_level,last_escalated_at
on governance.observability_incidents
for each row execute function orchestration.project_observability_incident_change();

create or replace function orchestration.project_observability_alert_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row profiling.observability_alerts%rowtype;
  v_org_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_occurred_at timestamptz;
begin
  v_row := case when tg_op='DELETE' then old else new end;
  select organization_id into v_org_id from app.projects where id=v_row.project_id;
  if v_org_id is null then return case when tg_op='DELETE' then old else new end; end if;
  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op='DELETE' then 'DELETE' else 'APPEND' end;
  v_event_type := case when tg_op='INSERT' then 'OBSERVABILITY.ALERT_CREATED' when tg_op='DELETE' then 'OBSERVABILITY.ALERT_DELETED' else 'OBSERVABILITY.ALERT_UPDATED' end;
  v_occurred_at := case when tg_op='DELETE' then now() else coalesce(new.updated_at,new.last_observed_at,new.created_at,now()) end;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,actor_id,payload
  ) values (
    gen_random_uuid(),v_row.project_id,v_org_id,1,v_operation,v_event_type,v_occurred_at,
    'OBSERVABILITY_ALERT',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,
    jsonb_build_object(
      'datasetId',v_row.dataset_id,'datasetVersionId',v_row.dataset_version_id,'profileRunId',v_row.profile_run_id,
      'category',v_row.category,'severity',v_row.severity,'status',v_row.status,'fingerprint',v_row.fingerprint,
      'firstObservedAt',v_row.first_observed_at,'lastObservedAt',v_row.last_observed_at,'resolvedAt',v_row.resolved_at
    )
  );
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_observability_alert_change() from public,anon,authenticated;
drop trigger if exists observability_alerts_projection_outbox on profiling.observability_alerts;
create trigger observability_alerts_projection_outbox
after insert or delete or update of category,severity,title,description,status,last_observed_at,resolved_at
on profiling.observability_alerts
for each row execute function orchestration.project_observability_alert_change();