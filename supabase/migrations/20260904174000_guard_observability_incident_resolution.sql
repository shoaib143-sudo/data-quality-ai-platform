create or replace function governance.guard_observability_incident_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unresolved_issue_count integer := 0;
  v_active_alert_count integer := 0;
  v_has_response_issues boolean := false;
begin
  if new.status <> 'RESOLVED' then
    return new;
  end if;

  v_has_response_issues := jsonb_typeof(coalesce(new.evidence, '{}'::jsonb)->'remediation_issue_ids') = 'array'
    and jsonb_array_length(coalesce(new.evidence, '{}'::jsonb)->'remediation_issue_ids') > 0;

  if v_has_response_issues then
    select count(*)
      into v_unresolved_issue_count
      from governance.issues i
     where i.id::text in (
       select value
         from jsonb_array_elements_text(coalesce(new.evidence, '{}'::jsonb)->'remediation_issue_ids') as value
     )
       and i.status not in ('RESOLVED', 'CLOSED');
  end if;

  select count(*)
    into v_active_alert_count
    from governance.observability_incident_alerts ia
    join profiling.observability_alerts a on a.id = ia.alert_id
   where ia.incident_id = new.id
     and a.status <> 'RESOLVED';

  if v_unresolved_issue_count > 0 or v_active_alert_count > 0 then
    new.status := case when v_has_response_issues then 'MITIGATING' else 'INVESTIGATING' end;
    new.resolved_at := null;
    new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object(
      'resolution_guard', jsonb_build_object(
        'blocked', true,
        'unresolved_response_issue_count', v_unresolved_issue_count,
        'active_correlated_alert_count', v_active_alert_count,
        'checked_at', now()
      )
    );
  else
    new.evidence := coalesce(new.evidence, '{}'::jsonb) || jsonb_build_object(
      'resolution_guard', jsonb_build_object(
        'blocked', false,
        'unresolved_response_issue_count', 0,
        'active_correlated_alert_count', 0,
        'checked_at', now()
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_observability_incident_resolution on governance.observability_incidents;
create trigger trg_guard_observability_incident_resolution
before update of status on governance.observability_incidents
for each row
execute function governance.guard_observability_incident_resolution();

comment on function governance.guard_observability_incident_resolution() is
'Prevents observability incidents from resolving while governed response work or correlated alerts remain active.';
