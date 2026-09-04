-- Supabase advisor hardening for semantic governance and transformation-aware lineage.
-- Keeps semantic similarity queries under caller RLS and removes overlapping SELECT policies.

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
security invoker
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
    and (p_object_types is null or e.object_type = any(p_object_types))
    and (1 - (e.embedding <=> p_query_embedding)) >= p_match_threshold
  order by e.embedding <=> p_query_embedding
  limit greatest(1,least(coalesce(p_match_count,25),100));
$$;

revoke execute on function governance.match_semantic_embeddings(uuid,extensions.vector,text[],real,integer) from public,anon;
grant execute on function governance.match_semantic_embeddings(uuid,extensions.vector,text[],real,integer) to authenticated,service_role;

drop policy if exists semantic_embeddings_project_manage on governance.semantic_embeddings;
drop policy if exists semantic_embeddings_project_insert on governance.semantic_embeddings;
drop policy if exists semantic_embeddings_project_update on governance.semantic_embeddings;
drop policy if exists semantic_embeddings_project_delete on governance.semantic_embeddings;

create policy semantic_embeddings_project_insert
  on governance.semantic_embeddings
  for insert to authenticated
  with check (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')
  );

create policy semantic_embeddings_project_update
  on governance.semantic_embeddings
  for update to authenticated
  using (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')
  )
  with check (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')
  );

create policy semantic_embeddings_project_delete
  on governance.semantic_embeddings
  for delete to authenticated
  using (
    app_private.is_project_member(project_id)
    and governance.has_project_capability(project_id,(select auth.uid()),'catalog.update')
  );

create index if not exists lineage_transformations_integration_idx
  on governance.lineage_transformations(integration_id)
  where integration_id is not null;

create index if not exists lineage_column_mappings_project_idx
  on governance.lineage_column_mappings(project_id);

create index if not exists lineage_column_mappings_source_asset_idx
  on governance.lineage_column_mappings(source_asset_id)
  where source_asset_id is not null;

create index if not exists lineage_column_mappings_target_asset_idx
  on governance.lineage_column_mappings(target_asset_id)
  where target_asset_id is not null;

select pg_notify('pgrst','reload schema');
