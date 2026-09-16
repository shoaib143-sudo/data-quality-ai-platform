create table if not exists catalog.storage_objects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  provider text not null check (provider in ('supabase','r2')),
  bucket text not null check (length(trim(bucket)) > 0),
  object_key text not null check (length(trim(object_key)) > 0),
  object_type text not null default 'DATASET_SOURCE',
  owner_type text not null default 'UPLOAD',
  owner_id uuid null,
  original_filename text null,
  content_type text null,
  expected_size_bytes bigint null check (expected_size_bytes is null or expected_size_bytes >= 0),
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  checksum_algorithm text null check (checksum_algorithm is null or checksum_algorithm = 'sha256'),
  checksum text null,
  etag text null,
  state text not null default 'PENDING' check (state in ('PENDING','UPLOADING','UPLOADED','VERIFYING','READY','FAILED','QUARANTINED','DELETED')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz null,
  deleted_at timestamptz null,
  constraint storage_objects_provider_bucket_key_key unique (provider, bucket, object_key),
  constraint storage_objects_sha256_check check (
    checksum is null or (
      checksum_algorithm = 'sha256'
      and checksum ~ '^[0-9a-f]{64}$'
    )
  )
);

create index if not exists idx_storage_objects_project_state
  on catalog.storage_objects(project_id, state);
create index if not exists idx_storage_objects_owner
  on catalog.storage_objects(owner_type, owner_id)
  where owner_id is not null;

alter table catalog.storage_objects enable row level security;

create policy storage_objects_select on catalog.storage_objects
  for select to authenticated
  using ((select app_private.is_project_member(project_id)));

create policy storage_objects_insert on catalog.storage_objects
  for insert to authenticated
  with check ((select app_private.is_project_admin(project_id)));

create policy storage_objects_update on catalog.storage_objects
  for update to authenticated
  using ((select app_private.is_project_admin(project_id)))
  with check ((select app_private.is_project_admin(project_id)));

create policy storage_objects_delete on catalog.storage_objects
  for delete to authenticated
  using ((select app_private.is_project_admin(project_id)));

alter table catalog.dataset_versions
  add column if not exists storage_object_id uuid null;

alter table catalog.dataset_versions
  drop constraint if exists dataset_versions_storage_object_id_fkey;
alter table catalog.dataset_versions
  add constraint dataset_versions_storage_object_id_fkey
  foreign key (storage_object_id)
  references catalog.storage_objects(id)
  on delete restrict;

create index if not exists idx_dataset_versions_storage_object_id
  on catalog.dataset_versions(storage_object_id)
  where storage_object_id is not null;

comment on table catalog.storage_objects is
  'Application-owned provider-neutral object registry. Do not use Supabase internal storage schema as domain metadata.';
comment on column catalog.dataset_versions.storage_object_id is
  'Optional provider-neutral reference to catalog.storage_objects for file/object-backed dataset versions.';
