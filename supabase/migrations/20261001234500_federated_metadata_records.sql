begin;

create table if not exists governance.federated_metadata_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_catalog text not null,
  external_id text not null,
  canonical_key text not null,
  authority text not null check (authority in ('SOURCE','EXTERNAL_CATALOG','DATANEXUS')),
  asset_type text not null,
  namespace text,
  name text not null,
  description text,
  owners text[] not null default '{}',
  tags text[] not null default '{}',
  classifications text[] not null default '{}',
  source_url text,
  observed_at timestamptz,
  attributes jsonb not null default '{}'::jsonb,
  conflict_state text not null default 'CLEAR' check (conflict_state in ('CLEAR','CONFLICT')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,source_catalog,external_id)
);

create index if not exists federated_metadata_records_project_idx
  on governance.federated_metadata_records(project_id,last_seen_at desc);
create index if not exists federated_metadata_records_canonical_idx
  on governance.federated_metadata_records(project_id,canonical_key);
create index if not exists federated_metadata_records_conflict_idx
  on governance.federated_metadata_records(project_id,conflict_state,last_seen_at desc);

alter table governance.federated_metadata_records enable row level security;
drop policy if exists federated_metadata_records_select on governance.federated_metadata_records;
create policy federated_metadata_records_select
on governance.federated_metadata_records
for select to authenticated
using(app_private.is_project_member(project_id));

grant select on governance.federated_metadata_records to authenticated;
grant all on governance.federated_metadata_records to service_role;

select pg_notify('pgrst','reload schema');
commit;
