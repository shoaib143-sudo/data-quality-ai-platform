-- Onboard deterministic readiness for validated FILE and CSV execution sources.
create or replace function catalog.verify_dataset_profile_readiness(p_project_id uuid,p_dataset_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
with dc as (
 select d.id dataset_id,d.project_id,d.data_source_id source_id,d.status::text dataset_status,ds.status source_status,upper(ds.source_type) source_type
 from catalog.datasets d join catalog.data_sources ds on ds.id=d.data_source_id and ds.project_id=d.project_id
 where d.project_id=p_project_id and d.id=p_dataset_id
), lv as (
 select distinct on(dv.dataset_id) dv.dataset_id,dv.id dataset_version_id
 from catalog.dataset_versions dv join dc on dc.dataset_id=dv.dataset_id
 order by dv.dataset_id,dv.version_number desc,dv.created_at desc,dv.id desc
), file_evidence as (
 select dc.*,lv.dataset_version_id,des.id execution_source_id,
   dc.source_type in('FILE','CSV') policy_onboarded,
   dc.dataset_status='ACTIVE' dataset_active,dc.source_status='ACTIVE' source_active,
   des.id is not null execution_binding_ready
 from dc left join lv on true
 left join profiling.dataset_execution_sources des on des.dataset_version_id=lv.dataset_version_id and des.active=true
)
select coalesce((select jsonb_build_object(
 'state',case when policy_onboarded and dataset_active and source_active and execution_binding_ready then 'READY' when policy_onboarded then 'BLOCKED' else 'NOT_ASSESSED' end,
 'profiling_ready',policy_onboarded and dataset_active and source_active and execution_binding_ready,
 'project_id',project_id,'dataset_id',dataset_id,'source_id',source_id,'source_type',source_type,'dataset_version_id',dataset_version_id,
 'execution_source_id',execution_source_id,
 'readiness_policy',case source_type when 'FILE' then 'FILE_V1' when 'CSV' then 'CSV_V1' else null end,
 'authority_semantics','DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE',
 'blockers',jsonb_strip_nulls(jsonb_build_object(
   'READINESS_RULE_NOT_ONBOARDED',case when not policy_onboarded then true end,
   'DATASET_NOT_ACTIVE',case when policy_onboarded and not dataset_active then true end,
   'SOURCE_NOT_ACTIVE',case when policy_onboarded and not source_active then true end,
   'EXECUTION_SOURCE_NOT_BOUND',case when policy_onboarded and not execution_binding_ready then true end)),
 'remediation',jsonb_strip_nulls(jsonb_build_object(
   'READINESS_RULE_NOT_ONBOARDED',case when not policy_onboarded then jsonb_build_object('root_cause','This source type does not yet have an onboarded DataNexus profiling-readiness policy.','manual_action','Complete governed readiness onboarding for this source type.','ai_action','AI can diagnose but cannot manufacture governed evidence.','ai_remediation','DIAGNOSE_ONLY','approval_required',true) end,
   'DATASET_NOT_ACTIVE',case when policy_onboarded and not dataset_active then jsonb_build_object('root_cause','The dataset is not active.','manual_action','Activate the intended dataset.','ai_action','AI can prepare a governed activation action.','ai_remediation','POLICY_GATED','approval_required',true) end,
   'SOURCE_NOT_ACTIVE',case when policy_onboarded and not source_active then jsonb_build_object('root_cause','The file source is not active.','manual_action','Validate and activate the intended file source.','ai_action','AI can diagnose source validation evidence.','ai_remediation','POLICY_GATED','approval_required',true) end,
   'EXECUTION_SOURCE_NOT_BOUND',case when policy_onboarded and not execution_binding_ready then jsonb_build_object('root_cause','The latest dataset version has no active validated file execution source.','manual_action','Revalidate the file and bind the resulting execution source.','ai_action','AI may repair an unambiguous binding when policy authorizes it.','ai_remediation','LOW_RISK_WHEN_POLICY_AUTHORIZED','approval_required',false) end
 ))) from file_evidence),
 jsonb_build_object('state','NOT_ASSESSED','profiling_ready',false,'project_id',p_project_id,'dataset_id',p_dataset_id,'authority_semantics','DETERMINISTIC_DERIVED_READINESS_NO_AGENT_OVERRIDE','blockers',jsonb_build_object('DATASET_NOT_FOUND',true),'remediation',jsonb_build_object()));
$$;
comment on function catalog.verify_dataset_profile_readiness(uuid,uuid) is 'FILE_V1 and CSV_V1 deterministic readiness. Active execution bindings exist only after governed source validation succeeds.';
revoke all on function catalog.verify_dataset_profile_readiness(uuid,uuid) from public,anon;
grant execute on function catalog.verify_dataset_profile_readiness(uuid,uuid) to authenticated,service_role;
select pg_notify('pgrst','reload schema');
