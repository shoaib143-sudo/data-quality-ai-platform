-- Module 13: governance intelligence must remain transparent, reproducible, and historically evidenced.

create table if not exists governance.governance_risk_prediction_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  prediction_id uuid not null references governance.governance_risk_predictions(id) on delete restrict,
  dataset_id uuid not null references catalog.datasets(id) on delete restrict,
  prediction_type text not null,
  event_type text not null,
  model_version text not null,
  prediction_snapshot jsonb not null,
  model_hash text not null,
  created_at timestamptz not null default now(),
  check(event_type in ('LEGACY_CURRENT_BASELINE','CREATED','REFRESHED'))
);
create index if not exists governance_risk_prediction_events_project_idx
  on governance.governance_risk_prediction_events(project_id,dataset_id,prediction_type,created_at desc,id);

alter table governance.governance_risk_prediction_events enable row level security;
drop policy if exists governance_risk_prediction_events_read on governance.governance_risk_prediction_events;
create policy governance_risk_prediction_events_read on governance.governance_risk_prediction_events
  for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.governance_risk_prediction_events from public,anon,authenticated,service_role;
grant select on governance.governance_risk_prediction_events to authenticated,service_role;

create or replace function governance.governance_intelligence_event_immutable()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
  raise exception 'Governance intelligence history is append-only';
end;
$$;
revoke all on function governance.governance_intelligence_event_immutable() from public,anon,authenticated,service_role;
drop trigger if exists governance_risk_prediction_events_immutable on governance.governance_risk_prediction_events;
create trigger governance_risk_prediction_events_immutable
before update or delete on governance.governance_risk_prediction_events
for each row execute function governance.governance_intelligence_event_immutable();

create or replace function governance.capture_governance_risk_prediction_event()
returns trigger language plpgsql security definer
set search_path='pg_catalog','governance','extensions' as $$
declare
  v_snapshot jsonb;
  v_model_version text;
  v_hash text;
begin
  v_model_version:=coalesce(nullif(new.evidence->>'model_version',''),'UNKNOWN');
  v_snapshot:=jsonb_build_object(
    'horizon_days',new.horizon_days,'probability',new.probability,'risk_level',new.risk_level,'confidence',new.confidence,
    'source_profile_run_id',new.source_profile_run_id,'contributors',new.contributors,'explanation',new.explanation,
    'evidence',new.evidence,'calculated_at',new.calculated_at,'expires_at',new.expires_at
  );
  v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'prediction_id',new.id,'project_id',new.project_id,'dataset_id',new.dataset_id,'prediction_type',new.prediction_type,
    'model_version',v_model_version,'snapshot',v_snapshot
  )::text,'UTF8'),'sha256'),'hex');
  insert into governance.governance_risk_prediction_events(
    project_id,prediction_id,dataset_id,prediction_type,event_type,model_version,prediction_snapshot,model_hash
  ) values(
    new.project_id,new.id,new.dataset_id,new.prediction_type,
    case when tg_op='INSERT' then 'CREATED' else 'REFRESHED' end,
    v_model_version,v_snapshot,v_hash
  );
  return new;
end;
$$;
revoke all on function governance.capture_governance_risk_prediction_event() from public,anon,authenticated,service_role;
drop trigger if exists governance_risk_prediction_history on governance.governance_risk_predictions;
create trigger governance_risk_prediction_history
after insert or update on governance.governance_risk_predictions
for each row execute function governance.capture_governance_risk_prediction_event();

insert into governance.governance_risk_prediction_events(
  project_id,prediction_id,dataset_id,prediction_type,event_type,model_version,prediction_snapshot,model_hash
)
select p.project_id,p.id,p.dataset_id,p.prediction_type,'LEGACY_CURRENT_BASELINE',
  coalesce(nullif(p.evidence->>'model_version',''),'UNKNOWN'),
  jsonb_build_object(
    'horizon_days',p.horizon_days,'probability',p.probability,'risk_level',p.risk_level,'confidence',p.confidence,
    'source_profile_run_id',p.source_profile_run_id,'contributors',p.contributors,'explanation',p.explanation,
    'evidence',p.evidence || jsonb_build_object('history_provenance','LEGACY_CURRENT_BASELINE_NOT_FULL_HISTORY'),
    'calculated_at',p.calculated_at,'expires_at',p.expires_at
  ),
  encode(extensions.digest(convert_to(jsonb_build_object(
    'prediction_id',p.id,'project_id',p.project_id,'dataset_id',p.dataset_id,'prediction_type',p.prediction_type,
    'model_version',coalesce(nullif(p.evidence->>'model_version',''),'UNKNOWN'),
    'snapshot',jsonb_build_object(
      'horizon_days',p.horizon_days,'probability',p.probability,'risk_level',p.risk_level,'confidence',p.confidence,
      'source_profile_run_id',p.source_profile_run_id,'contributors',p.contributors,'explanation',p.explanation,
      'evidence',p.evidence || jsonb_build_object('history_provenance','LEGACY_CURRENT_BASELINE_NOT_FULL_HISTORY'),
      'calculated_at',p.calculated_at,'expires_at',p.expires_at
    )
  )::text,'UTF8'),'sha256'),'hex')
from governance.governance_risk_predictions p
where not exists(select 1 from governance.governance_risk_prediction_events e where e.prediction_id=p.id);

revoke delete,truncate on governance.governance_risk_predictions from service_role;
revoke insert,update,delete on governance.governance_risk_predictions from anon,authenticated;
