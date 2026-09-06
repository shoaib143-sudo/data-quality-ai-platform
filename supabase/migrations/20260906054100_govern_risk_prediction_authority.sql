-- Patch the existing transparent rules model in place so derived intelligence only consumes governed contract authority.
do $$
declare
  v_def text;
  v_old text;
begin
  select pg_get_functiondef('governance.refresh_governance_risk_predictions(uuid)'::regprocedure) into v_def;

  v_old := 'join governance.data_contract_versions dcv on dcv.contract_id=dc.id';
  if strpos(v_def,v_old)=0 then raise exception 'Expected data-contract version join was not found in risk refresh function'; end if;
  v_def := replace(v_def,v_old,'join governance.data_contract_versions dcv on dcv.id=dc.current_version_id');

  v_old := 'where dc.project_id=p_project_id and dc.dataset_id=d.id and dcv.freshness_sla_hours is not null';
  if strpos(v_def,v_old)=0 then raise exception 'Expected contract freshness clause was not found in risk refresh function'; end if;
  v_def := replace(v_def,v_old,
    'where dc.project_id=p_project_id and dc.dataset_id=d.id and dc.status=''ACTIVE'' and dcv.status=''ACTIVE'' and dcv.authority_status=''APPROVED'' and dcv.approved_by is not null and coalesce(dcv.effective_at,''epoch''::timestamptz)<=now() and dcv.freshness_sla_hours is not null');

  v_old := 'select count(*)::integer into v_contracts from governance.data_contracts dc where dc.project_id=p_project_id and dc.dataset_id=d.id and upper(coalesce(dc.status,''ACTIVE'')) not in (''RETIRED'',''ARCHIVED'');';
  if strpos(v_def,v_old)=0 then raise exception 'Expected contract-count clause was not found in risk refresh function'; end if;
  v_def := replace(v_def,v_old,
    'select count(*)::integer into v_contracts from governance.data_contracts dc join governance.data_contract_versions dcv on dcv.id=dc.current_version_id where dc.project_id=p_project_id and dc.dataset_id=d.id and dc.status=''ACTIVE'' and dcv.status=''ACTIVE'' and dcv.authority_status=''APPROVED'' and dcv.approved_by is not null and coalesce(dcv.effective_at,''epoch''::timestamptz)<=now();');

  v_def := replace(v_def,'''model_version'',''rules-v1''','''model_version'',''rules-v2-governed-authority'',''contract_authority_scope'',''ACTIVE_CURRENT_VERSION_APPROVED_EFFECTIVE_ONLY'',''field_lineage_evidence_state'',case when exists(select 1 from governance.lineage_column_mappings lcm where lcm.project_id=p_project_id) then ''INGESTED'' else ''REAL_FIELD_LINEAGE_DATA_NOT_INGESTED'' end');

  if strpos(v_def,'rules-v2-governed-authority')=0 or strpos(v_def,'ACTIVE_CURRENT_VERSION_APPROVED_EFFECTIVE_ONLY')=0 then
    raise exception 'Governed risk model provenance patch did not apply';
  end if;
  execute v_def;
end $$;

-- Recompute current derived intelligence from truthful governed authority; history trigger captures each refresh.
do $$
declare p record;
begin
  for p in select id from app.projects loop
    perform governance.refresh_governance_risk_predictions(p.id);
  end loop;
end $$;

create or replace function governance.verify_governance_intelligence_posture()
returns jsonb language sql stable security definer
set search_path='pg_catalog','governance','catalog','extensions' as $$
with current_integrity as (
  select
    count(*) as prediction_count,
    count(*) filter(where not exists(select 1 from governance.governance_risk_prediction_events e where e.prediction_id=p.id)) as missing_history,
    count(*) filter(where coalesce(p.evidence->>'model_version','')<>'rules-v2-governed-authority') as stale_model_version,
    count(*) filter(where coalesce(p.evidence->>'contract_authority_scope','')<>'ACTIVE_CURRENT_VERSION_APPROVED_EFFECTIVE_ONLY') as contract_scope_missing,
    count(*) filter(where coalesce((p.evidence->>'contract_count')::integer,0) <> (
      select count(*)::integer from governance.data_contracts dc
      join governance.data_contract_versions dcv on dcv.id=dc.current_version_id
      where dc.project_id=p.project_id and dc.dataset_id=p.dataset_id
        and dc.status='ACTIVE' and dcv.status='ACTIVE' and dcv.authority_status='APPROVED'
        and dcv.approved_by is not null and coalesce(dcv.effective_at,'epoch'::timestamptz)<=now()
    )) as contract_authority_violations,
    count(*) filter(where coalesce(p.evidence->>'field_lineage_evidence_state','') <> case
      when exists(select 1 from governance.lineage_column_mappings lcm where lcm.project_id=p.project_id) then 'INGESTED'
      else 'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED' end) as lineage_truth_violations
  from governance.governance_risk_predictions p
), history_integrity as (
  select
    count(*) as event_count,
    count(*) filter(where model_hash is distinct from encode(extensions.digest(convert_to(jsonb_build_object(
      'prediction_id',prediction_id,'project_id',project_id,'dataset_id',dataset_id,'prediction_type',prediction_type,
      'model_version',model_version,'snapshot',prediction_snapshot
    )::text,'UTF8'),'sha256'),'hex')) as invalid_event_hashes,
    count(*) filter(where event_type='LEGACY_CURRENT_BASELINE') as legacy_baselines
  from governance.governance_risk_prediction_events
), trigger_integrity as (
  select exists(
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='governance' and c.relname='governance_risk_prediction_events'
      and t.tgname='governance_risk_prediction_events_immutable' and not t.tgisinternal and t.tgenabled<>'D'
  ) as history_immutable
), grants as (
  select
    has_table_privilege('anon','governance.governance_risk_predictions','INSERT') or has_table_privilege('anon','governance.governance_risk_predictions','UPDATE') or has_table_privilege('anon','governance.governance_risk_predictions','DELETE')
      or has_table_privilege('authenticated','governance.governance_risk_predictions','INSERT') or has_table_privilege('authenticated','governance.governance_risk_predictions','UPDATE') or has_table_privilege('authenticated','governance.governance_risk_predictions','DELETE') as browser_prediction_write,
    has_table_privilege('anon','governance.governance_risk_prediction_events','INSERT') or has_table_privilege('authenticated','governance.governance_risk_prediction_events','INSERT') as browser_history_write
)
select jsonb_build_object(
  'valid',c.missing_history=0 and c.stale_model_version=0 and c.contract_scope_missing=0 and c.contract_authority_violations=0 and c.lineage_truth_violations=0
    and h.invalid_event_hashes=0 and t.history_immutable and not g.browser_prediction_write and not g.browser_history_write,
  'prediction_count',c.prediction_count,'history_events',h.event_count,'legacy_current_baselines',h.legacy_baselines,
  'missing_history',c.missing_history,'stale_model_version',c.stale_model_version,'contract_scope_missing',c.contract_scope_missing,
  'contract_authority_violations',c.contract_authority_violations,'lineage_truth_violations',c.lineage_truth_violations,
  'invalid_event_hashes',h.invalid_event_hashes,'history_append_only',t.history_immutable,
  'browser_prediction_write',g.browser_prediction_write,'browser_history_write',g.browser_history_write,
  'model_semantics','TRANSPARENT_RULES_V2_GOVERNED_AUTHORITY',
  'legacy_history_semantics','LEGACY_CURRENT_BASELINE_NOT_FULL_HISTORY',
  'contract_authority_scope','ACTIVE_CURRENT_VERSION_APPROVED_EFFECTIVE_ONLY'
) from current_integrity c cross join history_integrity h cross join trigger_integrity t cross join grants g;
$$;
revoke all on function governance.verify_governance_intelligence_posture() from public,anon,authenticated;
grant execute on function governance.verify_governance_intelligence_posture() to service_role;
