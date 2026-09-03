create or replace function profiling.store_notification_secret(p_channel_id uuid,p_secret text)
returns text language plpgsql security definer set search_path=pg_catalog,profiling,vault as $$
declare v_ref text; v_existing uuid;
begin
  if p_secret is null or btrim(p_secret)='' then raise exception 'Notification secret is required'; end if;
  if not exists(select 1 from profiling.notification_channels where id=p_channel_id) then raise exception 'Notification channel not found'; end if;
  v_ref:='DGP_NOTIFY_'||replace(p_channel_id::text,'-','_');
  select id into v_existing from vault.secrets where name=v_ref limit 1;
  if v_existing is null then perform vault.create_secret(p_secret,v_ref,'Encrypted notification endpoint');
  else perform vault.update_secret(v_existing,p_secret,v_ref,'Encrypted notification endpoint'); end if;
  update profiling.notification_channels set secret_ref=v_ref where id=p_channel_id;
  return v_ref;
end; $$;
revoke execute on function profiling.store_notification_secret(uuid,text) from public,anon,authenticated;
grant execute on function profiling.store_notification_secret(uuid,text) to service_role;

create or replace function profiling.get_notification_secret(p_ref text)
returns text language sql security definer set search_path=pg_catalog,vault as $$
  select decrypted_secret from vault.decrypted_secrets where name=p_ref limit 1
$$;
revoke execute on function profiling.get_notification_secret(text) from public,anon,authenticated;
grant execute on function profiling.get_notification_secret(text) to service_role;

create or replace function profiling.refresh_observability_freshness_alerts()
returns integer language plpgsql security definer set search_path = pg_catalog, profiling, catalog, app as $function$
declare v_now timestamptz := now(); v_count integer := 0;
begin
  with latest_evidence as (
    select d.id dataset_id,d.project_id,dv.id dataset_version_id,pr.id profile_run_id,
           coalesce(pr.completed_at,pr.started_at) evidence_at,
           coalesce(op.freshness_sla_hours,24) freshness_sla_hours,
           row_number() over(partition by d.id order by coalesce(pr.completed_at,pr.started_at) desc nulls last) rn
    from catalog.datasets d
    left join profiling.observability_policies op on op.dataset_id=d.id and op.enabled=true
    left join catalog.dataset_versions dv on dv.dataset_id=d.id
    left join profiling.profile_runs pr on pr.dataset_version_id=dv.id and pr.status='COMPLETED'
  ),
  stale as (
    select d.id dataset_id,d.project_id,le.dataset_version_id,le.profile_run_id,le.evidence_at,
           coalesce(le.freshness_sla_hours,24) freshness_sla_hours
    from catalog.datasets d
    left join latest_evidence le on le.dataset_id=d.id and le.rn=1
    where le.evidence_at is null
       or le.evidence_at < v_now - make_interval(hours=>coalesce(le.freshness_sla_hours,24))
  )
  insert into profiling.observability_alerts(project_id,dataset_id,dataset_version_id,profile_run_id,category,severity,title,description,fingerprint,evidence,status,first_observed_at,last_observed_at,updated_at)
  select s.project_id,s.dataset_id,s.dataset_version_id,s.profile_run_id,'FRESHNESS',
         case when s.evidence_at is null or s.evidence_at < v_now - make_interval(hours=>s.freshness_sla_hours*3) then 'HIGH' else 'MEDIUM' end,
         d.name||' governance evidence is stale',
         case when s.evidence_at is null then 'No completed profiling evidence is available for this governed dataset.'
              else format('Latest completed profiling evidence exceeds the configured %s hour SLA.',s.freshness_sla_hours) end,
         'freshness:'||s.dataset_id::text,
         jsonb_build_object('latest_profile_run_id',s.profile_run_id,'latest_evidence_at',s.evidence_at,'freshness_basis','completed_profiling_evidence','threshold_hours',s.freshness_sla_hours),
         'OPEN',v_now,v_now,v_now
  from stale s join catalog.datasets d on d.id=s.dataset_id
  on conflict(project_id,fingerprint) do update set dataset_version_id=excluded.dataset_version_id,profile_run_id=excluded.profile_run_id,severity=excluded.severity,title=excluded.title,description=excluded.description,evidence=excluded.evidence,status='OPEN',last_observed_at=excluded.last_observed_at,resolved_at=null,updated_at=excluded.updated_at;
  get diagnostics v_count=row_count;

  update profiling.observability_alerts oa
  set status='RESOLVED',resolved_at=v_now,updated_at=v_now
  where oa.category='FRESHNESS' and oa.status<>'RESOLVED'
    and exists(
      select 1
      from catalog.dataset_versions dv
      join profiling.profile_runs pr on pr.dataset_version_id=dv.id
      left join profiling.observability_policies op on op.dataset_id=dv.dataset_id and op.enabled=true
      where dv.dataset_id=oa.dataset_id and pr.status='COMPLETED'
        and coalesce(pr.completed_at,pr.started_at)>=v_now-make_interval(hours=>coalesce(op.freshness_sla_hours,24))
    );
  return v_count;
end;
$function$;
select pg_notify('pgrst','reload schema');
