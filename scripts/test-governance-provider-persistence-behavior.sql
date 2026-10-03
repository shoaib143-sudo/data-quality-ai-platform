\set ON_ERROR_STOP on
begin;

-- This fixture runs only against the isolated CI Supabase database.
-- Temporarily suppress FK triggers so the checkpoint/evidence contracts can be
-- exercised with an isolated synthetic project identifier and no application seed.
select set_config('session_replication_role','replica',true);

do $block$
declare
  v_project_id uuid := '00000000-0000-4000-8000-000000000109';
  first_claim jsonb;
begin
  first_claim := governance.claim_platform_execution_checkpoint(v_project_id,'plan-1','op-1','idem-1');
  assert first_claim->>'resume_action' = 'EXECUTE', 'first claim must execute';
  assert (first_claim->>'claimed')::boolean, 'first claim must be acquired';
  assert (first_claim->'checkpoint'->>'claim_generation')::bigint = 1, 'first claim generation must be 1';

  first_claim := governance.claim_platform_execution_checkpoint(v_project_id,'plan-async','op-async','idem-async');
  assert first_claim->>'resume_action' = 'EXECUTE', 'async fixture first claim must execute';
  assert (first_claim->>'claimed')::boolean, 'async fixture claim must be acquired';
  assert (first_claim->'checkpoint'->>'claim_generation')::bigint = 1, 'async fixture claim generation must be 1';
end;
$block$;

select set_config('session_replication_role','origin',true);

do $block$
declare
  v_project_id uuid := '00000000-0000-4000-8000-000000000109';
  result jsonb;
  failed boolean := false;
begin
  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-1','op-1','idem-1');
  assert result->>'resume_action' = 'WAIT', 'active RUNNING claim must wait';
  assert not (result->>'claimed')::boolean, 'active RUNNING claim must not be reacquired';

  update governance.platform_execution_checkpoints
     set updated_at = now() - interval '16 minutes'
   where project_id = v_project_id and idempotency_key = 'idem-1';

  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-1','op-1','idem-1');
  assert result->>'resume_action' = 'RECOVER', 'stale RUNNING claim must enter recovery readback';
  assert (result->>'claimed')::boolean, 'stale RUNNING recovery claim must be acquired';
  assert (result->'checkpoint'->>'claim_generation')::bigint = 2, 'stale reclaim must increment generation';

  begin
    perform governance.put_platform_execution_checkpoint(v_project_id,'idem-1',1,'SUCCEEDED',1,null,null,'{}'::jsonb,null,now());
  exception when others then
    failed := position('GOVERNANCE_CHECKPOINT_FENCED' in sqlerrm) > 0;
  end;
  assert failed, 'stale worker generation must be fenced';

  perform governance.put_platform_execution_checkpoint(v_project_id,'idem-1',2,'FAILED',2,null,null,'{}'::jsonb,null,now());
  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-1','op-1','idem-1');
  assert result->>'resume_action' = 'FAILED', 'FAILED checkpoint must be terminal for automatic replay';
  assert not (result->>'claimed')::boolean, 'FAILED checkpoint must not be reclaimed';

  perform governance.put_platform_execution_checkpoint(v_project_id,'idem-async',1,'PENDING',1,null,null,'{}'::jsonb,null,now());
  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-async','op-async','idem-async');
  assert result->>'resume_action' = 'WAIT', 'PENDING without provider job must wait';

  perform governance.put_platform_execution_checkpoint(v_project_id,'idem-async',1,'PENDING',1,null,'job-1','{}'::jsonb,null,now());
  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-async','op-async','idem-async');
  assert result->>'resume_action' = 'POLL', 'PENDING provider job must poll';

  perform governance.put_platform_execution_checkpoint(v_project_id,'idem-async',1,'SUCCEEDED',1,'provider-1','job-1','{}'::jsonb,null,now());
  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-async','op-async','idem-async');
  assert result->>'resume_action' = 'VERIFY', 'SUCCEEDED checkpoint must verify without replay';

  perform governance.put_platform_execution_checkpoint(v_project_id,'idem-async',1,'VERIFIED',1,'provider-1','job-1','{}'::jsonb,'VERIFIED',now());
  result := governance.claim_platform_execution_checkpoint(v_project_id,'plan-async','op-async','idem-async');
  assert result->>'resume_action' = 'COMPLETE', 'VERIFIED checkpoint must suppress duplicate mutation';

  failed := false;
  begin
    perform governance.put_platform_execution_checkpoint(v_project_id,'idem-async',1,'RUNNING',1,'provider-1','job-1','{}'::jsonb,'VERIFIED',now());
  exception when others then
    failed := position('GOVERNANCE_CHECKPOINT_INVALID_TRANSITION' in sqlerrm) > 0;
  end;
  assert failed, 'VERIFIED checkpoint must be terminal and reject regression';
end;
$block$;

select set_config('session_replication_role','replica',true);
insert into governance.platform_execution_evidence(
  project_id,plan_id,deployment_id,operation_id,provider,connection_id,idempotency_key,
  desired_state_fingerprint,execution_status,verification_status,details
) values(
  '00000000-0000-4000-8000-000000000109','plan-1','deployment-1','op-1','fixture','conn','idem-1',
  repeat('a',64),'SUCCEEDED','VERIFIED','{}'::jsonb
);
select set_config('session_replication_role','origin',true);

do $block$
declare
  blocked_update boolean := false;
  blocked_delete boolean := false;
begin
  begin
    update governance.platform_execution_evidence set details='{"tampered":true}'::jsonb
    where project_id='00000000-0000-4000-8000-000000000109';
  exception when others then
    blocked_update := position('append-only' in sqlerrm) > 0;
  end;
  begin
    delete from governance.platform_execution_evidence
    where project_id='00000000-0000-4000-8000-000000000109';
  exception when others then
    blocked_delete := position('append-only' in sqlerrm) > 0;
  end;
  assert blocked_update, 'execution evidence update must be rejected';
  assert blocked_delete, 'execution evidence delete must be rejected';
end;
$block$;


-- Durable provider projection mapping must preserve both canonical and provider
-- identity within a project/provider/connection boundary.
select set_config('session_replication_role','replica',true);
do $block$
declare
  v_project_id uuid := '00000000-0000-4000-8000-000000000109';
  count_written integer;
  collision_rejected boolean := false;
begin
  count_written := governance.upsert_provider_projection_observations(
    v_project_id,
    jsonb_build_array(jsonb_build_object(
      'provider','informatica',
      'connection_id','conn',
      'canonical_object_id','technical-asset:customer',
      'provider_object_id','provider-customer',
      'provider_version','1',
      'last_observed_fingerprint',repeat('b',64),
      'last_observed_at',now(),
      'sync_state','IN_SYNC'
    ))
  );
  assert count_written = 1, 'provider projection observation must be persisted';

  count_written := governance.upsert_provider_projection_observations(
    v_project_id,
    jsonb_build_array(jsonb_build_object(
      'provider','INFORMATICA',
      'connection_id','conn',
      'canonical_object_id','technical-asset:customer',
      'provider_object_id','provider-customer',
      'provider_version','2',
      'last_observed_fingerprint',repeat('c',64),
      'last_observed_at',now(),
      'sync_state','DRIFTED'
    ))
  );
  assert count_written = 1, 'existing canonical projection observation must update';
  assert (
    select provider_version='2' and sync_state='DRIFTED'
    from governance.provider_projections
    where project_id=v_project_id and provider='informatica' and connection_id='conn'
      and canonical_object_id='technical-asset:customer'
  ), 'projection observation update must preserve normalized target identity';

  begin
    perform governance.upsert_provider_projection_observations(
      v_project_id,
      jsonb_build_array(jsonb_build_object(
        'provider','informatica',
        'connection_id','conn',
        'canonical_object_id','technical-asset:other',
        'provider_object_id','provider-customer',
        'last_observed_fingerprint',repeat('d',64),
        'last_observed_at',now(),
        'sync_state','IN_SYNC'
      ))
    );
  exception when unique_violation then
    collision_rejected := true;
  end;
  assert collision_rejected, 'one provider object must not map to two canonical identities in the same target';
end;
$block$;
select set_config('session_replication_role','origin',true);

rollback;
