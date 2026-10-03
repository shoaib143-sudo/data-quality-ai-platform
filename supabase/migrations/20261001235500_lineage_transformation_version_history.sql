begin;

create table if not exists governance.lineage_transformation_history (
  id uuid primary key default gen_random_uuid(),
  transformation_id uuid not null references governance.lineage_transformations(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  version_number integer not null check(version_number>0),
  integration_id uuid,
  external_id text not null,
  source_system text not null,
  name text,
  operation text not null,
  logic_language text,
  transformation_logic text,
  logic_hash text,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  change_type text not null default 'OBSERVED' check(change_type in ('OBSERVED','CHANGED')),
  unique(transformation_id,version_number)
);

create index if not exists lineage_transformation_history_project_idx
  on governance.lineage_transformation_history(project_id,observed_at desc);
create index if not exists lineage_transformation_history_transformation_idx
  on governance.lineage_transformation_history(transformation_id,version_number desc);

insert into governance.lineage_transformation_history(
  transformation_id,project_id,version_number,integration_id,external_id,source_system,name,operation,
  logic_language,transformation_logic,logic_hash,metadata,observed_at,change_type
)
select id,project_id,1,integration_id,external_id,source_system,name,operation,logic_language,
       transformation_logic,logic_hash,metadata,coalesce(first_seen_at,now()),'OBSERVED'
from governance.lineage_transformations t
where not exists(
  select 1 from governance.lineage_transformation_history h where h.transformation_id=t.id
);

create or replace function governance.capture_lineage_transformation_history()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_next integer;
  v_changed boolean;
begin
  if tg_op='UPDATE' then
    v_changed :=
      old.source_system is distinct from new.source_system or
      old.name is distinct from new.name or
      old.operation is distinct from new.operation or
      old.logic_language is distinct from new.logic_language or
      old.transformation_logic is distinct from new.transformation_logic or
      old.logic_hash is distinct from new.logic_hash or
      old.metadata is distinct from new.metadata;
    if not v_changed then return new; end if;
  end if;

  select coalesce(max(version_number),0)+1 into v_next
  from governance.lineage_transformation_history
  where transformation_id=new.id;

  insert into governance.lineage_transformation_history(
    transformation_id,project_id,version_number,integration_id,external_id,source_system,name,operation,
    logic_language,transformation_logic,logic_hash,metadata,observed_at,change_type
  )
  values(
    new.id,new.project_id,v_next,new.integration_id,new.external_id,new.source_system,new.name,new.operation,
    new.logic_language,new.transformation_logic,new.logic_hash,coalesce(new.metadata,'{}'::jsonb),now(),
    case when tg_op='INSERT' then 'OBSERVED' else 'CHANGED' end
  );
  return new;
end;
$$;

drop trigger if exists lineage_transformation_version_history on governance.lineage_transformations;
create trigger lineage_transformation_version_history
after insert or update on governance.lineage_transformations
for each row execute function governance.capture_lineage_transformation_history();

alter table governance.lineage_transformation_history enable row level security;
drop policy if exists lineage_transformation_history_select on governance.lineage_transformation_history;
create policy lineage_transformation_history_select
on governance.lineage_transformation_history
for select to authenticated
using(app_private.is_project_member(project_id));

grant select on governance.lineage_transformation_history to authenticated;
grant all on governance.lineage_transformation_history to service_role;
revoke all on function governance.capture_lineage_transformation_history() from public,anon,authenticated;

select pg_notify('pgrst','reload schema');
commit;
