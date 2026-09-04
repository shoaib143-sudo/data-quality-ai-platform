create table if not exists governance.business_context_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  asset_key text not null,
  asset_type text not null,
  name text not null,
  description text,
  criticality text not null default 'MEDIUM',
  owner_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_context_assets_type_check check (asset_type = any(array['BUSINESS_DOMAIN','BUSINESS_PROCESS','REPORT','CUSTOMER_JOURNEY','KPI','REGULATORY_SCOPE'])),
  constraint business_context_assets_criticality_check check (criticality = any(array['LOW','MEDIUM','HIGH','CRITICAL'])),
  constraint business_context_assets_project_key_uq unique(project_id,asset_key)
);

create table if not exists governance.dataset_business_context_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  business_context_asset_id uuid not null references governance.business_context_assets(id) on delete cascade,
  relationship_type text not null default 'SUPPORTS',
  confidence numeric,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dataset_business_context_links_relationship_check check (relationship_type = any(array['SUPPORTS','FEEDS','IMPACTS','MONITORED_BY'])),
  constraint dataset_business_context_links_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
  constraint dataset_business_context_links_uq unique(project_id,dataset_id,business_context_asset_id)
);

create table if not exists governance.governance_risk_predictions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  prediction_type text not null,
  horizon_days integer not null,
  probability numeric not null,
  risk_level text not null,
  confidence numeric not null,
  source_profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  contributors jsonb not null default '[]'::jsonb,
  explanation text not null,
  evidence jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint governance_risk_predictions_type_check check (prediction_type = any(array['DQ_SLA_BREACH_7D','GOVERNANCE_RISK_30D'])),
  constraint governance_risk_predictions_horizon_check check (horizon_days > 0),
  constraint governance_risk_predictions_probability_check check (probability >= 0 and probability <= 1),
  constraint governance_risk_predictions_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint governance_risk_predictions_level_check check (risk_level = any(array['INFO','LOW','MEDIUM','HIGH','CRITICAL'])),
  constraint governance_risk_predictions_dataset_type_uq unique(project_id,dataset_id,prediction_type)
);

create index if not exists business_context_assets_project_idx on governance.business_context_assets(project_id,asset_type,criticality);
create index if not exists dataset_business_context_links_dataset_idx on governance.dataset_business_context_links(project_id,dataset_id);
create index if not exists governance_risk_predictions_project_idx on governance.governance_risk_predictions(project_id,risk_level,probability desc);
create index if not exists governance_risk_predictions_dataset_idx on governance.governance_risk_predictions(dataset_id,prediction_type,calculated_at desc);

alter table governance.business_context_assets enable row level security;
alter table governance.dataset_business_context_links enable row level security;
alter table governance.governance_risk_predictions enable row level security;

revoke all on governance.business_context_assets from public, anon, authenticated;
revoke all on governance.dataset_business_context_links from public, anon, authenticated;
revoke all on governance.governance_risk_predictions from public, anon, authenticated;
grant all on governance.business_context_assets to service_role;
grant all on governance.dataset_business_context_links to service_role;
grant all on governance.governance_risk_predictions to service_role;

create or replace function governance.refresh_business_context_from_governance(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, catalog
as $$
declare
  v_assets integer := 0;
  v_links integer := 0;
begin
  insert into governance.business_context_assets(project_id,asset_key,asset_type,name,description,criticality,metadata,updated_at)
  select p_project_id,
    'DOMAIN:' || upper(trim(cde.domain)),
    'BUSINESS_DOMAIN',
    trim(cde.domain),
    'Governed business domain derived from mapped critical data elements.',
    case max(case upper(coalesce(cde.criticality,'MEDIUM')) when 'CRITICAL' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 else 1 end)
      when 4 then 'CRITICAL' when 3 then 'HIGH' when 2 then 'MEDIUM' else 'LOW' end,
    jsonb_build_object('source','CRITICAL_DATA_ELEMENT_DOMAIN','cde_count',count(*),'cde_keys',jsonb_agg(distinct cde.cde_key)),
    now()
  from governance.critical_data_elements cde
  where cde.project_id = p_project_id
    and cde.domain is not null
    and trim(cde.domain) <> ''
    and upper(coalesce(cde.status,'ACTIVE')) = 'ACTIVE'
  group by trim(cde.domain)
  on conflict(project_id,asset_key) do update set
    name=excluded.name, description=excluded.description, criticality=excluded.criticality, metadata=excluded.metadata, updated_at=excluded.updated_at;
  get diagnostics v_assets = row_count;

  insert into governance.dataset_business_context_links(project_id,dataset_id,business_context_asset_id,relationship_type,confidence,evidence,updated_at)
  select p_project_id, cm.dataset_id, bca.id, 'SUPPORTS',
    least(1::numeric, greatest(0::numeric, avg(coalesce(cm.confidence,0.75))))::numeric,
    jsonb_build_object('source','CDE_MAPPING','mapping_count',count(*),'cde_keys',jsonb_agg(distinct cde.cde_key),'domain',cde.domain),
    now()
  from governance.cde_mappings cm
  join governance.critical_data_elements cde on cde.id = cm.cde_id and cde.project_id = p_project_id
  join governance.business_context_assets bca on bca.project_id = p_project_id and bca.asset_key = 'DOMAIN:' || upper(trim(cde.domain))
  where cm.project_id = p_project_id
    and cde.domain is not null
    and trim(cde.domain) <> ''
    and upper(coalesce(cde.status,'ACTIVE')) = 'ACTIVE'
  group by cm.dataset_id,bca.id,cde.domain
  on conflict(project_id,dataset_id,business_context_asset_id) do update set
    relationship_type=excluded.relationship_type, confidence=excluded.confidence, evidence=excluded.evidence, updated_at=excluded.updated_at;
  get diagnostics v_links = row_count;

  return jsonb_build_object('project_id',p_project_id,'assets_refreshed',v_assets,'links_refreshed',v_links);
end;
$$;

create or replace function governance.refresh_governance_risk_predictions(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog
as $$
declare
  d record;
  v_latest_run_id uuid;
  v_completed_at timestamptz;
  v_score numeric;
  v_sla_hours numeric;
  v_age_hours numeric;
  v_failed_rules integer;
  v_open_alerts integer;
  v_alert_factor numeric;
  v_freshness_open boolean;
  v_cert_status text;
  v_cert_factor numeric;
  v_critical_cdes integer;
  v_recent_unreliable integer;
  v_lineage_edges integer;
  v_business_factor numeric;
  v_business_links integer;
  v_contracts integer;
  v_open_issues integer;
  v_score_gap numeric;
  v_freshness_factor numeric;
  v_failed_rule_factor numeric;
  v_run_factor numeric;
  v_cde_factor numeric;
  v_lineage_factor numeric;
  v_contract_gap numeric;
  v_issue_factor numeric;
  v_dq_probability numeric;
  v_gov_probability numeric;
  v_confidence numeric;
  v_dq_level text;
  v_gov_level text;
  v_count integer := 0;
  v_contributors jsonb;
begin
  perform governance.refresh_business_context_from_governance(p_project_id);

  for d in select id,name from catalog.datasets where project_id = p_project_id loop
    select pr.id,pr.completed_at into v_latest_run_id,v_completed_at
    from profiling.profile_runs pr
    join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
    where dv.dataset_id = d.id and pr.status = 'COMPLETED'
    order by coalesce(pr.completed_at,pr.started_at) desc nulls last
    limit 1;

    v_score := null;
    if v_latest_run_id is not null then
      select dqs.overall_score into v_score from profiling.data_quality_scores dqs
      where dqs.profile_run_id = v_latest_run_id order by dqs.created_at desc limit 1;
    end if;

    select coalesce(
      (select op.freshness_sla_hours::numeric from profiling.observability_policies op where op.project_id=p_project_id and op.dataset_id=d.id and op.enabled is distinct from false limit 1),
      (select dcv.freshness_sla_hours::numeric from governance.data_contracts dc join governance.data_contract_versions dcv on dcv.contract_id=dc.id where dc.project_id=p_project_id and dc.dataset_id=d.id and dcv.freshness_sla_hours is not null order by dcv.version_number desc limit 1),
      24::numeric
    ) into v_sla_hours;

    v_age_hours := case when v_completed_at is null then null else extract(epoch from (now()-v_completed_at))/3600 end;
    select count(*)::integer into v_failed_rules from profiling.quality_rule_runs qrr where qrr.profile_run_id = v_latest_run_id and qrr.status = 'FAILED';
    select count(*)::integer,
      coalesce(max(case upper(oa.severity) when 'CRITICAL' then 1.0 when 'HIGH' then 0.75 when 'MEDIUM' then 0.5 when 'LOW' then 0.25 else 0 end),0)::numeric,
      coalesce(bool_or(oa.category='FRESHNESS'),false)
    into v_open_alerts,v_alert_factor,v_freshness_open
    from profiling.observability_alerts oa where oa.project_id=p_project_id and oa.dataset_id=d.id and oa.status <> 'RESOLVED';

    select coalesce(
      (select dc.certification_status from governance.dataset_certifications dc where dc.project_id=p_project_id and dc.dataset_id=d.id order by dc.updated_at desc limit 1),
      (select cat.certification_status from governance.dataset_catalog cat where cat.project_id=p_project_id and cat.dataset_id=d.id limit 1),
      'UNCERTIFIED'
    ) into v_cert_status;
    v_cert_factor := case upper(coalesce(v_cert_status,'UNCERTIFIED')) when 'CERTIFIED' then 0 when 'APPROVED' then 0.15 when 'PENDING' then 0.5 else 1 end;

    select count(distinct cde.id)::integer into v_critical_cdes
    from governance.cde_mappings cm join governance.critical_data_elements cde on cde.id=cm.cde_id
    where cm.project_id=p_project_id and cm.dataset_id=d.id and upper(coalesce(cde.criticality,'MEDIUM')) in ('HIGH','CRITICAL') and upper(coalesce(cde.status,'ACTIVE'))='ACTIVE';

    select count(*)::integer into v_recent_unreliable from (
      select pr.status from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id
      where dv.dataset_id=d.id order by pr.started_at desc limit 5
    ) rr where rr.status in ('FAILED','PARTIAL','CANCELLED');

    select count(*)::integer into v_lineage_edges from governance.lineage_edges e
    where e.project_id=p_project_id
      and ((upper(e.source_type)='DATASET' and e.source_id=d.id) or (upper(e.target_type)='DATASET' and e.target_id=d.id));

    select count(*)::integer,
      coalesce(max(case upper(bca.criticality) when 'CRITICAL' then 1.0 when 'HIGH' then 0.75 when 'MEDIUM' then 0.5 else 0.25 end),0)::numeric
    into v_business_links,v_business_factor
    from governance.dataset_business_context_links l join governance.business_context_assets bca on bca.id=l.business_context_asset_id
    where l.project_id=p_project_id and l.dataset_id=d.id;

    select count(*)::integer into v_contracts from governance.data_contracts dc where dc.project_id=p_project_id and dc.dataset_id=d.id and upper(coalesce(dc.status,'ACTIVE')) not in ('RETIRED','ARCHIVED');
    select count(*)::integer into v_open_issues from governance.issues i where i.project_id=p_project_id and i.dataset_id=d.id and upper(coalesce(i.status,'OPEN')) not in ('RESOLVED','CLOSED','DONE');

    v_score_gap := case when v_score is null then 0.35 else least(1::numeric,greatest(0::numeric,1-v_score)) end;
    v_freshness_factor := case when v_freshness_open then 1 when v_completed_at is null then 1 when v_sla_hours <= 0 then 0 else least(1::numeric,greatest(0::numeric,v_age_hours/v_sla_hours)) end;
    v_failed_rule_factor := least(1::numeric,coalesce(v_failed_rules,0)::numeric/3);
    v_run_factor := least(1::numeric,coalesce(v_recent_unreliable,0)::numeric/3);
    v_cde_factor := least(1::numeric,coalesce(v_critical_cdes,0)::numeric/3);
    v_lineage_factor := least(1::numeric,coalesce(v_lineage_edges,0)::numeric/5);
    v_contract_gap := case when coalesce(v_contracts,0)>0 then 0 else 1 end;
    v_issue_factor := least(1::numeric,coalesce(v_open_issues,0)::numeric/3);

    v_dq_probability := least(1::numeric,greatest(0::numeric,0.25*v_score_gap + 0.20*v_freshness_factor + 0.20*v_failed_rule_factor + 0.10*v_alert_factor + 0.10*v_run_factor + 0.10*v_cde_factor + 0.05*v_lineage_factor));
    v_gov_probability := least(1::numeric,greatest(0::numeric,0.18*v_dq_probability + 0.18*v_cert_factor + 0.15*v_cde_factor + 0.12*v_lineage_factor + 0.12*v_business_factor + 0.10*v_contract_gap + 0.10*v_issue_factor + 0.05*v_run_factor));

    v_confidence := least(0.95::numeric,0.35 + case when v_latest_run_id is not null then 0.20 else 0 end + case when v_score is not null then 0.15 else 0 end + case when v_latest_run_id is not null then 0.10 else 0 end + case when v_business_links>0 then 0.10 else 0 end + case when v_contracts>0 or upper(coalesce(v_cert_status,'')) in ('CERTIFIED','APPROVED','PENDING') then 0.05 else 0 end);
    v_dq_level := case when v_dq_probability>=0.75 then 'CRITICAL' when v_dq_probability>=0.55 then 'HIGH' when v_dq_probability>=0.35 then 'MEDIUM' when v_dq_probability>=0.15 then 'LOW' else 'INFO' end;
    v_gov_level := case when v_gov_probability>=0.75 then 'CRITICAL' when v_gov_probability>=0.55 then 'HIGH' when v_gov_probability>=0.35 then 'MEDIUM' when v_gov_probability>=0.15 then 'LOW' else 'INFO' end;

    v_contributors := jsonb_build_array(
      jsonb_build_object('factor','quality_score_gap','value',v_score_gap,'weight',0.25,'weighted_contribution',0.25*v_score_gap,'evidence',jsonb_build_object('overall_score',v_score,'profile_run_id',v_latest_run_id)),
      jsonb_build_object('factor','freshness_exposure','value',v_freshness_factor,'weight',0.20,'weighted_contribution',0.20*v_freshness_factor,'evidence',jsonb_build_object('sla_hours',v_sla_hours,'age_hours',v_age_hours,'freshness_alert_open',v_freshness_open)),
      jsonb_build_object('factor','failed_quality_controls','value',v_failed_rule_factor,'weight',0.20,'weighted_contribution',0.20*v_failed_rule_factor,'evidence',jsonb_build_object('failed_rule_count',v_failed_rules)),
      jsonb_build_object('factor','active_alert_severity','value',v_alert_factor,'weight',0.10,'weighted_contribution',0.10*v_alert_factor,'evidence',jsonb_build_object('open_alert_count',v_open_alerts)),
      jsonb_build_object('factor','execution_reliability','value',v_run_factor,'weight',0.10,'weighted_contribution',0.10*v_run_factor,'evidence',jsonb_build_object('recent_unreliable_runs',v_recent_unreliable)),
      jsonb_build_object('factor','critical_data_exposure','value',v_cde_factor,'weight',0.10,'weighted_contribution',0.10*v_cde_factor,'evidence',jsonb_build_object('high_or_critical_cdes',v_critical_cdes)),
      jsonb_build_object('factor','lineage_reach','value',v_lineage_factor,'weight',0.05,'weighted_contribution',0.05*v_lineage_factor,'evidence',jsonb_build_object('lineage_edges',v_lineage_edges))
    );

    insert into governance.governance_risk_predictions(project_id,dataset_id,prediction_type,horizon_days,probability,risk_level,confidence,source_profile_run_id,contributors,explanation,evidence,calculated_at,expires_at)
    values(p_project_id,d.id,'DQ_SLA_BREACH_7D',7,v_dq_probability,v_dq_level,v_confidence,v_latest_run_id,v_contributors,
      format('Transparent 7-day DQ SLA risk for %s is %s with probability %s; the score is a weighted rules model, not a learned black-box forecast.',d.name,v_dq_level,round(v_dq_probability,3)),
      jsonb_build_object('model_version','rules-v1','dataset_name',d.name,'business_context_links',v_business_links,'certification_status',v_cert_status,'contract_count',v_contracts),now(),now()+interval '6 hours')
    on conflict(project_id,dataset_id,prediction_type) do update set horizon_days=excluded.horizon_days,probability=excluded.probability,risk_level=excluded.risk_level,confidence=excluded.confidence,source_profile_run_id=excluded.source_profile_run_id,contributors=excluded.contributors,explanation=excluded.explanation,evidence=excluded.evidence,calculated_at=excluded.calculated_at,expires_at=excluded.expires_at;

    v_contributors := jsonb_build_array(
      jsonb_build_object('factor','dq_risk','value',v_dq_probability,'weight',0.18,'weighted_contribution',0.18*v_dq_probability),
      jsonb_build_object('factor','certification_gap','value',v_cert_factor,'weight',0.18,'weighted_contribution',0.18*v_cert_factor,'evidence',jsonb_build_object('status',v_cert_status)),
      jsonb_build_object('factor','critical_data_exposure','value',v_cde_factor,'weight',0.15,'weighted_contribution',0.15*v_cde_factor,'evidence',jsonb_build_object('high_or_critical_cdes',v_critical_cdes)),
      jsonb_build_object('factor','lineage_reach','value',v_lineage_factor,'weight',0.12,'weighted_contribution',0.12*v_lineage_factor,'evidence',jsonb_build_object('lineage_edges',v_lineage_edges)),
      jsonb_build_object('factor','business_criticality','value',v_business_factor,'weight',0.12,'weighted_contribution',0.12*v_business_factor,'evidence',jsonb_build_object('business_context_links',v_business_links)),
      jsonb_build_object('factor','contract_gap','value',v_contract_gap,'weight',0.10,'weighted_contribution',0.10*v_contract_gap,'evidence',jsonb_build_object('active_contract_count',v_contracts)),
      jsonb_build_object('factor','open_governance_issues','value',v_issue_factor,'weight',0.10,'weighted_contribution',0.10*v_issue_factor,'evidence',jsonb_build_object('open_issue_count',v_open_issues)),
      jsonb_build_object('factor','execution_reliability','value',v_run_factor,'weight',0.05,'weighted_contribution',0.05*v_run_factor)
    );

    insert into governance.governance_risk_predictions(project_id,dataset_id,prediction_type,horizon_days,probability,risk_level,confidence,source_profile_run_id,contributors,explanation,evidence,calculated_at,expires_at)
    values(p_project_id,d.id,'GOVERNANCE_RISK_30D',30,v_gov_probability,v_gov_level,v_confidence,v_latest_run_id,v_contributors,
      format('Transparent 30-day governance risk for %s is %s with probability %s, combining DQ, certification, CDE, lineage, business-context, contract, issue and execution evidence.',d.name,v_gov_level,round(v_gov_probability,3)),
      jsonb_build_object('model_version','rules-v1','dataset_name',d.name,'business_context_links',v_business_links,'business_criticality_factor',v_business_factor,'certification_status',v_cert_status,'contract_count',v_contracts,'open_issue_count',v_open_issues),now(),now()+interval '6 hours')
    on conflict(project_id,dataset_id,prediction_type) do update set horizon_days=excluded.horizon_days,probability=excluded.probability,risk_level=excluded.risk_level,confidence=excluded.confidence,source_profile_run_id=excluded.source_profile_run_id,contributors=excluded.contributors,explanation=excluded.explanation,evidence=excluded.evidence,calculated_at=excluded.calculated_at,expires_at=excluded.expires_at;

    v_count := v_count + 2;
  end loop;
  return jsonb_build_object('project_id',p_project_id,'predictions_refreshed',v_count,'calculated_at',now());
end;
$$;

create or replace function governance.refresh_all_governance_risk_predictions()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, app
as $$
declare
  p record;
  v_projects integer := 0;
  v_predictions integer := 0;
  v_result jsonb;
begin
  for p in select id from app.projects loop
    begin
      v_result := governance.refresh_governance_risk_predictions(p.id);
      v_projects := v_projects + 1;
      v_predictions := v_predictions + coalesce((v_result->>'predictions_refreshed')::integer,0);
    exception when others then
      raise warning 'risk refresh failed for project %: %',p.id,sqlerrm;
    end;
  end loop;
  return jsonb_build_object('projects_refreshed',v_projects,'predictions_refreshed',v_predictions,'calculated_at',now());
end;
$$;

revoke all on function governance.refresh_business_context_from_governance(uuid) from public,anon,authenticated;
revoke all on function governance.refresh_governance_risk_predictions(uuid) from public,anon,authenticated;
revoke all on function governance.refresh_all_governance_risk_predictions() from public,anon,authenticated;
grant execute on function governance.refresh_business_context_from_governance(uuid) to service_role;
grant execute on function governance.refresh_governance_risk_predictions(uuid) to service_role;
grant execute on function governance.refresh_all_governance_risk_predictions() to service_role;
