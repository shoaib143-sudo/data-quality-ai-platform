create table if not exists governance.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  source_uri text not null,
  file_name text,
  file_type text not null,
  content_type text,
  content_hash text not null,
  extraction_method text,
  character_count bigint not null default 0 check (character_count >= 0),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,dataset_version_id,source_uri)
);

create table if not exists governance.document_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  document_id uuid not null references governance.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 1),
  content text not null check (length(btrim(content)) > 0),
  content_hash text not null,
  character_count integer not null check (character_count >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(document_id,chunk_index)
);

create index if not exists governance_documents_project_dataset_idx
  on governance.documents(project_id,dataset_id,dataset_version_id);
create index if not exists governance_documents_content_hash_idx
  on governance.documents(project_id,content_hash);
create index if not exists governance_documents_profile_run_idx
  on governance.documents(profile_run_id)
  where profile_run_id is not null;
create index if not exists governance_document_chunks_project_document_idx
  on governance.document_chunks(project_id,document_id,chunk_index);
create index if not exists governance_document_chunks_content_hash_idx
  on governance.document_chunks(content_hash);

alter table governance.documents enable row level security;
alter table governance.document_chunks enable row level security;

drop policy if exists governance_documents_project_read on governance.documents;
create policy governance_documents_project_read
  on governance.documents for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists governance_documents_project_manage on governance.documents;
create policy governance_documents_project_manage
  on governance.documents for all to authenticated
  using (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,auth.uid(),'catalog.update')
  )
  with check (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,auth.uid(),'catalog.update')
  );

drop policy if exists governance_document_chunks_project_read on governance.document_chunks;
create policy governance_document_chunks_project_read
  on governance.document_chunks for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists governance_document_chunks_project_manage on governance.document_chunks;
create policy governance_document_chunks_project_manage
  on governance.document_chunks for all to authenticated
  using (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,auth.uid(),'catalog.update')
  )
  with check (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,auth.uid(),'catalog.update')
  );

grant select,insert,update,delete on governance.documents,governance.document_chunks to authenticated;
grant all on governance.documents,governance.document_chunks to service_role;

comment on table governance.documents is
'Durable governed source-document registry for extracted PDF, Office, spreadsheet and image content used by profiling and semantic retrieval.';
comment on table governance.document_chunks is
'Normalized text chunks extracted from governed documents and retained for semantic indexing and evidence retrieval.';

select pg_notify('pgrst','reload schema');
