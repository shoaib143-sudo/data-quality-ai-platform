create or replace function orchestration.seed_operational_projection(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_run_id uuid;
  v_total bigint := 0;
  v_rows bigint := 0;
  v_details jsonb := '{}'::jsonb;
begin
  select organization_id into v_org_id from app.projects where id=p_project_id;
  if v_org_id is null then raise exception 'Project % was not found',p_project_id; end if;

  if exists (
    select 1 from orchestration.projection_reconciliation_runs
    where project_id=p_project_id and provider_key='projection_outbox'
      and projection_name='operational_projection_seed_v1' and status='PASSED'
  ) then
    return jsonb_build_object('projectId',p_project_id,'status','ALREADY_SEEDED','projection','operational_projection_seed_v1');
  end if;

  insert into orchestration.projection_reconciliation_runs(project_id,provider_key,projection_name,status,started_at,details)
  values(p_project_id,'projection_outbox','operational_projection_seed_v1','RUNNING',now(),jsonb_build_object('seedVersion',1))
  returning id into v_run_id;

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,correlation_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text||':AGENT_RUN:'||ar.id::text||':operational:v1'),
    ar.project_id,v_org_id,1,'REBUILD','AGENT.RUN_UPDATED',coalesce(ar.completed_at,ar.started_at,ar.created_at),
    'AGENT_RUN',ar.id::text,ar.correlation_id::text,'SYSTEM',
    jsonb_build_object(
      'agentDefinitionId',ar.agent_definition_id,'datasetId',ar.dataset_id,'datasetVersionId',ar.dataset_version_id,
      'parentRunId',ar.parent_run_id,'status',ar.status::text,'errorCode',ar.error_code,
      'startedAt',ar.started_at,'completedAt',ar.completed_at,'cancelRequestedAt',ar.cancel_requested_at,
      'cancelledAt',ar.cancelled_at,'cancellationReason',ar.cancellation_reason
    )
  from agent.agent_runs ar where ar.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows; v_details:=v_details||jsonb_build_object('agentRuns',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text||':ISSUE:'||i.id::text||':operational:v1'),
    i.project_id,v_org_id,1,'REBUILD','GOVERNANCE.ISSUE_UPDATED',coalesce(i.updated_at,i.created_at),
    'ISSUE',i.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',i.dataset_id,'datasetVersionId',i.dataset_version_id,'profileRunId',i.profile_run_id,
      'findingId',i.finding_id,'qualityRuleRunId',i.quality_rule_run_id,'severity',i.severity,'status',i.status,
      'ownerUserId',i.owner_user_id,'dueAt',i.due_at,'resolvedAt',i.resolved_at,
      'knowledgeDocument',jsonb_build_object(
        'objectType','ISSUE','objectId',i.id::text,'label',i.title,'description',i.description,
        'content',concat_ws(' ',i.title,i.description,i.severity,i.status,i.resolution_summary),
        'href','/issues/'||i.id::text,
        'metadata',jsonb_build_object(
          'datasetId',i.dataset_id,'datasetVersionId',i.dataset_version_id,'profileRunId',i.profile_run_id,
          'severity',i.severity,'status',i.status,'ownerUserId',i.owner_user_id,'dueAt',i.due_at,'resolvedAt',i.resolved_at
        ),
        'updatedAt',coalesce(i.updated_at,i.created_at)
      )
    )
  from governance.issues i where i.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows; v_details:=v_details||jsonb_build_object('issues',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text||':OBSERVABILITY_INCIDENT:'||oi.id::text||':operational:v1'),
    oi.project_id,v_org_id,1,'REBUILD','OBSERVABILITY.INCIDENT_UPDATED',coalesce(oi.updated_at,oi.last_observed_at,oi.created_at),
    'OBSERVABILITY_INCIDENT',oi.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',oi.dataset_id,'status',oi.status,'severity',oi.severity,'confidence',oi.confidence,
      'approvalRequired',oi.approval_required,'workflowInstanceId',oi.workflow_instance_id,
      'firstObservedAt',oi.first_observed_at,'lastObservedAt',oi.last_observed_at,'acknowledgedAt',oi.acknowledged_at,
      'responseDueAt',oi.response_due_at,'resolvedAt',oi.resolved_at,'escalationLevel',oi.escalation_level,
      'lastEscalatedAt',oi.last_escalated_at,
      'knowledgeDocument',jsonb_build_object(
        'objectType','QUALITY_INCIDENT','objectId',oi.id::text,'label',oi.title,'description',oi.summary,
        'content',concat_ws(' ',oi.title,oi.summary,oi.business_impact,oi.severity,oi.status),
        'href','/observability/incidents/'||oi.id::text,
        'metadata',jsonb_build_object(
          'datasetId',oi.dataset_id,'severity',oi.severity,'status',oi.status,'confidence',oi.confidence,
          'approvalRequired',oi.approval_required,'escalationLevel',oi.escalation_level,
          'firstObservedAt',oi.first_observed_at,'lastObservedAt',oi.last_observed_at,'resolvedAt',oi.resolved_at
        ),
        'updatedAt',coalesce(oi.updated_at,oi.last_observed_at,oi.created_at)
      )
    )
  from governance.observability_incidents oi where oi.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows; v_details:=v_details||jsonb_build_object('incidents',v_rows);

  insert into orchestration.projection_outbox(
    event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,
    aggregate_type,aggregate_id,actor_type,payload
  )
  select
    orchestration.projection_seed_event_uuid(p_project_id::text||':OBSERVABILITY_ALERT:'||oa.id::text||':operational:v1'),
    oa.project_id,v_org_id,1,'REBUILD','OBSERVABILITY.ALERT_UPDATED',coalesce(oa.updated_at,oa.last_observed_at,oa.created_at),
    'OBSERVABILITY_ALERT',oa.id::text,'SYSTEM',
    jsonb_build_object(
      'datasetId',oa.dataset_id,'datasetVersionId',oa.dataset_version_id,'profileRunId',oa.profile_run_id,
      'category',oa.category,'severity',oa.severity,'status',oa.status,'fingerprint',oa.fingerprint,
      'firstObservedAt',oa.first_observed_at,'lastObservedAt',oa.last_observed_at,'resolvedAt',oa.resolved_at
    )
  from profiling.observability_alerts oa where oa.project_id=p_project_id
  on conflict(event_id) do nothing;
  get diagnostics v_rows=row_count; v_total:=v_total+v_rows; v_details:=v_details||jsonb_build_object('alerts',v_rows);

  update orchestration.projection_reconciliation_runs
  set status='PASSED',expected_count=v_total,actual_count=v_total,mismatch_count=0,
      completed_at=now(),details=details||v_details||jsonb_build_object('seedVersion',1)
  where id=v_run_id;

  return jsonb_build_object('projectId',p_project_id,'status','PASSED','projection','operational_projection_seed_v1','eventsEnqueued',v_total,'details',v_details);
end;
$$;
revoke all on function orchestration.seed_operational_projection(uuid) from public,anon,authenticated;
grant execute on function orchestration.seed_operational_projection(uuid) to service_role;
