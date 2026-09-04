create table if not exists governance.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  document_key text not null,
  document_type text not null check (document_type in ('POLICY','STANDARD','PROCEDURE','REGULATION','FRAMEWORK','GUIDANCE')),
  title text not null,
  summary text,
  content text not null,
  domain text,
  jurisdiction text,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','RETIRED')),
  effective_at timestamptz,
  expires_at timestamptz,
  source_kind text not null default 'SYNTHETIC' check (source_kind in ('SYNTHETIC','INTERNAL','EXTERNAL_REFERENCE')),
  source_url text,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, document_key)
);

create table if not exists governance.knowledge_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  document_id uuid not null references governance.knowledge_documents(id) on delete cascade,
  requirement_key text not null,
  title text not null,
  requirement_text text not null,
  obligation_type text not null default 'CONTROL' check (obligation_type in ('PRINCIPLE','CONTROL','QUALITY_EXPECTATION','PROCESS','EVIDENCE')),
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, requirement_key)
);

create table if not exists governance.critical_data_elements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  cde_key text not null,
  name text not null,
  definition text not null,
  domain text not null,
  criticality text not null default 'HIGH' check (criticality in ('MEDIUM','HIGH','CRITICAL')),
  regulatory_relevance text[] not null default '{}'::text[],
  classification_label_id uuid references governance.classification_labels(id) on delete set null,
  owner_role text,
  steward_role text,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','RETIRED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, cde_key)
);

create table if not exists governance.cde_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  cde_id uuid not null references governance.critical_data_elements(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  column_name text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED','APPROVED','REJECTED')),
  source text not null default 'KNOWLEDGE_BOOTSTRAP',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, cde_id, dataset_id, column_name)
);

create table if not exists governance.knowledge_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_type text not null,
  source_key text not null,
  relationship_type text not null,
  target_type text not null,
  target_key text not null,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'ACTIVE' check (status in ('SUGGESTED','ACTIVE','REJECTED')),
  evidence jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, source_type, source_key, relationship_type, target_type, target_key)
);

create index if not exists idx_knowledge_documents_project_type on governance.knowledge_documents(project_id, document_type, status);
create index if not exists idx_knowledge_requirements_project_document on governance.knowledge_requirements(project_id, document_id);
create index if not exists idx_cdes_project_domain on governance.critical_data_elements(project_id, domain, status);
create index if not exists idx_cde_mappings_dataset on governance.cde_mappings(project_id, dataset_id, column_name);
create index if not exists idx_knowledge_relationships_source on governance.knowledge_relationships(project_id, source_type, source_key);
create index if not exists idx_knowledge_relationships_target on governance.knowledge_relationships(project_id, target_type, target_key);

alter table governance.knowledge_documents enable row level security;
alter table governance.knowledge_requirements enable row level security;
alter table governance.critical_data_elements enable row level security;
alter table governance.cde_mappings enable row level security;
alter table governance.knowledge_relationships enable row level security;

do $$
declare t text;
begin
  foreach t in array array['knowledge_documents','knowledge_requirements','critical_data_elements','cde_mappings','knowledge_relationships'] loop
    execute format('create policy %I on governance.%I for select to authenticated using (app_private.is_project_member(project_id))', t || '_project_read', t);
    execute format('create policy %I on governance.%I for insert to authenticated with check (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update''))', t || '_project_insert', t);
    execute format('create policy %I on governance.%I for update to authenticated using (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update'')) with check (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update''))', t || '_project_update', t);
    execute format('create policy %I on governance.%I for delete to authenticated using (app_private.is_project_member(project_id) and governance.has_project_capability(project_id, (select auth.uid()), ''catalog.update''))', t || '_project_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on governance.knowledge_documents, governance.knowledge_requirements, governance.critical_data_elements, governance.cde_mappings, governance.knowledge_relationships to authenticated;
grant all on governance.knowledge_documents, governance.knowledge_requirements, governance.critical_data_elements, governance.cde_mappings, governance.knowledge_relationships to service_role;

create or replace function governance.search_governance_knowledge_lexical(
  p_project_id uuid,
  p_query text,
  p_limit integer default 25
) returns table (
  object_type text,
  object_key text,
  title text,
  content text,
  metadata jsonb,
  relevance numeric
)
language sql stable security invoker set search_path = '' as $$
with q as (select nullif(trim(p_query),'') query),
candidates(object_type,object_key,title,content,metadata,relevance) as (
  select 'KNOWLEDGE_DOCUMENT'::text,d.document_key,d.title,coalesce(d.summary,'')||E'\n'||d.content,
    jsonb_build_object('document_type',d.document_type,'domain',d.domain,'jurisdiction',d.jurisdiction,'source_url',d.source_url)||d.metadata,
    (case when lower(d.title)=lower(q.query) then 1.0 when d.title ilike '%'||q.query||'%' then 0.9 when d.content ilike '%'||q.query||'%' then 0.7 else 0.0 end)::numeric
  from governance.knowledge_documents d cross join q
  where d.project_id=p_project_id and d.status='ACTIVE' and q.query is not null
    and (d.title ilike '%'||q.query||'%' or coalesce(d.summary,'') ilike '%'||q.query||'%' or d.content ilike '%'||q.query||'%')
  union all
  select 'KNOWLEDGE_REQUIREMENT',r.requirement_key,r.title,r.requirement_text,
    jsonb_build_object('obligation_type',r.obligation_type,'priority',r.priority,'document_id',r.document_id)||r.metadata,
    (case when lower(r.title)=lower(q.query) then 1.0 when r.title ilike '%'||q.query||'%' then 0.9 else 0.75 end)::numeric
  from governance.knowledge_requirements r cross join q
  where r.project_id=p_project_id and q.query is not null
    and (r.title ilike '%'||q.query||'%' or r.requirement_text ilike '%'||q.query||'%')
  union all
  select 'GLOSSARY_TERM',g.id::text,g.term,g.definition,
    jsonb_build_object('domain',g.domain,'synonyms',g.synonyms,'status',g.status)||g.metadata,
    (case when lower(g.term)=lower(q.query) then 1.0 when g.term ilike '%'||q.query||'%' then 0.95 else 0.72 end)::numeric
  from governance.glossary_terms g cross join q
  where g.project_id=p_project_id and g.status<>'DEPRECATED' and q.query is not null
    and (g.term ilike '%'||q.query||'%' or g.definition ilike '%'||q.query||'%' or array_to_string(g.synonyms,' ') ilike '%'||q.query||'%')
  union all
  select 'CRITICAL_DATA_ELEMENT',c.cde_key,c.name,c.definition,
    jsonb_build_object('domain',c.domain,'criticality',c.criticality,'regulatory_relevance',c.regulatory_relevance,'owner_role',c.owner_role,'steward_role',c.steward_role)||c.metadata,
    (case when lower(c.name)=lower(q.query) then 1.0 when c.name ilike '%'||q.query||'%' then 0.95 else 0.74 end)::numeric
  from governance.critical_data_elements c cross join q
  where c.project_id=p_project_id and c.status='ACTIVE' and q.query is not null
    and (c.name ilike '%'||q.query||'%' or c.definition ilike '%'||q.query||'%' or c.cde_key ilike '%'||q.query||'%')
)
select object_type,object_key,title,content,metadata,relevance
from candidates
order by relevance desc,title
limit greatest(1,least(coalesce(p_limit,25),100));
$$;

grant execute on function governance.search_governance_knowledge_lexical(uuid,text,integer) to authenticated, service_role;
