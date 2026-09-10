create table if not exists governance.embedding_spaces (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null check (length(trim(provider_id)) between 1 and 128),
  model_name text not null check (length(trim(model_name)) between 1 and 256),
  model_revision text not null check (length(trim(model_revision)) between 1 and 128),
  dimensions integer not null check (dimensions between 1 and 65535),
  distance_metric text not null check (distance_metric in ('COSINE')),
  normalization text not null check (normalization in ('L2')),
  created_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  unique (provider_id, model_name, model_revision, dimensions, distance_metric, normalization)
);

alter table governance.embedding_spaces enable row level security;
revoke all on table governance.embedding_spaces from public, anon, authenticated;
grant select, insert on table governance.embedding_spaces to service_role;

create or replace function governance.reject_embedding_space_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, governance
as $$
begin
  raise exception 'Embedding-space identity is immutable; publish a new space instead.' using errcode = '55000';
end;
$$;

revoke execute on function governance.reject_embedding_space_mutation() from public, anon, authenticated;
grant execute on function governance.reject_embedding_space_mutation() to service_role;

drop trigger if exists embedding_spaces_immutable on governance.embedding_spaces;
create trigger embedding_spaces_immutable
before update or delete on governance.embedding_spaces
for each row execute function governance.reject_embedding_space_mutation();

alter table governance.semantic_embeddings
  add column if not exists embedding_space_id uuid;

insert into governance.embedding_spaces (
  provider_id,
  model_name,
  model_revision,
  dimensions,
  distance_metric,
  normalization,
  evidence
)
select distinct
  case when lower(trim(e.embedding_model)) = 'gte-small' then 'supabase_ai' else 'legacy_unverified' end,
  trim(e.embedding_model),
  trim(e.embedding_version),
  384,
  'COSINE',
  'L2',
  jsonb_build_object(
    'source', 'semantic_embeddings_backfill',
    'model', trim(e.embedding_model),
    'revision', trim(e.embedding_version)
  )
from governance.semantic_embeddings e
where e.embedding_space_id is null
on conflict (provider_id, model_name, model_revision, dimensions, distance_metric, normalization) do nothing;

update governance.semantic_embeddings e
set embedding_space_id = s.id
from governance.embedding_spaces s
where e.embedding_space_id is null
  and s.provider_id = case when lower(trim(e.embedding_model)) = 'gte-small' then 'supabase_ai' else 'legacy_unverified' end
  and s.model_name = trim(e.embedding_model)
  and s.model_revision = trim(e.embedding_version)
  and s.dimensions = 384
  and s.distance_metric = 'COSINE'
  and s.normalization = 'L2';

do $$
begin
  if exists (select 1 from governance.semantic_embeddings where embedding_space_id is null) then
    raise exception 'Unable to resolve an embedding space for every existing semantic embedding.' using errcode = '23514';
  end if;
end;
$$;

alter table governance.semantic_embeddings
  alter column embedding_space_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'governance.semantic_embeddings'::regclass
      and conname = 'semantic_embeddings_embedding_space_id_fkey'
  ) then
    alter table governance.semantic_embeddings
      add constraint semantic_embeddings_embedding_space_id_fkey
      foreign key (embedding_space_id)
      references governance.embedding_spaces(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists semantic_embeddings_space_project_type_idx
  on governance.semantic_embeddings (embedding_space_id, project_id, object_type);

create or replace function governance.match_semantic_embeddings_in_space(
  p_project_id uuid,
  p_embedding_space_id uuid,
  p_query_embedding vector,
  p_object_types text[] default null,
  p_match_threshold real default 0.35,
  p_match_count integer default 25
)
returns table(
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
set search_path = pg_catalog, governance, extensions
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
    and e.embedding_space_id = p_embedding_space_id
    and (p_object_types is null or e.object_type = any(p_object_types))
    and (1 - (e.embedding <=> p_query_embedding)) >= p_match_threshold
  order by e.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 25), 100));
$$;

revoke execute on function governance.match_semantic_embeddings_in_space(uuid, uuid, vector, text[], real, integer) from public, anon;
grant execute on function governance.match_semantic_embeddings_in_space(uuid, uuid, vector, text[], real, integer) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
