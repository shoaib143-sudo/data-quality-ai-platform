-- Distinguish real external governance references from human-approved enterprise authority.
-- External standards can establish a real evidence corpus without fabricating adoption as internal policy.

create or replace function governance.governance_corpus_truth(p_project_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = pg_catalog, governance, app
as $$
  with counts as (
    select
      count(*) filter (
        where source_kind <> 'SYNTHETIC'
          and nullif(btrim(content),'') is not null
          and nullif(btrim(content_hash),'') is not null
          and not (coalesce(metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb)
      )::bigint as real_documents,
      count(*) filter (
        where source_kind = 'EXTERNAL_REFERENCE'
          and nullif(btrim(source_url),'') is not null
          and source_url ~ '^https://'
          and nullif(btrim(content),'') is not null
          and nullif(btrim(content_hash),'') is not null
          and not (coalesce(metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb)
      )::bigint as external_reference_documents,
      count(*) filter (
        where source_kind <> 'SYNTHETIC'
          and status = 'ACTIVE'
          and review_status = 'APPROVED'
          and reviewed_by is not null
          and reviewed_at is not null
          and not (coalesce(metadata,'{}'::jsonb) @> '{"synthetic_bootstrap":true}'::jsonb)
      )::bigint as approved_enterprise_authority_documents
    from governance.knowledge_documents
    where project_id = p_project_id
  )
  select jsonb_build_object(
    'real_corpus_ingested', real_documents > 0,
    'real_documents', real_documents,
    'external_reference_documents', external_reference_documents,
    'approved_enterprise_authority_documents', approved_enterprise_authority_documents,
    'external_references_confer_internal_authority', false,
    'authority_semantics', 'HUMAN_APPROVAL_REQUIRED_FOR_ENTERPRISE_AUTHORITY'
  )
  from counts;
$$;

revoke all on function governance.governance_corpus_truth(uuid) from public, anon, authenticated;
grant execute on function governance.governance_corpus_truth(uuid) to service_role;

-- Preserve the previous full verifier once, then wrap only its stale corpus interpretation.
do $$
begin
  if to_regprocedure('governance.verify_ai_governance_intelligence_active_v1(uuid)') is null then
    alter function governance.verify_ai_governance_intelligence_active(uuid)
      rename to verify_ai_governance_intelligence_active_v1;
  end if;
end
$$;

create or replace function governance.verify_ai_governance_intelligence_active(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog, agent, orchestration, app
as $$
declare
  v_result jsonb;
  v_truth jsonb;
  v_blockers jsonb;
  v_partial integer;
  v_failure integer;
  v_status text;
  v_had_corpus_blocker boolean;
begin
  v_result := governance.verify_ai_governance_intelligence_active_v1(p_project_id);
  v_truth := governance.governance_corpus_truth(p_project_id);
  v_had_corpus_blocker := exists (
    select 1
    from jsonb_array_elements(coalesce(v_result->'blockers','[]'::jsonb)) item
    where item->>'code' = 'REAL_GOVERNANCE_CORPUS_NOT_INGESTED'
  );

  if coalesce((v_truth->>'real_corpus_ingested')::boolean,false) then
    select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_blockers
    from jsonb_array_elements(coalesce(v_result->'blockers','[]'::jsonb)) item
    where item->>'code' <> 'REAL_GOVERNANCE_CORPUS_NOT_INGESTED';

    v_partial := greatest(0, coalesce((v_result->>'partial_or_external_count')::integer,0) - case when v_had_corpus_blocker then 1 else 0 end);
    v_failure := coalesce((v_result->>'failure_count')::integer,0);
    v_status := case when v_failure > 0 then 'FAILED' when v_partial > 0 then 'PARTIAL' else 'PASSED' end;

    v_result := jsonb_set(v_result, '{blockers}', v_blockers, true);
    v_result := jsonb_set(v_result, '{partial_or_external_count}', to_jsonb(v_partial), true);
    v_result := jsonb_set(v_result, '{status}', to_jsonb(v_status), true);
    v_result := jsonb_set(
      v_result,
      '{checks,enterprise_governance_corpus}',
      jsonb_build_object(
        'status','PASS',
        'corpus_state',case
          when coalesce((v_truth->>'approved_enterprise_authority_documents')::bigint,0) > 0 then 'HUMAN_APPROVED_ENTERPRISE_AUTHORITY_PRESENT'
          else 'REAL_EXTERNAL_REFERENCE_CORPUS_PRESENT'
        end,
        'real_documents',coalesce((v_truth->>'real_documents')::bigint,0),
        'external_reference_documents',coalesce((v_truth->>'external_reference_documents')::bigint,0),
        'approved_enterprise_authority_documents',coalesce((v_truth->>'approved_enterprise_authority_documents')::bigint,0),
        'external_references_confer_internal_authority',false,
        'authority_semantics','HUMAN_APPROVAL_REQUIRED_FOR_ENTERPRISE_AUTHORITY'
      ),
      true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function governance.verify_ai_governance_intelligence_active(uuid) from public, anon;
grant execute on function governance.verify_ai_governance_intelligence_active(uuid) to authenticated, service_role;

-- Normalize the trustworthy public-reference origin prefix without changing authority state.
update governance.knowledge_documents
set document_key = regexp_replace(document_key, '^external-nist-', 'ext-nist-'),
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'origin_prefix','ext',
      'origin_type','EXTERNAL_REFERENCE',
      'authoritative_internal_policy',false
    ),
    updated_at = now()
where source_kind = 'EXTERNAL_REFERENCE'
  and document_key like 'external-nist-%'
  and not exists (
    select 1
    from governance.knowledge_documents existing
    where existing.project_id = governance.knowledge_documents.project_id
      and existing.document_key = regexp_replace(governance.knowledge_documents.document_key, '^external-nist-', 'ext-nist-')
  );

-- Audit snapshots must reflect observed corpus truth instead of a hard-coded blocker.
create or replace function governance.generate_audit_report_snapshot(
  p_project_id uuid,
  p_actor uuid default null::uuid,
  p_report_type text default 'GOVERNANCE_EVIDENCE'::text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, governance, app, extensions
as $$
declare
  v_report_id uuid := gen_random_uuid();
  v_actor_type text := case when p_actor is null then 'SYSTEM' else 'USER' end;
  v_actor_ref text := p_actor::text;
  v_tip governance.audit_events%rowtype;
  v_count bigint;
  v_chain jsonb;
  v_audit_posture jsonb;
  v_security_posture jsonb;
  v_quality_control jsonb;
  v_workflow_contract jsonb;
  v_corpus_truth jsonb;
  v_payload jsonb;
  v_hash text;
  v_report_type text := upper(btrim(coalesce(p_report_type,'')));
begin
  if not exists(select 1 from app.projects where id=p_project_id) then raise exception 'Project not found'; end if;
  if v_report_type not in ('GOVERNANCE_EVIDENCE','AUDIT_CHAIN','READINESS_EVIDENCE') then raise exception 'Unsupported audit report type'; end if;
  if p_actor is not null and not exists(
    select 1 from app.projects p
    join app.organization_members m on m.organization_id=p.organization_id
    where p.id=p_project_id and m.user_id=p_actor
  ) then raise exception 'Audit report actor is not a project member'; end if;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_actor,v_actor_type,'GOVERNANCE_AUDIT_REPORT_GENERATED','AUDIT_REPORT_SNAPSHOT',v_report_id,jsonb_build_object('report_type',v_report_type,'evidence_snapshot',true));

  select * into v_tip
  from governance.audit_events
  where project_id=p_project_id and entity_type='AUDIT_REPORT_SNAPSHOT' and entity_id=v_report_id
  order by chain_sequence desc nulls last,created_at desc limit 1;
  if not found or v_tip.event_hash is null or v_tip.chain_sequence is null then raise exception 'Audit report chain anchor was not created'; end if;

  select count(*) into v_count from governance.audit_events where project_id=p_project_id;
  v_chain := governance.verify_audit_chain(p_project_id);
  v_audit_posture := governance.verify_governance_audit_posture();
  v_security_posture := governance.verify_database_api_security_posture();
  v_quality_control := governance.verify_quality_control_posture();
  v_workflow_contract := governance.verify_workflow_contract_posture();
  v_corpus_truth := governance.governance_corpus_truth(p_project_id);

  v_payload := jsonb_build_object(
    'project_id',p_project_id,
    'report_type',v_report_type,
    'audit_chain',v_chain,
    'audit_posture',v_audit_posture,
    'database_api_security_posture',v_security_posture,
    'quality_control_posture',v_quality_control,
    'workflow_contract_posture',v_workflow_contract,
    'chain_anchor',jsonb_build_object('event_id',v_tip.id,'event_hash',v_tip.event_hash,'chain_sequence',v_tip.chain_sequence),
    'audit_event_count',v_count,
    'truth_boundaries',jsonb_build_object(
      'real_field_lineage_data_not_ingested',true,
      'real_governance_corpus_not_ingested',not coalesce((v_corpus_truth->>'real_corpus_ingested')::boolean,false),
      'approved_enterprise_governance_authority_documents',coalesce((v_corpus_truth->>'approved_enterprise_authority_documents')::bigint,0),
      'external_references_confer_internal_authority',false,
      'synthetic_governance_authority_claimed',false
    )
  );

  v_hash := governance.compute_audit_report_hash(v_report_id,p_project_id,v_report_type,v_actor_ref,v_actor_type,v_tip.chain_sequence,v_tip.id,v_tip.event_hash,v_count,v_payload);
  insert into governance.audit_report_snapshots(
    id,project_id,report_type,generated_by,actor_ref,actor_type,chain_sequence,chain_tip_event_id,chain_tip_event_hash,audit_event_count,report_payload,report_hash
  ) values(
    v_report_id,p_project_id,v_report_type,p_actor,v_actor_ref,v_actor_type,v_tip.chain_sequence,v_tip.id,v_tip.event_hash,v_count,v_payload,v_hash
  );
  return v_report_id;
end;
$$;
