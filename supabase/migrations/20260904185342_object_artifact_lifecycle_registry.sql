create table if not exists orchestration.object_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  provider_key text not null,
  bucket text not null,
  object_key text not null,
  content_type text,
  size_bytes bigint,
  retention_until timestamptz,
  lifecycle_status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_error text,
  constraint object_artifacts_provider_not_blank check (btrim(provider_key) <> ''),
  constraint object_artifacts_bucket_not_blank check (btrim(bucket) <> ''),
  constraint object_artifacts_key_not_blank check (btrim(object_key) <> ''),
  constraint object_artifacts_size_nonnegative check (size_bytes is null or size_bytes >= 0),
  constraint object_artifacts_lifecycle_status_check check (lifecycle_status in ('ACTIVE','DELETING','DELETED','FAILED')),
  constraint object_artifacts_project_provider_bucket_key unique (project_id, provider_key, bucket, object_key)
);

create index if not exists object_artifacts_retention_idx
  on orchestration.object_artifacts(lifecycle_status, retention_until)
  where retention_until is not null;
create index if not exists object_artifacts_project_status_idx
  on orchestration.object_artifacts(project_id, lifecycle_status, updated_at desc);

alter table orchestration.object_artifacts enable row level security;
revoke all on orchestration.object_artifacts from public, anon, authenticated;
grant select, insert, update, delete on orchestration.object_artifacts to service_role;
