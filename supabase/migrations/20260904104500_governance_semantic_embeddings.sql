create extension if not exists vector with schema extensions;

create table if not exists governance.semantic_embeddings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  object_type text not null,
  object_key text not null,
  object_id uuid,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(384) not null,
  embedding_model text not null default 'all-MiniLM-L6-v2',
  embedding_version text not null default '1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,object_type,object_key,embedding_model,embedding_version)
);

create index if not exists semantic_embeddings_project_type_idx
  on governance.semantic_embeddings(project_id,object_type);

create index if not exists semantic_embeddings_object_idx
  on governance.semantic_embeddings(object_type,object_id)
  where object_id is not null;

create index if not exists semantic_embeddings_vector_idx
  on governance.semantic_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

alter table governance.semantic_embeddings enable row level security;

drop policy if exists semantic_embeddings_project_read on governance.semantic_embeddings;
create policy semantic_embeddings_project_read
  on governance.semantic_embeddings
  for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists semantic_embeddings_project_manage on governance.semantic_embeddings;
create policy semantic_embeddings_project_manage
  on governance.semantic_embeddings
  for all to authenticated
  using (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,auth.uid(),'catalog.update')
  )
  with check (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,auth.uid(),'catalog.update')
  );

grant select,insert,update,delete on governance.semantic_embeddings to authenticated;
grant all on governance.semantic_embeddings to service_role;

create or replace function governance.match_semantic_embeddings(
  p_project_id uuid,
  p_query_embedding extensions.vector(384),
  p_object_types text[] default null,
  p_match_threshold real default 0.35,
  p_match_count integer default 25
)
returns table (
  id uuid,
  object_type text,
  object_key text,
  object_id uuid,
  content text,
  metadata jsonb,
  similarity real
)
language sql
stable
security definer
set search_path=pg_catalog,governance,extensions
as $$
  select
    e.id,
    e.object_type,
    e.object_key,
    e.object_id,
    e.content,
    e.metadata,
    (1 - (e.embedding <=> p_query_embedding))::real as similarity
  from governance.semantic_embeddings e
  where e.project_id = p_project_id
    and app_private.is_project_member(e.project_id)
    and (p_object_types is null or e.object_type = any(p_object_types))
    and (1 - (e.embedding <=> p_query_embedding)) >= p_match_threshold
  order by e.embedding <=> p_query_embedding
  limit greatest(1,least(coalesce(p_match_count,25),100));
$$;

revoke execute on function governance.match_semantic_embeddings(uuid,extensions.vector,text[],real,integer) from public,anon;
grant execute on function governance.match_semantic_embeddings(uuid,extensions.vector,text[],real,integer) to authenticated,service_role;

comment on table governance.semantic_embeddings is
'Provider-neutral semantic index for governed datasets, columns, glossary terms, policies, findings, documents and lineage transformations.';
