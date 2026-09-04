-- Incident response SLA and escalation state.

alter table governance.observability_incidents
  add column if not exists acknowledged_at timestamptz,
  add column if not exists response_due_at timestamptz,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists last_escalated_at timestamptz;

alter table governance.observability_incidents
  drop constraint if exists observability_incidents_escalation_level_check;
alter table governance.observability_incidents
  add constraint observability_incidents_escalation_level_check check (escalation_level between 0 and 5);

create index if not exists observability_incidents_sla_due_idx
  on governance.observability_incidents(response_due_at,status)
  where status <> 'RESOLVED';

create or replace function governance.set_observability_incident_sla()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_due timestamptz;
begin
  if new.status = 'RESOLVED' then
    return new;
  end if;

  v_due := now() + case upper(coalesce(new.severity,'MEDIUM'))
    when 'CRITICAL' then interval '30 minutes'
    when 'HIGH' then interval '2 hours'
    when 'MEDIUM' then interval '8 hours'
    else interval '24 hours'
  end;

  if new.response_due_at is null then
    new.response_due_at := v_due;
  elsif tg_op = 'UPDATE' and new.severity is distinct from old.severity then
    new.response_due_at := least(new.response_due_at, v_due);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_observability_incident_sla on governance.observability_incidents;
create trigger trg_set_observability_incident_sla
before insert or update of severity,status on governance.observability_incidents
for each row execute function governance.set_observability_incident_sla();

update governance.observability_incidents
set response_due_at = coalesce(response_due_at,
  first_observed_at + case upper(coalesce(severity,'MEDIUM'))
    when 'CRITICAL' then interval '30 minutes'
    when 'HIGH' then interval '2 hours'
    when 'MEDIUM' then interval '8 hours'
    else interval '24 hours'
  end)
where status <> 'RESOLVED' and response_due_at is null;

select pg_notify('pgrst','reload schema');
