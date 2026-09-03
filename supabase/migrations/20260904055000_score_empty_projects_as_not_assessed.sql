create or replace function governance.refresh_project_scorecard(p_project_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,governance,profiling,catalog,app
as $$
declare
  v_total integer:=0; v_catalog integer:=0; v_stewarded integer:=0; v_profiled integer:=0; v_certified integer:=0; v_contracts integer:=0;
  v_healthy integer:=0; v_quality numeric:=0; v_quality_count integer:=0; v_overdue integer:=0;
  v_dimensions jsonb; v_evidence jsonb; v_overall numeric; v_id uuid;
begin
  select count(*) into v_total from catalog.datasets where project_id=p_project_id;
  if v_total=0 then
    v_dimensions:=jsonb_build_object('catalog_coverage',0,'stewardship_coverage',0,'profiling_freshness',0,'quality_health',0,'observability_health',0,'certification_coverage',0,'contract_coverage',0,'remediation_health',0);
    v_evidence:=jsonb_build_object('assessment_status','NOT_ASSESSED','datasets',0,'cataloged',0,'stewarded',0,'profiled_last_30d',0,'quality_scores',0,'healthy_without_high_alerts',0,'certified',0,'active_contracts',0,'overdue_issues',0);
    insert into governance.project_scorecard_snapshots(project_id,overall_score,dimensions,evidence) values(p_project_id,0,v_dimensions,v_evidence) returning id into v_id;
    return jsonb_build_object('id',v_id,'project_id',p_project_id,'overall_score',0,'dimensions',v_dimensions,'evidence',v_evidence,'calculated_at',now());
  end if;

  select count(*) into v_catalog from governance.dataset_catalog where project_id=p_project_id;
  select count(distinct dataset_id) into v_stewarded from governance.stewardship_assignments where project_id=p_project_id and active=true and role in ('BUSINESS_OWNER','DATA_STEWARD');
  select count(*) into v_certified from governance.dataset_catalog where project_id=p_project_id and certification_status='CERTIFIED';
  select count(*) into v_contracts from governance.data_contracts where project_id=p_project_id and status='ACTIVE';
  select count(*) into v_overdue from governance.issues where project_id=p_project_id and status not in ('RESOLVED','CLOSED') and due_at is not null and due_at<now();

  with latest as (
    select distinct on (dv.dataset_id) dv.dataset_id,pr.id,pr.completed_at
    from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id
    where d.project_id=p_project_id and pr.status='COMPLETED'
    order by dv.dataset_id,pr.completed_at desc nulls last,pr.started_at desc
  )
  select count(*) filter(where completed_at>=now()-interval '30 days'),coalesce(avg(s.overall_score),0),count(s.overall_score)
  into v_profiled,v_quality,v_quality_count from latest l left join profiling.data_quality_scores s on s.profile_run_id=l.id;

  select count(*) into v_healthy from catalog.datasets d where d.project_id=p_project_id and not exists(
    select 1 from profiling.observability_alerts a where a.dataset_id=d.id and a.status<>'RESOLVED' and a.severity in ('HIGH','CRITICAL')
  );

  v_dimensions:=jsonb_build_object(
    'catalog_coverage',v_catalog::numeric/v_total,
    'stewardship_coverage',v_stewarded::numeric/v_total,
    'profiling_freshness',v_profiled::numeric/v_total,
    'quality_health',case when v_quality_count=0 then 0 else least(1,greatest(0,v_quality)) end,
    'observability_health',v_healthy::numeric/v_total,
    'certification_coverage',v_certified::numeric/v_total,
    'contract_coverage',v_contracts::numeric/v_total,
    'remediation_health',greatest(0,1-least(1,v_overdue::numeric/v_total))
  );
  select avg(value::numeric) into v_overall from jsonb_each_text(v_dimensions);
  v_overall:=least(1,greatest(0,coalesce(v_overall,0)));
  v_evidence:=jsonb_build_object('assessment_status','ASSESSED','datasets',v_total,'cataloged',v_catalog,'stewarded',v_stewarded,'profiled_last_30d',v_profiled,'quality_scores',v_quality_count,'healthy_without_high_alerts',v_healthy,'certified',v_certified,'active_contracts',v_contracts,'overdue_issues',v_overdue);
  insert into governance.project_scorecard_snapshots(project_id,overall_score,dimensions,evidence) values(p_project_id,v_overall,v_dimensions,v_evidence) returning id into v_id;
  return jsonb_build_object('id',v_id,'project_id',p_project_id,'overall_score',v_overall,'dimensions',v_dimensions,'evidence',v_evidence,'calculated_at',now());
end;
$$;

revoke execute on function governance.refresh_project_scorecard(uuid) from public,anon,authenticated;
grant execute on function governance.refresh_project_scorecard(uuid) to service_role;
